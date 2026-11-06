import json
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from types import SimpleNamespace
from uuid import uuid4

import pytest
import requests
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from redis import Redis
from starlette.middleware.sessions import SessionMiddleware

from app import login_info
from app import quality_analysis as analysis
from app.cache import CacheControlMiddleware
from app.routes import quality_moderation

APP_ID = "org.example.Analysis"


def fixture_result(*_args):
    return {
        "criteria": {
            key: {"method": "model", "pass_score": 0.75, "calibrated": True}
            for key in analysis.LEARNED_CRITERIA
        },
        "hints": ["A heuristic"],
        "measurements": {"name": {"length": 7}},
    }


@pytest.fixture
def storage(monkeypatch):
    url = os.getenv("QUALITY_ANALYSIS_TEST_REDIS_URL")
    if not url:
        pytest.skip("QUALITY_ANALYSIS_TEST_REDIS_URL is not configured")
    store = Redis.from_url(url)
    prefix = "test-analysis:" + uuid4().hex + ":"
    monkeypatch.setattr(analysis, "store", store)
    monkeypatch.setattr(analysis, "PREFIX", prefix)
    monkeypatch.setattr(analysis, "ACTIVE_KEY", prefix + "active")
    app = SimpleNamespace(
        appstream={"name": "Example", "summary": "Do things"},
        excluded_from_app_picks=False,
    )

    @contextmanager
    def catalog(_kind):
        # No database session: analysis must only read the catalog, never write it.
        yield None

    monkeypatch.setattr(analysis, "get_db", catalog)
    monkeypatch.setattr(analysis.App, "by_appid", lambda _db, _id: app)
    monkeypatch.setattr(analysis.settings, "quality_analysis_enabled", True)
    monkeypatch.setattr(analysis.settings, "quality_analysis_bundle", "bundle-1")
    monkeypatch.setattr(
        analysis.settings, "quality_analysis_encoder_revision", "encoder-1"
    )
    from app.quality_analysis_tasks import run_quality_analysis

    sent = []
    monkeypatch.setattr(run_quality_analysis, "send", sent.append)
    monkeypatch.setattr(analysis, "fetch_icon", lambda _url: b"icon-v1")
    yield app, sent
    keys = list(store.scan_iter(prefix + "*"))
    if keys:
        store.delete(*keys)
    store.close()


def test_concurrent_requests_and_redelivery(storage):
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(
            pool.map(lambda _: analysis.request_analysis(APP_ID, 7), range(4))
        )
    assert len({result.id for result in results}) == 1
    assert storage[1] == [results[0].id]
    calls = []

    def adapter(snapshot, icon):
        calls.append((snapshot, icon))
        return fixture_result()

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(
            pool.map(
                lambda _: analysis.process_analysis(results[0].id, adapter), range(4)
            )
        )
    assert len(calls) == 1
    assert analysis.read_analysis(APP_ID).state == "completed"
    assert analysis.store.zcard(analysis.ACTIVE_KEY) == 0


def test_http_lifecycle_and_private_cache_policy(storage):
    app = FastAPI()
    app.add_middleware(CacheControlMiddleware)
    quality_moderation.register_to_app(app)
    app.dependency_overrides[login_info.quality_moderator_only] = lambda: (
        SimpleNamespace(user=SimpleNamespace(id=7))
    )
    client = TestClient(app)
    url = f"/quality-moderation/{APP_ID}/analysis"
    first = client.get(url)
    assert first.json()["state"] == "not_requested"
    assert "no-store" in first.headers["cache-control"]
    requested = client.post(url)
    assert requested.status_code == 202
    assert "no-store" in requested.headers["cache-control"]
    analysis.process_analysis(requested.json()["id"], fixture_result)
    assert client.get(url).json()["state"] == "completed"
    icon = client.get(f"{url}/{requested.json()['id']}/icon")
    assert icon.content == b"icon-v1"
    assert "no-store" in icon.headers["cache-control"]
    assert (
        client.get(
            f"/quality-moderation/other/analysis/{requested.json()['id']}/icon"
        ).status_code
        == 404
    )


def test_expiry_and_late_worker_cannot_resurrect(storage):
    requested = analysis.request_analysis(APP_ID, 7)
    key = analysis.PREFIX + "job:" + requested.id
    assert 3590 <= analysis.store.ttl(key) <= 3600

    def expired(*_args):
        analysis.store.pexpire(key, 0)
        return fixture_result()

    analysis.process_analysis(requested.id, expired)
    assert not analysis.store.exists(key)
    assert analysis.read_analysis(APP_ID).state == "not_requested"
    with pytest.raises(HTTPException):
        analysis.read_icon(APP_ID, requested.id)
    replacement = analysis.request_analysis(APP_ID, 7)
    assert replacement.id != requested.id
    analysis.process_analysis(
        requested.id, lambda *_: pytest.fail("expired delivery ran")
    )


