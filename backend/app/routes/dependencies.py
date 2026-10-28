import hashlib
from datetime import datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, FastAPI, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func

from .. import config, models, utils
from ..database import get_db
from ..dependency_manifest import PARSER_VERSION

router = APIRouter(prefix="/dependencies", tags=["dependencies"])


def register_to_app(app: FastAPI):
    app.include_router(router)


class DependencyCoverage(BaseModel):
    scope: str = "stable/x86_64 app manifests"
    total: int
    complete: int
    partial: int
    pending: int
    missing: int
    error: int
    stale: int
    last_observed_at: datetime | None


class DependencyMatch(BaseModel):
    id: int
    app_id: str
    ref: str
    commit: str
    snapshot_id: int
    pointer: str
    module_path: str
    name: str
    kind: str
    source_url: str | None
    evidence: dict[str, Any]
    status: str
    stale: bool
    collected_at: datetime
    last_observed_at: datetime


class DependencySearch(BaseModel):
    coverage: DependencyCoverage
    matches: list[DependencyMatch]
    next_cursor: str | None


class DependencySnapshot(BaseModel):
    id: int
    repository: str
    ref: str
    commit: str
    parser_version: int
    created_at: datetime
    digest: str
    manifest_path: str = "/files/manifest.json"
    manifest: dict[str, Any]
    diagnostics: list[str]


@router.get("", response_model=DependencySearch)
def search_dependencies(
    q: str = Query(default="", max_length=2048),
    match: Literal["module", "source"] = "module",
    cursor: str | None = Query(default=None, max_length=150),
    limit: int = Query(default=25, ge=1, le=100),
) -> DependencySearch:
    query_text = q.strip()
    if match == "module" and len(query_text) > 200:
        raise HTTPException(422, "Module query is too long")
    fingerprint = hashlib.sha256(f"{match}:{query_text}".encode()).hexdigest()[:16]
    after, ceiling = 0, None
    if cursor:
        try:
            after_str, ceiling_str, query_key = cursor.split(":")
            after, ceiling = int(after_str), int(ceiling_str)
            if not 0 <= after <= ceiling <= 2147483647 or query_key != fingerprint:
                raise ValueError
        except ValueError:
            raise HTTPException(422, "Invalid search cursor") from None
    stale_before = utils.utcnow() - timedelta(days=2)
    state = models.DependencyRefState
    snapshot = models.DependencyManifestSnapshot
    declaration = models.DependencyDeclaration
    with get_db() as db:
        states = db.session.query(state).filter_by(
            repository=config.settings.repo_url, active=True
        )
        counts = {
            status: count
            for status, count in states.with_entities(state.status, func.count())
            .group_by(state.status)
            .all()
        }
        latest = states.with_entities(func.max(state.observed_at)).scalar()
        stale = (
            states.outerjoin(snapshot, snapshot.id == state.snapshot_id)
            .filter(
                (state.observed_at < stale_before)
                | (state.status.notin_(("complete", "partial")))
                | (snapshot.commit != state.observed_commit)
                | (snapshot.parser_version != PARSER_VERSION)
            )
            .count()
        )
        coverage = DependencyCoverage(
            total=sum(counts.values()),
            complete=counts.get("complete", 0),
            partial=counts.get("partial", 0),
            pending=counts.get("pending", 0),
            missing=counts.get("missing", 0),
            error=counts.get("error", 0),
            stale=stale,
            last_observed_at=latest,
        )
        if not query_text:
            return DependencySearch(coverage=coverage, matches=[], next_cursor=None)
        if ceiling is None:
            ceiling = db.session.query(func.max(declaration.id)).scalar() or 0
        query = (
            db.session.query(declaration, snapshot, state)
            .join(snapshot, snapshot.id == declaration.snapshot_id)
            .join(state, state.snapshot_id == snapshot.id)
            .filter(
                state.repository == config.settings.repo_url,
                state.active.is_(True),
                declaration.id > after,
                declaration.id <= ceiling,
            )
        )
        if match == "module":
            query = query.filter(
                declaration.name_key.startswith(query_text.casefold(), autoescape=True)
            )
        else:
            query = query.filter(
                declaration.source_key
                == hashlib.sha256(query_text.encode()).hexdigest(),
                declaration.source_url == query_text,
            )
        rows = query.order_by(declaration.id).limit(limit + 1).all()
        matches = [
            DependencyMatch(
                id=d.id,
                app_id=r.app_id,
                ref=s.ref,
                commit=s.commit,
                snapshot_id=s.id,
                pointer=d.pointer,
                module_path=d.module_path,
                name=d.name,
                kind=d.kind,
                source_url=d.source_url,
                evidence=d.evidence,
                status=r.status,
                stale=r.observed_at < stale_before
                or r.status not in ("complete", "partial")
                or s.commit != r.observed_commit
                or s.parser_version != PARSER_VERSION,
                collected_at=s.created_at,
                last_observed_at=r.observed_at,
            )
            for d, s, r in rows[:limit]
        ]
        return DependencySearch(
            coverage=coverage,
            matches=matches,
            next_cursor=f"{matches[-1].id}:{ceiling}:{fingerprint}"
            if len(rows) > limit
            else None,
        )


@router.get("/snapshots/{snapshot_id}", response_model=DependencySnapshot)
def get_dependency_snapshot(snapshot_id: int) -> DependencySnapshot:
    with get_db() as db:
        row = db.session.get(models.DependencyManifestSnapshot, snapshot_id)
        if row is None:
            raise HTTPException(404, "Manifest snapshot not found")
        return DependencySnapshot(
            **{
                name: getattr(row, name)
                for name in DependencySnapshot.model_fields
                if name != "manifest_path"
            }
        )
