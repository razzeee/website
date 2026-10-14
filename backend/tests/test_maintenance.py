import os
import sys
from contextlib import contextmanager
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.maintenance import Evidence, apply_triage, assess, dashboard

NOW = datetime(2026, 10, 13, 12)


def test_age_is_investigation_not_abandonment():
    case = assess(Evidence("app", "App", NOW - timedelta(days=365)), NOW)
    assert case.signals[0].kind == "stale"
    assert case.signals[0].confidence == "investigate"
    assert not assess(Evidence("app", "App", NOW - timedelta(days=364)), NOW).signals
    assert not assess(Evidence("app", "App", NOW + timedelta(days=1)), NOW).signals


def test_missing_timestamp_is_unknown_and_missing_runtime_is_not_healthy():
    case = assess(Evidence("app", "App"), NOW)
    assert case.days_since_update is None
    assert case.runtime_eol is None
    assert case.signals[0].confidence == "unknown"


def test_signals_and_priority_are_separate_from_reach():
    old_popular = assess(Evidence("old", "Old", NOW - timedelta(days=800), 10000), NOW)
    runtime = assess(
        Evidence("runtime", "Runtime", NOW, 1, "org.Runtime/x86_64/old", True), NOW
    )
    retired = assess(Evidence("retired", "Retired", NOW, 10, is_eol=True), NOW)
    data = dashboard([old_popular, runtime, retired], NOW, user_id=1)
    assert [c.app_id for c in data.cases] == ["retired", "runtime", "old"]
    assert data.campaigns[0].apps == 1
    assert not assess(Evidence("retired", "Retired", NOW, is_eol=True), NOW).signals


def test_snooze_ignores_daily_age_downloads_and_threshold_but_wakes_on_evidence():
    evidence = Evidence("app", "App", NOW - timedelta(days=500), 10)
    initial = assess(evidence, NOW)
    state = SimpleNamespace(
        owner_id=1,
        notes="Contacted maintainer",
        version=1,
        snoozed_until=NOW + timedelta(days=30),
        snooze_reason="Waiting",
        fingerprint=initial.fingerprint,
    )
    evidence.installs_last_7_days = 20
    later = assess(evidence, NOW + timedelta(days=1), 180)
    apply_triage(later, state, NOW + timedelta(days=1), "Moderator")
    assert later.snoozed and not later.reopened
    evidence.failed_guidelines = ["screenshots"]
    changed = assess(evidence, NOW)
    apply_triage(changed, state, NOW)
    assert changed.reopened and not changed.snoozed
    expired = assess(evidence, NOW + timedelta(days=31))
    apply_triage(expired, state, NOW + timedelta(days=31))
    assert not expired.snoozed and not expired.reopened


def test_filter_search_pagination_and_campaigns_include_snoozed_apps():
    a = assess(
        Evidence("a", "Alpha", NOW - timedelta(days=400), 5, "rt/x86_64/1", True), NOW
    )
    b = assess(
        Evidence("b", "Beta", NOW - timedelta(days=500), 10, "rt/x86_64/1", True), NOW
    )
    b.snoozed = True
    a.owner_id = 42
    data = dashboard([a, b], NOW, user_id=42, queue="mine", search="ALPHA", page_size=1)
    assert data.total == 1 and data.active == 1 and data.snoozed == 1
    assert data.campaigns[0].apps == 2 and data.campaigns[0].installs_last_7_days == 15
    assert dashboard([a, b], NOW, user_id=42, queue="snoozed").cases[0].app_id == "b"
    assert not dashboard([a, b], NOW, user_id=42, runtime="other").cases
    clamped = dashboard([a, b], NOW, user_id=42, page=2)
    assert clamped.page == 1 and clamped.cases[0].app_id == "a"


def test_pagination_clamps_after_snoozing_the_last_result():
    cases = [
        assess(Evidence(str(i), str(i), NOW - timedelta(days=500)), NOW)
        for i in range(26)
    ]
    last_page = dashboard(cases, NOW, user_id=1, page=2, page_size=25)
    assert last_page.page == 2 and len(last_page.cases) == 1
    last_page.cases[0].snoozed = True
    remaining = dashboard(cases, NOW, user_id=1, page=2, page_size=25)
    assert remaining.total == 25 and remaining.page == 1
    assert len(remaining.cases) == 25
    empty = dashboard([], NOW, user_id=1, page=2, page_size=25)
    assert empty.page == 1 and not empty.cases


