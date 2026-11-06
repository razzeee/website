"""Appraise lifecycle. All writes are isolated from human quality decisions."""

import hashlib
import json
import logging
import os
import signal
import struct
import subprocess
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal, cast
from urllib.parse import urlsplit
from uuid import uuid4

import requests
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from redis import Redis, WatchError

from .config import settings
from .database import get_db
from .models import App

logger = logging.getLogger(__name__)
ACTIVE = ("queued", "running")
ICON_CRITERIA = {
    "app-icon-footprint",
    "app-icon-contrast",
    "app-icon-detail",
    "app-icon-no-baked-in-shadows",
    "app-icon-in-line-with-contemporary-styles",
}
LEARNED_CRITERIA = ICON_CRITERIA | {
    "app-name-just-the-name",
    "app-no-weird-formatting",
    "app-summary-not-technical",
    "app-summary-no-weird-formatting",
    "app-summary-dont-repeat-app-name",
    "app-summary-dont-start-with-an-article",
    "branding-good-primary-brand-colors",
}
RULE_CRITERIA = {
    "app-name-not-too-long",
    "app-summary-not-too-long",
    "branding-has-primary-brand-colors",
}
MAX_ICON_BYTES = 16 * 1024 * 1024
TTL = 3600
PREFIX = "quality-analysis:"
ACTIVE_KEY = PREFIX + "active"
store = Redis(host=settings.redis_state_host, port=settings.redis_state_port, db=1)


class AnalysisCriterion(BaseModel):
    model_config = ConfigDict(extra="allow", strict=True)
    method: Literal["model"] | None = None
    pass_score: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    calibrated: bool | None = None
    unavailable: str | None = None

    @model_validator(mode="after")
    def valid_state(self):
        if self.unavailable:
            if self.pass_score is not None or self.calibrated is not None:
                raise ValueError("Unavailable criteria cannot contain scores")
        elif (
            self.method != "model" or self.pass_score is None or self.calibrated is None
        ):
            raise ValueError("Model criteria require a score and calibration status")
        return self


class QualityAnalysisResponse(BaseModel):
    state: Literal[
        "disabled", "not_requested", "queued", "running", "completed", "failed"
    ]
    id: str | None = None
    created_at: datetime | None = None
    captured_at: datetime | None = None
    completed_at: datetime | None = None
    icon_verified_at: datetime | None = None
    has_icon: bool = False
    stale: bool = False
    stale_reasons: list[str] = Field(default_factory=list)
    error_code: str | None = None
    identity: dict[str, str] | None = None
    snapshot: dict[str, Any] | None = None
    criteria: dict[str, AnalysisCriterion] = Field(default_factory=dict)
    result: dict[str, Any] | None = None


def identity() -> dict[str, str]:
    return {
        "appraise": "0.2.2",
        "bundle": settings.quality_analysis_bundle,
        "encoder": settings.quality_analysis_encoder_revision,
        "input_schema": "1",
        "adapter_schema": "1",
    }


def metadata(app: App) -> dict[str, Any]:
    source = app.appstream or {}
    return {
        "name": source.get("name") or "",
        "summary": source.get("summary") or "",
        "branding": source.get("branding") or [],
        "icon": source.get("icon"),
    }


def require_app(db, app_id: str) -> App:
    app = App.by_appid(db, app_id)
    if not app or not app.appstream:
        raise HTTPException(404, "App not found")
    if app.excluded_from_app_picks:
        raise HTTPException(404, "App excluded from app picks")
    return app


def response(row: dict[str, Any], app: App) -> QualityAnalysisResponse:
    reasons = []
    if row["identity"] != identity():
        reasons.append("model_changed")
    if row.get("snapshot") is not None and row["snapshot"] != metadata(app):
        reasons.append("metadata_changed")
    return QualityAnalysisResponse(
        **{
            key: value
            for key, value in row.items()
            if key in QualityAnalysisResponse.model_fields
            and key not in ("criteria", "stale", "stale_reasons")
        },
        stale=bool(reasons),
        stale_reasons=reasons,
        criteria={
            key: AnalysisCriterion.model_validate(value)
            for key, value in (row.get("result") or {}).get("criteria", {}).items()
            if key in LEARNED_CRITERIA
        },
    )


def read_analysis(app_id: str) -> QualityAnalysisResponse:
    with get_db("writer") as db:
        app = require_app(db, app_id)
        if not settings.quality_analysis_enabled:
            return QualityAnalysisResponse(state="disabled")
        latest = cast("bytes | None", store.get(PREFIX + "app:" + app_id))
        raw = store.hget(PREFIX + "job:" + latest.decode(), "data") if latest else None
        row = json.loads(raw) if raw else None
        return (
            response(row, app)
            if row
            else QualityAnalysisResponse(state="not_requested")
        )


def enqueue(analysis_id: str):
    from .quality_analysis_tasks import run_quality_analysis

    try:
        run_quality_analysis.send(analysis_id)
    except Exception:  # noqa: BLE001 -- broker errors must not expose internals
        update_job(analysis_id, "queued", state="failed", error_code="dispatch_failed")
        logger.warning("Quality analysis enqueue failed")


