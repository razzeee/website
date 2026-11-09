import io
import json
import os
import zipfile
from contextlib import contextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import cache, login_info, models
from app import checker_health_ingestion as ingestion
from app.checker_health import summarize
from app.checker_health_ingestion import (
    download_archive,
    list_artifacts,
    parse_archive,
    store_artifact,
)
from app.routes import checker_health


def source(status="failed", **kwargs):
    return dict(
        manifest="app.yml",
        source_pointer="/modules/0/sources/0",
        type="archive",
        checker_type="json",
        checkers_run=["JSONChecker"],
        status=status,
        errors=[{"type": "HTTPError", "message": "503"}] if status == "failed" else [],
        **kwargs,
    )


def observation(day, sources=None, **kwargs):
    report = {
        "schema_version": 1,
        "manifest": "/checkout/app.yml",
        "mode": "check",
        "started_at": f"2026-11-{day:02}T00:00:00Z",
        "finished_at": f"2026-11-{day:02}T00:01:00Z",
        "status": "completed",
        "delivery": "no_changes",
        "sources": sources or [],
        "errors": [],
    }
    report.update(kwargs)
    return SimpleNamespace(
        artifact_id=day,
        run_id=day,
        run_attempt=1,
        observed_at=datetime(2026, 11, day),
        report=report,
    )


def archive(report, name="org.example.App.json"):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(name, json.dumps(report))
    return buf.getvalue()


def test_shards_and_unchecked_do_not_clear_or_inflate_failures():
    result = summarize(
        [
            observation(4, [source()]),
            observation(1, [source()]),
            observation(2),
            observation(3, [source("unchecked")]),
        ]
    )
    assert result.sources[0].failures == 2
    assert result.sources[0].first_failure_at == datetime(2026, 11, 1, 0, 1, tzinfo=UTC)
    assert result.sources[0].recovered_at is None
    assert result.last_report_at.day == 4


def test_recent_history_limit_does_not_truncate_failure_history():
    result = summarize([observation(day, [source()]) for day in range(1, 26)])
    assert len(result.history) == 20
    assert result.sources[0].failures == 25
    assert result.sources[0].first_failure_at.day == 1


def test_replaced_module_cannot_recover_a_different_source_at_the_same_location():
    result = summarize(
        [
            observation(1, [source(module="libfoo")]),
            observation(2, [source("checked", module="libbar")]),
        ]
    )
    assert len(result.sources) == 2
    failed = next(item for item in result.sources if item.source.module == "libfoo")
    replacement = next(
        item for item in result.sources if item.source.module == "libbar"
    )
    assert failed.failures == 1
    assert failed.recovered_at is None
    assert replacement.failures == 0
    assert replacement.recovered_at is None


@pytest.mark.parametrize("status", ["checked", "update_available"])
def test_only_positive_source_observations_recover(status):
    rows = [observation(1, [source()]), observation(2, [source(status)])]
    result = summarize(rows)
    assert result.sources[0].failures == 0
    assert result.sources[0].recovered_at.day == 2
    result = summarize(rows + [observation(3, [source()])])
    assert result.sources[0].failures == 1
    assert result.sources[0].first_failure_at.day == 3
    assert result.sources[0].recovered_at is None


def test_policy_blocks_preserve_unresolved_failure_without_counting_as_failure():
    result = summarize(
        [observation(1, [source()]), observation(2, [source("blocked")])]
    )
    assert result.sources[0].failures == 1
    assert result.sources[0].source.status == "blocked"
    assert result.sources[0].failure_errors[0].type == "HTTPError"
    assert summarize([observation(1, [source("blocked")])]).sources[0].failures == 0


def test_skipped_branch_and_success_status_with_errors_cannot_clear_failure():
    checked = source("checked") | {"errors": [{"type": "HTTPError", "message": "503"}]}
    result = summarize(
        [
            observation(1, [source()]),
            observation(2, [checked]),
            observation(3, [source("checked")], status="skipped"),
        ]
    )
    assert result.sources[0].failures == 1
    assert result.sources[0].observed_at.day == 2
    assert result.sources[0].recovered_at is None


def test_skipped_aggregate_cannot_recover_through_completed_nested_branch():
    result = summarize(
        [
            observation(1, [source(branch="stable")]),
            observation(
                2,
                status="skipped",
                branches=[
                    {
                        "branch": "stable",
                        "status": "completed",
                        "sources": [source("checked")],
                    }
                ],
            ),
        ]
    )
    assert result.sources[0].failures == 1
    assert result.sources[0].recovered_at is None
    assert result.sources[0].observed_at.day == 1
    assert result.last_check_at.day == 1
    assert result.last_report_at.day == 2


def test_duplicate_sources_across_branch_entries_are_rejected():
    branch = {"branch": "stable", "status": "completed", "sources": [source()]}
    row = observation(1, branches=[branch, branch])
    with pytest.raises(ValueError, match="Duplicate checker source location"):
        parse_archive(archive(row.report))
    with pytest.raises(ValueError, match="Duplicate checker source location"):
        summarize([row])