def test_results_keep_original_expiry_and_replace_previous_run(storage):
    first = analysis.request_analysis(APP_ID, 7)
    key = analysis.PREFIX + "job:" + first.id
    analysis.store.expire(key, 30)
    analysis.process_analysis(first.id, fixture_result)
    assert 0 < analysis.store.ttl(key) <= 30
    storage[0].appstream["name"] = "Changed"
    assert analysis.read_analysis(APP_ID).stale_reasons == ["metadata_changed"]
    second = analysis.request_analysis(APP_ID, 7)
    assert not analysis.store.exists(key)
    analysis.process_analysis(second.id, fixture_result)
    assert not analysis.read_analysis(APP_ID).stale


@pytest.mark.parametrize(
    "error,code",
    [
        (subprocess.TimeoutExpired("appraise", 1), "timeout"),
        (requests.ConnectionError("private"), "asset_fetch_failed"),
        (ValueError("private"), "invalid_analysis"),
    ],
)
def test_failures_require_explicit_retry(storage, error, code):
    first = analysis.request_analysis(APP_ID, 7)

    def fail(*_args):
        raise error

    analysis.process_analysis(first.id, fail)
    result = analysis.read_analysis(APP_ID)
    assert result.state == "failed"
    assert result.error_code == code
    assert "private" not in result.model_dump_json()
    analysis.process_analysis(first.id, lambda *_: pytest.fail("redelivery ran"))
    retry = analysis.request_analysis(APP_ID, 7)
    analysis.process_analysis(retry.id, fixture_result)
    assert analysis.read_analysis(APP_ID).state == "completed"


def test_dispatch_failure_is_terminal(storage, monkeypatch):
    from app.quality_analysis_tasks import run_quality_analysis

    def fail(_id):
        raise ConnectionError("private")

    monkeypatch.setattr(run_quality_analysis, "send", fail)
    requested = analysis.request_analysis(APP_ID, 7)
    assert analysis.read_analysis(APP_ID).error_code == "dispatch_failed"
    analysis.process_analysis(requested.id, lambda *_: pytest.fail("late delivery ran"))


def test_limits_and_expired_capacity(storage, monkeypatch):
    monkeypatch.setattr(analysis.settings, "quality_analysis_queue_limit", 1)
    first = analysis.request_analysis(APP_ID, 7)
    with pytest.raises(HTTPException) as error:
        analysis.request_analysis("other", 8)
    assert error.value.status_code == 429
    analysis.store.zadd(analysis.ACTIVE_KEY, {first.id: 0})
    analysis.request_analysis("other", 8)
    monkeypatch.setattr(analysis.settings, "quality_analysis_queue_limit", 100)
    for index in range(4):
        analysis.request_analysis(str(index), 7)
    with pytest.raises(HTTPException) as error:
        analysis.request_analysis("limited", 7)
    assert error.value.status_code == 429


def test_disabled_and_excluded(storage, monkeypatch):
    monkeypatch.setattr(analysis.settings, "quality_analysis_enabled", False)
    assert analysis.request_analysis(APP_ID, 7).state == "disabled"
    assert analysis.read_analysis(APP_ID).state == "disabled"
    assert storage[1] == []
    storage[0].excluded_from_app_picks = True
    with pytest.raises(HTTPException) as error:
        analysis.read_analysis(APP_ID)
    assert error.value.status_code == 404


@pytest.mark.parametrize("score", [float("nan"), float("inf"), -0.1, 1.1, "0.5", True])
def test_invalid_scores_are_rejected(score):
    raw = fixture_result()
    raw["criteria"]["app-icon-contrast"]["pass_score"] = score
    with pytest.raises(ValueError):
        analysis.validate_result(raw, True)


def test_partial_results_and_unknown_guidelines():
    raw = fixture_result()
    for key in analysis.ICON_CRITERIA:
        del raw["criteria"][key]
    result = analysis.validate_result(raw, False)
    assert result["criteria"]["app-icon-contrast"] == {
        "unavailable": "No icon in snapshot"
    }
    result["criteria"]["not-a-guideline"] = {"pass_score": 1}
    with pytest.raises(ValueError, match="Unknown guideline"):
        analysis.validate_result(result, False)


@pytest.mark.parametrize(
    "url",
    [
        "http://dl.flathub.org/repo/appstream/icon.png",
        "https://example.org/icon.png",
        "https://dl.flathub.org/other/icon.png",
    ],
)
def test_icon_fetch_rejects_noncanonical_urls(url):
    with pytest.raises(ValueError):
        analysis.fetch_icon(url)