def request_analysis(app_id: str, moderator_id: int) -> QualityAnalysisResponse:
    with get_db("writer") as db:
        app = require_app(db, app_id)
        if not settings.quality_analysis_enabled:
            return QualityAnalysisResponse(state="disabled")
        latest_key = PREFIX + "app:" + app_id
        rate_key = PREFIX + "moderator:" + str(moderator_id)
        while True:
            with store.pipeline() as pipe:
                try:
                    pipe.watch(ACTIVE_KEY, latest_key, rate_key)
                    latest = cast("bytes | None", pipe.get(latest_key))
                    old_key = PREFIX + "job:" + latest.decode() if latest else None
                    if old_key:
                        pipe.watch(old_key)
                    raw = pipe.hget(old_key, "data") if old_key else None
                    old = json.loads(raw) if raw else None
                    if old and old["state"] in ACTIVE:
                        return response(old, app)
                    now = time.time()
                    pending = pipe.zcount(ACTIVE_KEY, now, "+inf")
                    recent = pipe.zcount(rate_key, now - 60, "+inf")
                    if recent >= 5 or pending >= settings.quality_analysis_queue_limit:
                        raise HTTPException(
                            429,
                            "Analysis request limit reached",
                            headers={"Retry-After": "60"},
                        )
                    analysis_id = str(uuid4())
                    row = {
                        "id": analysis_id,
                        "app_id": app_id,
                        "state": "queued",
                        "identity": identity(),
                        "created_at": datetime.now(UTC).isoformat(),
                    }
                    key = PREFIX + "job:" + analysis_id
                    pipe.multi()
                    if old_key:
                        pipe.delete(old_key)
                    pipe.hset(key, "data", json.dumps(row))
                    pipe.expire(key, TTL)
                    pipe.set(latest_key, analysis_id, ex=TTL)
                    pipe.zremrangebyscore(ACTIVE_KEY, "-inf", now)
                    pipe.zadd(ACTIVE_KEY, {analysis_id: now + TTL})
                    pipe.expire(ACTIVE_KEY, TTL)
                    pipe.zremrangebyscore(rate_key, "-inf", now - 60)
                    pipe.zadd(rate_key, {analysis_id: now})
                    pipe.expire(rate_key, 60)
                    pipe.execute()
                    break
                except WatchError:
                    continue
        result = response(row, app)
    assert result.id is not None
    enqueue(result.id)
    return result


def update_job(
    analysis_id: str, expected: str, *, icon: bytes | None = None, **changes
) -> dict[str, Any] | None:
    """Compare-and-set without extending expiry or resurrecting expired jobs."""
    key = PREFIX + "job:" + analysis_id
    while True:
        with store.pipeline() as pipe:
            try:
                pipe.watch(key)
                raw = pipe.hget(key, "data")
                row = json.loads(raw) if raw else None
                if not row or row["state"] != expected:
                    return None
                row.update(changes)
                if row["state"] in ("completed", "failed"):
                    row["completed_at"] = datetime.now(UTC).isoformat()
                pipe.multi()
                pipe.hset(key, "data", json.dumps(row))
                if icon is not None:
                    pipe.hset(key, "icon", icon)
                if row["state"] not in ACTIVE:
                    pipe.zrem(ACTIVE_KEY, analysis_id)
                pipe.execute()
                return row
            except WatchError:
                continue


def fetch_icon(url: str | None) -> bytes | None:
    if not url:
        return None
    parsed = urlsplit(url)
    canonical = urlsplit(settings.repo_url)
    # Only catalog assets on our configured repository; no redirects or supplied URLs.
    repository_asset = parsed.netloc == canonical.netloc and parsed.path.startswith(
        canonical.path.rstrip("/") + "/appstream/"
    )
    media_asset = parsed.netloc == "dl.flathub.org" and parsed.path.startswith(
        "/media/"
    )
    if parsed.scheme != "https" or not (repository_asset or media_asset):
        raise ValueError("Invalid canonical icon URL")
    started = time.monotonic()
    with requests.get(url, stream=True, timeout=(5, 10), allow_redirects=False) as res:
        if res.status_code != 200:
            res.raise_for_status()
            raise ValueError("Unexpected icon response")
        content = bytearray()
        for chunk in res.iter_content(65536):
            content.extend(chunk)
            if len(content) > MAX_ICON_BYTES or time.monotonic() - started > 30:
                raise ValueError("Icon download limit exceeded")
    # Canonical catalog icons are PNG. Reject decompression bombs before inference.
    if (
        len(content) < 24
        or content[:8] != b"\x89PNG\r\n\x1a\n"
        or content[12:16] != b"IHDR"
    ):
        raise ValueError("Invalid PNG icon")
    width, height = struct.unpack(">II", content[16:24])
    if not width or not height or width * height > 16_000_000:
        raise ValueError("Icon dimensions exceed limit")
    return bytes(content)