@pytest.fixture
def maintenance_api():
    database_url = os.getenv("MAINTENANCE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("MAINTENANCE_TEST_DATABASE_URL is not configured")
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.schema import CreateTable

    from app import cache, login_info, models
    from app.db_session import DBSession
    from app.routes import maintenance

    engine = create_engine(database_url)
    connection = engine.connect()
    # Connection-scoped temporary tables never touch the configured database's data.
    for model in (
        models.FlathubUser,
        models.Permission,
        models.Role,
        models.role_permission,
        models.flathubuser_role,
        models.App,
        models.GuidelineCategory,
        models.Guideline,
        models.QualityModeration,
        models.MaintenanceTriage,
    ):
        ddl = str(CreateTable(model.__table__).compile(engine)).replace(
            "CREATE TABLE", "CREATE TEMP TABLE", 1
        )
        # Avoid creating a permanent PostgreSQL enum in an arbitrary test DB.
        ddl = ddl.replace("type app_type", "type VARCHAR")
        connection.exec_driver_sql(ddl)
        if model is models.App:
            connection.exec_driver_sql("CREATE UNIQUE INDEX ON apps (app_id)")
    connection.commit()
    Session = sessionmaker(bind=connection, expire_on_commit=False)
    with Session.begin() as session:
        session.add_all(
            [models.FlathubUser(id=i, display_name=f"Moderator {i}") for i in (1, 2, 3)]
        )
        session.add(models.Permission(name="quality-moderation"))
        session.add(models.Role(id=1, name="quality-moderator"))
        session.flush()
        session.add(
            models.role_permission(role_id=1, permission_name="quality-moderation")
        )
        session.add_all(
            [models.flathubuser_role(flathubuser_id=i, role_id=1) for i in (1, 3)]
        )
        session.add(
            models.App(
                app_id="org.Test.App",
                type="desktop-application",
                appstream={"name": "Test App"},
                last_updated_at=NOW - timedelta(days=500),
                summary={
                    "branch": "stable",
                    "metadata": {"runtime": "org.Test.Runtime/x86_64/old"},
                },
                installs_last_7_days=123,
            )
        )
        session.add(
            models.App(
                app_id="org.Test.Runtime",
                type="runtime",
                is_eol=True,
                eol_branches=["old"],
            )
        )
    current = {"user_id": None}

    def login():
        user_id = current["user_id"]
        return login_info.LoginInformation(
            login_info.LoginState.LOGGED_IN
            if user_id
            else login_info.LoginState.LOGGED_OUT,
            models.FlathubUser(id=user_id) if user_id else None,
            None,
        )

    @contextmanager
    def db(db_type="writer"):
        session = Session()
        try:
            yield DBSession(session)
            if db_type == "writer":
                session.commit()
        finally:
            session.close()

    app = FastAPI()
    maintenance.register_to_app(app)
    app.add_middleware(cache.CacheControlMiddleware)
    app.dependency_overrides[login_info.login_state] = login
    from unittest.mock import patch

    with (
        patch.object(maintenance, "get_db", db),
        patch.object(login_info, "get_db", db),
        patch.object(maintenance.utils, "utcnow", lambda: NOW),
        TestClient(app) as client,
    ):
        yield client, current, Session
    connection.close()
    engine.dispose()


def test_api_auth_and_private_responses(maintenance_api):
    client, current, _ = maintenance_api
    for method, path in (
        ("get", "/admin/maintenance"),
        ("get", "/admin/maintenance/org.Test.App"),
        ("post", "/admin/maintenance/org.Test.App"),
    ):
        kwargs = {"json": {"action": "claim", "version": 0}} if method == "post" else {}
        response = getattr(client, method)(path, **kwargs)
        assert response.status_code == 401
        assert response.headers["Cache-Control"] == "private"
    current["user_id"] = 2
    assert client.get("/admin/maintenance").status_code == 403
    assert (
        client.post(
            "/admin/maintenance/org.Test.App", json={"action": "claim", "version": 0}
        ).status_code
        == 403
    )


def test_api_claim_notes_snooze_reopen_and_conflicts(maintenance_api):
    client, current, Session = maintenance_api
    current["user_id"] = 1
    path = "/admin/maintenance/org.Test.App"
    response = client.get("/admin/maintenance")
    assert response.status_code == 200
    assert response.json()["campaigns"][0]["apps"] == 1
    case = response.json()["cases"][0]
    assert [s["kind"] for s in case["signals"]] == ["runtime", "stale"]
    response = client.post(path, json={"action": "claim", "version": 0})
    assert response.status_code == 200
    assert response.json()["owned_by_me"] is True
    assert (
        client.post(
            path, json={"action": "notes", "version": 0, "notes": "Stale edit"}
        ).status_code
        == 409
    )
    current["user_id"] = 3
    assert client.post(path, json={"action": "claim", "version": 1}).status_code == 409
    assert (
        client.post(path, json={"action": "release", "version": 1}).status_code == 409
    )
    current["user_id"] = 1
    response = client.post(
        path, json={"action": "notes", "version": 1, "notes": "Contacted maintainer"}
    )
    assert response.json()["notes"] == "Contacted maintainer"
    assert (
        client.post(
            path,
            json={
                "action": "snooze",
                "version": 2,
                "reason": "  ",
                "expected_fingerprint": case["fingerprint"],
            },
        ).status_code
        == 422
    )
    response = client.post(
        path,
        json={
            "action": "snooze",
            "version": 2,
            "reason": "Waiting",
            "days": 7,
            "expected_fingerprint": case["fingerprint"],
        },
    )
    assert response.status_code == 200 and response.json()["snoozed"] is True
    assert not client.get("/admin/maintenance").json()["cases"]
    assert client.get("/admin/maintenance?queue=snoozed").json()["total"] == 1
    from app import models

    with Session.begin() as session:
        app = session.query(models.App).filter_by(app_id="org.Test.App").one()
        app.last_updated_at = NOW - timedelta(days=400)
    reopened = client.get(path).json()
    assert reopened["reopened"] and not reopened["snoozed"]
    assert reopened["notes"] == "Contacted maintainer"
    assert client.get("/admin/maintenance").json()["total"] == 1
    response = client.post(path, json={"action": "wake", "version": 3})
    assert response.json()["snoozed_until"] is None


def test_api_runtime_branch_scope_quality_and_validation(maintenance_api):
    client, current, Session = maintenance_api
    current["user_id"] = 1
    from app import models

    with Session.begin() as session:
        app = session.query(models.App).filter_by(app_id="org.Test.App").one()
        app.last_updated_at = NOW
        app.summary = {
            "branch": "stable",
            "metadata": {"runtime": "org.Test.Runtime/x86_64/new"},
        }
        # Only beta is EOL: do not report the stable package as retired.
        app.is_eol = True
        app.eol_branches = ["beta"]
        session.add(models.GuidelineCategory(id="general", order=1))
        session.flush()
        session.add(
            models.Guideline(
                id="test-check",
                url="https://example.org",
                needed_to_pass_since=NOW.date(),
                order=1,
                guideline_category_id="general",
            )
        )
        session.flush()
        session.add(
            models.QualityModeration(
                app_id="org.Test.App", guideline_id="test-check", passed=False
            )
        )
    case = client.get("/admin/maintenance/org.Test.App").json()
    assert case["runtime_eol"] is False
    assert [s["kind"] for s in case["signals"]] == ["quality"]
    assert client.get("/admin/maintenance?queue=runtime").json()["total"] == 0
    assert client.get("/admin/maintenance?search=TEST").json()["total"] == 1
    assert client.get("/admin/maintenance?stale_days=1").status_code == 422
    assert client.get("/admin/maintenance?page=0").status_code == 422
    assert client.get("/admin/maintenance?queue=invalid").status_code == 422
    assert client.get("/admin/maintenance/not-found").status_code == 404
    assert (
        client.post(
            "/admin/maintenance/org.Test.Runtime",
            json={"action": "claim", "version": 0},
        ).status_code
        == 404
    )


@pytest.mark.parametrize("change", ["runtime", "package", "quality"])
def test_snooze_rejects_unreviewed_evidence_even_when_version_is_unchanged(
    maintenance_api, change
):
    client, current, Session = maintenance_api
    current["user_id"] = 1
    from app import models

    path = "/admin/maintenance/org.Test.App"
    with Session.begin() as session:
        app = session.query(models.App).filter_by(app_id="org.Test.App").one()
        app.summary = {
            "branch": "stable",
            "metadata": {"runtime": "org.Test.Runtime/x86_64/new"},
        }
    viewed = client.get(path).json()
    assert [s["kind"] for s in viewed["signals"]] == ["stale"]
    with Session.begin() as session:
        app = session.query(models.App).filter_by(app_id="org.Test.App").one()
        if change == "runtime":
            app.summary = {
                "branch": "stable",
                "metadata": {"runtime": "org.Test.Runtime/x86_64/old"},
            }
        elif change == "package":
            app.last_updated_at = NOW - timedelta(days=450)
        else:
            session.add(models.GuidelineCategory(id="general", order=1))
            session.flush()
            session.add(
                models.Guideline(
                    id="new-check",
                    url="https://example.org",
                    needed_to_pass_since=NOW.date(),
                    order=1,
                    guideline_category_id="general",
                )
            )
            session.flush()
            session.add(
                models.QualityModeration(
                    app_id="org.Test.App", guideline_id="new-check", passed=False
                )
            )
    updated = client.get(path).json()
    assert updated["version"] == viewed["version"]
    assert updated["fingerprint"] != viewed["fingerprint"]
    response = client.post(
        path,
        json={
            "action": "snooze",
            "version": viewed["version"],
            "reason": "Waiting",
            "expected_fingerprint": viewed["fingerprint"],
        },
    )
    assert response.status_code == 409
    assert "evidence changed" in response.json()["detail"]
    with Session() as session:
        assert session.get(models.MaintenanceTriage, "org.Test.App") is None
    assert client.get("/admin/maintenance").json()["total"] == 1
    # Refreshing and reviewing the new evidence permits the snooze.
    response = client.post(
        path,
        json={
            "action": "snooze",
            "version": updated["version"],
            "reason": "Reviewed new evidence",
            "expected_fingerprint": updated["fingerprint"],
        },
    )
    assert response.status_code == 200 and response.json()["snoozed"]


def test_snooze_requires_fingerprint_but_ignores_download_fluctuations(maintenance_api):
    client, current, Session = maintenance_api
    current["user_id"] = 1
    from app import models

    path = "/admin/maintenance/org.Test.App"
    viewed = client.get(path).json()
    body = {"action": "snooze", "version": viewed["version"], "reason": "Waiting"}
    assert client.post(path, json=body).status_code == 422
    assert (
        client.post(path, json={**body, "expected_fingerprint": "invalid"}).status_code
        == 422
    )
    with Session.begin() as session:
        session.query(models.App).filter_by(
            app_id="org.Test.App"
        ).one().installs_last_7_days += 100
    response = client.post(
        path, json={**body, "expected_fingerprint": viewed["fingerprint"]}
    )
    assert response.status_code == 200 and response.json()["snoozed"]


def test_triage_migration_upgrade_and_downgrade():
    database_url = os.getenv("MAINTENANCE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("MAINTENANCE_TEST_DATABASE_URL is not configured")
    import importlib.util
    from pathlib import Path
    from uuid import uuid4

    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import create_engine, inspect

    path = (
        Path(__file__).parents[1]
        / "alembic/versions/ba6f029c184e_add_maintenance_triage.py"
    )
    spec = importlib.util.spec_from_file_location("maintenance_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine(database_url)
    # All DDL is rolled back, including the isolated schema itself.
    with engine.connect() as connection:
        transaction = connection.begin()
        schema = "maintenance_test_" + uuid4().hex
        try:
            connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
            connection.exec_driver_sql(f'SET LOCAL search_path TO "{schema}"')
            connection.exec_driver_sql("CREATE TABLE apps (app_id varchar PRIMARY KEY)")
            connection.exec_driver_sql(
                "CREATE TABLE flathubuser (id integer PRIMARY KEY)"
            )
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
                assert inspect(connection).has_table("maintenancetriage", schema=schema)
                migration.downgrade()
                assert not inspect(connection).has_table(
                    "maintenancetriage", schema=schema
                )
        finally:
            transaction.rollback()
    engine.dispose()