def test_branch_aggregates_are_not_double_counted_and_branches_are_independent():
    rows = [
        observation(
            1,
            [source(branch="branch/24.08")],
            branches=[
                {
                    "branch": "branch/24.08",
                    "status": "completed",
                    "sources": [source()],
                },
                {
                    "branch": "branch/25.08",
                    "status": "completed",
                    "sources": [source("checked")],
                },
            ],
        ),
        observation(
            2,
            branches=[
                {"branch": "branch/24.08", "status": "skipped"},
                {
                    "branch": "branch/25.08",
                    "status": "completed",
                    "sources": [source("checked")],
                },
            ],
        ),
    ]
    result = summarize(rows)
    assert len(result.sources) == 2
    assert result.sources[0].branch == "branch/24.08"
    assert result.sources[0].failures == 1
    assert result.sources[0].observed_at.day == 1


def test_missing_file_diagnostics_remain_uncertain_and_deduplicated():
    error = {
        "type": "ManifestFileOpenError",
        "message": "Cannot open shared-modules/file.json",
    }
    result = summarize(
        [
            observation(
                1,
                errors=[error | {"branch": "branch/24.08"}],
                branches=[
                    {
                        "branch": "branch/24.08",
                        "status": "failed",
                        "errors": [error, error],
                    },
                ],
            ),
            observation(2),
        ]
    )
    assert result.sources == []
    assert result.last_check_at is None
    assert len(result.diagnostics) == 1
    assert result.diagnostics[0].observations == 1
    assert result.diagnostics[0].last_seen_at.day == 1


def test_aggregate_global_errors_are_preserved():
    result = summarize(
        [
            observation(
                1,
                errors=[{"type": "RuntimeError", "message": "interrupted"}],
                branches=[
                    {
                        "branch": "branch/24.08",
                        "status": "completed",
                        "sources": [source("checked")],
                    },
                ],
            )
        ]
    )
    assert result.diagnostics[0].error.message == "interrupted"
    assert result.diagnostics[0].branch is None


def test_generated_dependencies_and_old_outcomes_are_unknown():
    generated = source("unchecked", reason="no_update_checker")
    generated["checkers_run"] = []
    generated["checker_type"] = None
    result = summarize([observation(1, [generated])])
    assert result.last_check_at is None
    assert result.sources[0].failures == 0
    assert result.sources[0].recovered_at is None
    assert summarize([]).last_report_at is None
    old = source("unchecked", reason="no_candidate")
    result = summarize([observation(1, [source()]), observation(2, [old])])
    assert result.sources[0].failures == 1


@pytest.mark.parametrize(
    "change",
    [
        {"schema_version": 2},
        {"finished_at": "2026-10-01T00:00:00Z"},
        {"finished_at": "2026-11-01T00:01:00"},
        {"sources": [source(), source()]},
    ],
)
def test_invalid_reports_are_not_accepted(change):
    report = observation(1).report | change
    with pytest.raises(ValueError):
        parse_archive(archive(report))


def test_archive_names_and_raw_evidence():
    with pytest.raises(ValueError):
        parse_archive(archive(observation(1).report, "../org.example.App.json"))
    raw = observation(1, [source()]).report | {"outdated": 0}
    parsed = parse_archive(archive(raw))
    assert parsed["org.example.App"][1] == raw


def test_artifacts_after_first_hundred_and_expired_are_handled():
    pages = []

    def handler(request):
        page = int(request.url.params["page"])
        pages.append(page)
        artifact = {
            "id": page,
            "name": f"checker-health-{page}-1",
            "expired": page == 2,
            "workflow_run": {"id": page, "head_repository_id": 88860262},
        }
        items = (
            [{"name": "unrelated"}] * 100
            if page == 1
            else [artifact] * (100 if page == 2 else 1)
        )
        return httpx.Response(200, json={"artifacts": items, "total_count": 201})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assert [a["id"] for a in list_artifacts(client)] == [3]
    assert pages == [1, 2, 3]


def test_archive_redirect_does_not_forward_github_credentials():
    requests = []

    def handler(request):
        requests.append(request)
        if request.url.host == "api.github.com":
            return httpx.Response(
                302, headers={"location": "https://storage.example.org/artifact.zip"}
            )
        return httpx.Response(200, content=b"archive")

    with httpx.Client(
        transport=httpx.MockTransport(handler),
        headers={"Authorization": "Bearer test-token"},
    ) as client:
        assert download_archive(client, 123) == b"archive"
    assert requests[0].headers["authorization"] == "Bearer test-token"
    assert "authorization" not in requests[1].headers


@pytest.fixture
def health_db():
    url = os.getenv("CHECKER_HEALTH_TEST_DATABASE_URL")
    if not url:
        pytest.skip("CHECKER_HEALTH_TEST_DATABASE_URL is not configured")
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import Session

    from app.db_session import DBSession

    schema = f"checker_health_{uuid4().hex}"
    admin = create_engine(url)
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={"options": f"-c search_path={schema}"})
    models.Base.metadata.create_all(
        engine,
        tables=[
            models.CheckerHealthArtifact.__table__,
            models.CheckerHealthObservation.__table__,
        ],
    )

    @contextmanager
    def db(_kind="writer"):
        with Session(engine) as session:
            yield DBSession(session)
            session.commit()

    try:
        yield db
    finally:
        engine.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