def validate_result(raw: Any, has_icon: bool) -> dict[str, Any]:
    if not isinstance(raw, dict) or not isinstance(raw.get("criteria"), dict):
        raise TypeError("Missing criteria")
    criteria = raw["criteria"]
    if set(criteria) - (LEARNED_CRITERIA | RULE_CRITERIA):
        raise ValueError("Unknown guideline")
    if not has_icon:
        for key in ICON_CRITERIA:
            criteria.setdefault(key, {"unavailable": "No icon in snapshot"})
    if not LEARNED_CRITERIA <= criteria.keys():
        raise ValueError("Missing learned guideline")
    for key in LEARNED_CRITERIA:
        AnalysisCriterion.model_validate(criteria[key])
    for key in RULE_CRITERIA & criteria.keys():
        rule = criteria[key]
        if (
            not isinstance(rule, dict)
            or rule.get("method") != "rule"
            or type(rule.get("passed")) is not bool
        ):
            raise ValueError("Invalid automatic rule diagnostics")
    if not isinstance(raw.get("hints"), list) or not isinstance(
        raw.get("measurements"), dict
    ):
        raise TypeError("Missing review diagnostics")
    # Reject NaN/Infinity anywhere in diagnostics as well as in model scores.
    json.dumps(raw, allow_nan=False)
    return raw


def invoke_cli(snapshot: dict[str, Any], icon: bytes | None) -> dict[str, Any]:
    manifest = json.loads(Path(settings.quality_analysis_manifest).read_text())
    if manifest["identity"] != identity():
        raise ValueError("Deployed artifacts do not match configured identity")
    for path in (
        settings.quality_analysis_listing_model,
        settings.quality_analysis_icon_model,
    ):
        if hashlib.sha256(Path(path).read_bytes()).hexdigest() != manifest["files"].get(
            path
        ):
            raise ValueError("Model artifact checksum mismatch")
    with tempfile.TemporaryDirectory(prefix="appraise-") as directory:
        root = Path(directory)
        listing = root / "listing.json"
        listing.write_text(json.dumps(snapshot))
        command = [
            settings.quality_analysis_cli,
            "review",
            str(listing),
            "--model",
            settings.quality_analysis_listing_model,
        ]
        if icon is not None:
            icon_path = root / "icon.png"
            icon_path.write_bytes(icon)
            command.extend(
                [
                    "--icon",
                    str(icon_path),
                    "--icon-model",
                    settings.quality_analysis_icon_model,
                ]
            )
        env = {
            **os.environ,
            "HF_HUB_OFFLINE": "1",
            "TRANSFORMERS_OFFLINE": "1",
            "OMP_NUM_THREADS": "1",
        }
        # Files avoid pipe deadlocks. Terminate the whole process group on timeout.
        with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
            process = subprocess.Popen(
                command, stdout=output, stderr=errors, env=env, start_new_session=True
            )
            try:
                process.wait(timeout=settings.quality_analysis_timeout)
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
            if process.returncode:
                raise ValueError("Inference failed")
            output.seek(0)
            data = output.read(1024 * 1024 + 1)
            if len(data) > 1024 * 1024:
                raise ValueError("Inference output exceeds limit")
            return validate_result(json.loads(data), icon is not None)


def process_analysis(analysis_id: str, adapter=invoke_cli):
    if not settings.quality_analysis_enabled:
        return
    row = update_job(analysis_id, "queued", state="running")
    if not row:
        return
    if row["identity"] != identity():
        update_job(analysis_id, "running", state="failed", error_code="model_changed")
        return
    try:
        with get_db("writer") as db:
            snapshot = metadata(require_app(db, row["app_id"]))
        icon = fetch_icon(snapshot.get("icon"))
        now = datetime.now(UTC).isoformat()
        if not update_job(
            analysis_id,
            "running",
            snapshot=snapshot,
            icon=icon,
            has_icon=icon is not None,
            captured_at=now,
            icon_verified_at=now,
        ):
            return
        result = validate_result(adapter(snapshot, icon), icon is not None)
        update_job(analysis_id, "running", result=result, state="completed")
    except Exception as error:  # noqa: BLE001 -- publish only sanitized failure codes
        code = (
            "timeout"
            if isinstance(error, subprocess.TimeoutExpired)
            else "asset_fetch_failed"
            if isinstance(error, requests.RequestException)
            else "invalid_analysis"
        )
        update_job(analysis_id, "running", state="failed", error_code=code)
        logger.warning("Quality analysis attempt failed: %s", code)


def read_icon(app_id: str, analysis_id: str) -> bytes:
    with get_db("writer") as db:
        require_app(db, app_id)
        if not settings.quality_analysis_enabled:
            raise HTTPException(404)
        raw, icon = store.hmget(PREFIX + "job:" + analysis_id, "data", "icon")
        if not raw or json.loads(raw)["app_id"] != app_id or icon is None:
            raise HTTPException(404)
        return cast("bytes", icon)