@pytest.mark.parametrize(
    "url",
    [
        "https://dl.flathub.org/media/org/example/App/icon.png",
        "https://dl.flathub.org/repo/appstream/x86_64/icons/128x128/org.example.App.png",
    ],
)
def test_canonical_icon_locations_and_image_limits(url, monkeypatch):
    content = (
        b"\x89PNG\r\n\x1a\n"
        + b"\x00\x00\x00\rIHDR"
        + analysis.struct.pack(">II", 128, 128)
    )

    @contextmanager
    def get(_url, **kwargs):
        assert not kwargs["allow_redirects"]
        yield SimpleNamespace(status_code=200, iter_content=lambda _size: [content])

    monkeypatch.setattr(analysis.requests, "get", get)
    assert analysis.fetch_icon(url) == content
    content = content[:16] + analysis.struct.pack(">II", 10000, 10000)
    with pytest.raises(ValueError, match="dimensions"):
        analysis.fetch_icon(url)


def test_cli_offline_inputs_cleanup_and_timeout(tmp_path, monkeypatch):
    listing, icon = tmp_path / "listing.joblib", tmp_path / "icon.joblib"
    listing.write_bytes(b"listing")
    icon.write_bytes(b"icon")
    manifest = tmp_path / "deployment.json"
    manifest.write_text(
        json.dumps(
            {
                "identity": analysis.identity(),
                "files": {
                    str(path): analysis.hashlib.sha256(path.read_bytes()).hexdigest()
                    for path in (listing, icon)
                },
            }
        )
    )
    monkeypatch.setattr(analysis.settings, "quality_analysis_manifest", str(manifest))
    monkeypatch.setattr(
        analysis.settings, "quality_analysis_listing_model", str(listing)
    )
    monkeypatch.setattr(analysis.settings, "quality_analysis_icon_model", str(icon))
    inputs = []

    class Process:
        returncode = 0

        def __init__(self, command, stdout, **kwargs):
            assert command[1] == "review"
            assert "--icon-model" in command
            assert kwargs["env"]["HF_HUB_OFFLINE"] == "1"
            assert kwargs["start_new_session"]
            path = analysis.Path(command[2])
            assert json.loads(path.read_text())["name"] == "Example"
            inputs.append(path.parent)
            stdout.write(json.dumps(fixture_result()).encode())

        def wait(self, **_kwargs):
            return 0

        def poll(self):
            return 0

    monkeypatch.setattr(analysis.subprocess, "Popen", Process)
    assert analysis.invoke_cli({"name": "Example"}, b"icon")["criteria"]
    assert all(not path.exists() for path in inputs)
    killed = []

    class TimeoutProcess(Process):
        pid = 12345

        def wait(self, **_kwargs):
            if not killed:
                raise subprocess.TimeoutExpired("appraise", 1)
            return 0

        def poll(self):
            return None

    monkeypatch.setattr(analysis.subprocess, "Popen", TimeoutProcess)
    monkeypatch.setattr(
        analysis.os, "killpg", lambda pid, sig: killed.append((pid, sig))
    )
    with pytest.raises(subprocess.TimeoutExpired):
        analysis.invoke_cli({"name": "Example"}, b"icon")
    assert killed == [(12345, analysis.signal.SIGKILL)]
    assert all(not path.exists() for path in inputs)
    icon.write_bytes(b"changed model")
    with pytest.raises(ValueError, match="checksum mismatch"):
        analysis.invoke_cli({"name": "Example"}, b"icon")


@pytest.mark.parametrize(
    "method,path",
    [("get", "analysis"), ("post", "analysis"), ("get", "analysis/some-id/icon")],
)
def test_analyses_are_moderator_only(method, path, monkeypatch):
    app = FastAPI()
    app.add_middleware(SessionMiddleware, secret_key="test")
    quality_moderation.register_to_app(app)
    client = TestClient(app)
    assert (
        getattr(client, method)(f"/quality-moderation/{APP_ID}/{path}").status_code
        == 401
    )
    app.dependency_overrides[login_info.login_state] = lambda: (
        login_info.LoginInformation(
            state=login_info.LoginState.LOGGED_IN,
            user=SimpleNamespace(permissions=lambda: set()),
            method="oauth",
        )
    )

    @contextmanager
    def auth_db(_kind):
        yield SimpleNamespace(session=SimpleNamespace(merge=lambda user: user))

    monkeypatch.setattr(login_info, "get_db", auth_db)
    assert (
        getattr(client, method)(f"/quality-moderation/{APP_ID}/{path}").status_code
        == 403
    )
