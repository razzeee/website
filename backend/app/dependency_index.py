"""Incremental published-manifest indexing, independent of moderation decisions."""

import hashlib
import logging
from dataclasses import asdict

from sqlalchemy import text

from . import config, models, utils
from .database import get_db
from .dependency_manifest import (
    ARCH,
    BRANCH,
    PARSER_VERSION,
    Declaration,
    extract_declarations,
    manifest_digest,
)
from .moderation.ostree_manifest import (
    ManifestRetrievalError,
    list_published_refs,
    read_published_manifest,
)

logger = logging.getLogger(__name__)
APP_TYPES = ("desktop", "desktop-application", "console-application")


def enumerate_dependencies(app_ids: list[str] | None = None) -> list[tuple[int, str]]:
    """Pilot calls only touch selected apps; only full enumeration withdraws refs."""
    repository = config.settings.repo_url
    with get_db("writer") as db:
        # Serialize enumeration, including remote discovery, so an older scan cannot
        # overwrite a newer scan. Per-ref workers never take this lock.
        if not db.session.execute(
            text("SELECT pg_try_advisory_xact_lock(739124811)")
        ).scalar():
            return []
        refs = list_published_refs(
            repository, timeout_seconds=config.settings.ostree_manifest_timeout_seconds
        )
        query = db.session.query(models.App.app_id).filter(
            models.App.type.in_(APP_TYPES)
        )
        if app_ids is not None:
            query = query.filter(models.App.app_id.in_(app_ids))
        apps = {row.app_id for row in query.all()}
        selected = {f"app/{app}/{ARCH}/{BRANCH}" for app in apps}
        now = utils.utcnow()
        existing = db.session.query(models.DependencyRefState).filter_by(
            repository=repository
        )
        if app_ids is not None:
            existing = existing.filter(models.DependencyRefState.app_id.in_(app_ids))
        states = {row.ref: row for row in existing.with_for_update().all()}
        work = []
        for ref in sorted(selected & refs.keys()):
            commit = refs[ref]
            state = states.get(ref)
            if state is None:
                state = models.DependencyRefState(
                    repository=repository,
                    ref=ref,
                    app_id=ref.split("/")[1],
                    status="pending",
                )
                db.session.add(state)
            changed = state.observed_commit != commit
            state.observed_commit = commit
            state.observed_at = now
            state.active = True
            snapshot = (
                db.session.get(models.DependencyManifestSnapshot, state.snapshot_id)
                if state.snapshot_id
                else None
            )
            if (
                changed
                or snapshot is None
                or snapshot.parser_version != PARSER_VERSION
                or state.status not in ("complete", "partial")
            ):
                state.status = "pending"
                state.error = None
                db.session.flush()
                work.append((state.id, commit))
        for ref, state in states.items():
            if ref not in refs or ref not in selected:
                state.active = False
        return work


def index_dependency_ref(state_id: int, commit: str):
    with get_db("writer") as db:
        state = db.session.get(models.DependencyRefState, state_id)
        if state is None or not state.active or state.observed_commit != commit:
            return
        repository, ref = state.repository, state.ref

    now = utils.utcnow()
    manifest = None
    declarations: list[Declaration] = []
    diagnostics: list[str] = []
    error = None
    try:
        manifest = read_published_manifest(
            repository,
            ref,
            commit,
            timeout_seconds=config.settings.ostree_manifest_timeout_seconds,
        )
        status = "missing" if manifest is None else "complete"
        declarations, diagnostics = (
            extract_declarations(manifest) if manifest is not None else ([], [])
        )
        if diagnostics:
            status = "partial"
    except (ManifestRetrievalError, ValueError, RecursionError) as exc:
        status = "error"
        error = getattr(exc, "category", "invalid_manifest")
        logger.warning("Dependency manifest unavailable for %s: %s", ref, error)

    with get_db("writer") as db:
        state = (
            db.session.query(models.DependencyRefState)
            .filter_by(id=state_id)
            .with_for_update()
            .one()
        )
        # A withdrawn ref or newer enumeration wins over an in-flight fetch.
        if not state.active or state.observed_commit != commit:
            return
        # A duplicate failed job must not downgrade successful evidence.
        previous = (
            db.session.get(models.DependencyManifestSnapshot, state.snapshot_id)
            if state.snapshot_id
            else None
        )
        if (
            previous
            and previous.commit == commit
            and previous.parser_version == PARSER_VERSION
            and state.status in ("complete", "partial")
        ):
            return
        state.last_attempt_at = now
        state.status = status
        state.error = error
        if status not in ("complete", "partial") or manifest is None:
            return
        snapshot = (
            db.session.query(models.DependencyManifestSnapshot)
            .filter_by(
                repository=repository,
                ref=ref,
                commit=commit,
                parser_version=PARSER_VERSION,
            )
            .first()
        )
        if snapshot is None:
            snapshot = models.DependencyManifestSnapshot(
                repository=repository,
                ref=ref,
                commit=commit,
                parser_version=PARSER_VERSION,
                created_at=now,
                digest=manifest_digest(manifest),
                manifest=manifest,
                diagnostics=diagnostics,
            )
            db.session.add(snapshot)
            db.session.flush()
            for declaration in declarations:
                db.session.add(
                    models.DependencyDeclaration(
                        snapshot_id=snapshot.id,
                        name_key=declaration.name.casefold()[:256],
                        # Hashing preserves exact URL semantics and bounds the index key.
                        source_key=hashlib.sha256(
                            declaration.source_url.encode()
                        ).hexdigest()
                        if declaration.source_url
                        else None,
                        **asdict(declaration),
                    )
                )
        state.snapshot_id = snapshot.id
        state.last_success_at = now