def test_atomic_idempotent_storage_and_out_of_order_history(health_db):
    def store(day, status):
        with health_db() as db:
            store_artifact(
                db,
                {
                    "id": day,
                    "name": f"checker-health-{day}-1",
                    "workflow_run": {"id": day},
                },
                parse_archive(archive(observation(day, [source(status)]).report)),
            )

    store(2, "checked")
    store(1, "failed")
    store(1, "failed")
    with health_db() as db:
        store_artifact(
            db,
            {"id": 100, "name": "checker-health-1-1", "workflow_run": {"id": 1}},
            parse_archive(archive(observation(1, [source()]).report)),
        )
    with health_db() as db:
        rows = db.session.query(models.CheckerHealthObservation).all()
        assert len(rows) == 2
        assert summarize(rows).sources[0].recovered_at.day == 2
    with pytest.raises(RuntimeError), health_db() as db:
        store_artifact(
            db,
            {"id": 3, "name": "checker-health-3-1", "workflow_run": {"id": 3}},
            parse_archive(archive(observation(3).report)),
        )
        raise RuntimeError("interrupted transaction")
    with health_db() as db:
        assert db.session.get(models.CheckerHealthArtifact, 3) is None
    store(3, "failed")


def test_run_attempt_links_and_counts(health_db):
    for attempt in (1, 2):
        with health_db() as db:
            store_artifact(
                db,
                {
                    "id": attempt,
                    "name": f"checker-health-42-{attempt}",
                    "workflow_run": {"id": 42},
                },
                parse_archive(archive(observation(attempt, [source()]).report)),
            )
    with health_db() as db:
        result = summarize(db.session.query(models.CheckerHealthObservation).all())
    assert result.sources[0].failures == 2
    assert result.sources[0].last_failure_run_url.endswith("/42/attempts/2")


def test_failed_artifact_retries_without_reimporting_successful_artifacts(
    health_db, monkeypatch
):
    broken = True
    downloads = []

    def handler(request):
        if request.url.path.endswith("/artifacts"):
            return httpx.Response(
                200,
                json={
                    "total_count": 2,
                    "artifacts": [
                        {
                            "id": n,
                            "name": f"checker-health-{n}-1",
                            "expired": False,
                            "workflow_run": {"id": n, "head_repository_id": 88860262},
                        }
                        for n in (1, 2)
                    ],
                },
            )
        artifact_id = int(request.url.path.split("/")[-2])
        downloads.append(artifact_id)
        content = (
            b"broken"
            if broken and artifact_id == 1
            else archive(observation(artifact_id, [source()]).report)
        )
        return httpx.Response(200, content=content)

    client_class = httpx.Client
    monkeypatch.setattr(
        ingestion.httpx,
        "Client",
        lambda **kwargs: client_class(transport=httpx.MockTransport(handler), **kwargs),
    )
    monkeypatch.setattr(ingestion, "get_db", health_db)
    monkeypatch.setattr(ingestion.settings, "github_bot_token", "test-token")
    with pytest.raises(RuntimeError, match="1 checker artifacts"):
        ingestion.refresh_checker_health()
    broken = False
    ingestion.refresh_checker_health()
    assert downloads == [1, 2, 1]
    with health_db() as db:
        assert db.session.query(models.CheckerHealthObservation).count() == 2


@pytest.mark.parametrize(
    "role,status",
    [
        ("anonymous", 401),
        ("unrelated", 403),
        ("author", 403),
        ("moderator", 403),
        ("admin", 200),
    ],
)
def test_endpoint_authorization_and_private_caching(monkeypatch, role, status):
    app = FastAPI()
    checker_health.register_to_app(app)
    app.add_middleware(cache.CacheControlMiddleware)
    user = MagicMock()
    user.permissions.return_value = {
        "moderator": ["moderation"],
        "admin": ["modify-users"],
    }.get(role, [])
    user.dev_flatpaks.return_value = ["org.example.App"] if role == "author" else []
    app.dependency_overrides[login_info.login_state] = lambda: (
        login_info.LoginInformation(
            login_info.LoginState.LOGGED_OUT
            if role == "anonymous"
            else login_info.LoginState.LOGGED_IN,
            None if role == "anonymous" else user,
            None,
        )
    )

    @contextmanager
    def db(_kind):
        db = MagicMock()
        db.session.merge.return_value = user
        db.session.query.return_value.filter_by.return_value.order_by.return_value.yield_per.return_value = []
        yield db

    monkeypatch.setattr(login_info, "get_db", db)
    monkeypatch.setattr(checker_health, "get_db", db)
    response = TestClient(app).get("/apps/org.example.App/checker-health")
    assert response.status_code == status
    if status == 200:
        assert "private" in response.headers["cache-control"]
        assert response.json()["last_report_at"] is None
