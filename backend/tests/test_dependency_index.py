"""Run with DEPENDENCY_TEST_DATABASE_URL pointing to a disposable PostgreSQL DB."""

import importlib.util
import os
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, text
from sqlalchemy.orm import Session

from app import models
from app.db_session import DBSession

with patch("meilisearch.Client"):
    from app import dependency_index as index
from app.routes import dependencies as api

REF = "app/org.example.App/x86_64/stable"
COMMIT = "a" * 64
MANIFEST = {
    "modules": [
        {
            "name": "OpenSSL",
            "sources": [
                {
                    "type": "archive",
                    "url": "https://example.org/openssl.tar.gz",
                    "sha256": "b" * 64,
                }
            ],
        }
    ]
}


@pytest.fixture
def database(monkeypatch):
    url = os.getenv("DEPENDENCY_TEST_DATABASE_URL")
    if not url:
        pytest.skip(
            "DEPENDENCY_TEST_DATABASE_URL is required for PostgreSQL integration"
        )
    schema = f"dependency_test_{uuid4().hex}"
    root = create_engine(url)
    with root.begin() as connection:
        connection.execute(text(f"CREATE SCHEMA {schema}"))
    engine = create_engine(url, connect_args={"options": f"-c search_path={schema}"})
    migration_path = (
        Path(__file__).parents[1]
        / "alembic/versions/eb417a2d8c91_add_dependency_index.py"
    )
    spec = importlib.util.spec_from_file_location(
        "dependency_migration", migration_path
    )
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        connection.execute(
            text("CREATE TABLE apps (app_id varchar PRIMARY KEY, type varchar)")
        )
        connection.execute(
            text(
                "INSERT INTO apps VALUES ('org.example.App', 'desktop-application'), ('org.example.Other', 'desktop-application')"
            )
        )

    @contextmanager
    def get_db(kind="replica"):
        with Session(engine) as session:
            yield DBSession(session)
            if kind == "writer":
                session.commit()

    monkeypatch.setattr(index, "get_db", get_db)
    monkeypatch.setattr(api, "get_db", get_db)
    monkeypatch.setattr(index, "list_published_refs", lambda *a, **kw: {REF: COMMIT})
    monkeypatch.setattr(index, "read_published_manifest", lambda *a, **kw: MANIFEST)
    app = FastAPI()
    api.register_to_app(app)
    try:
        yield get_db, TestClient(app)
        with engine.begin() as connection:
            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()
            assert (
                connection.execute(
                    text("SELECT to_regclass('dependencyrefstate')")
                ).scalar()
                is None
            )
    finally:
        engine.dispose()
        with root.begin() as connection:
            connection.execute(text(f"DROP SCHEMA {schema} CASCADE"))
        root.dispose()


def populate():
    work = index.enumerate_dependencies()
    for state_id, commit in work:
        index.index_dependency_ref(state_id, commit)
    return work


def test_search_snapshot_pagination_and_exact_identity(database):
    _db, client = database
    populate()
    assert index.enumerate_dependencies() == []
    first = client.get("/dependencies", params={"q": "open", "limit": 1}).json()
    assert first["coverage"]["complete"] == 1
    assert first["matches"][0]["kind"] == "module"
    second = client.get(
        "/dependencies",
        params={"q": "open", "limit": 1, "cursor": first["next_cursor"]},
    ).json()
    assert second["matches"][0]["kind"] == "archive"
    assert second["next_cursor"] is None
    assert second["matches"][0]["id"] != first["matches"][0]["id"]
    assert (
        client.get(
            "/dependencies", params={"q": "other", "cursor": first["next_cursor"]}
        ).status_code
        == 422
    )
    assert client.get("/dependencies", params={"q": "%"}).json()["matches"] == []
    assert (
        client.get(
            "/dependencies",
            params={"q": "https://example.org/other.tar.gz", "match": "source"},
        ).json()["matches"]
        == []
    )
    exact = client.get(
        "/dependencies",
        params={"q": "https://example.org/openssl.tar.gz", "match": "source"},
    ).json()["matches"][0]
    assert exact["pointer"] == "/modules/0/sources/0"
    snapshot = client.get(f"/dependencies/snapshots/{exact['snapshot_id']}").json()
    assert snapshot["commit"] == COMMIT
    assert snapshot["manifest"] == MANIFEST
    assert client.get("/dependencies/snapshots/999999").status_code == 404


def test_failed_refresh_preserves_old_snapshot_and_is_stale(database, monkeypatch):
    db, client = database
    populate()
    new_commit = "c" * 64
    monkeypatch.setattr(
        index, "list_published_refs", lambda *a, **kw: {REF: new_commit}
    )
    work = index.enumerate_dependencies()
    monkeypatch.setattr(index, "read_published_manifest", lambda *a, **kw: None)
    index.index_dependency_ref(*work[0])
    response = client.get("/dependencies", params={"q": "open"}).json()
    assert response["coverage"]["missing"] == 1
    assert response["matches"][0]["commit"] == COMMIT
    assert response["matches"][0]["stale"] is True
    with db() as session:
        assert session.session.query(models.DependencyManifestSnapshot).count() == 1


def test_failed_enumeration_does_not_withdraw_but_success_does(database, monkeypatch):
    _db, client = database
    populate()

    def fail(*a, **kw):
        raise index.ManifestRetrievalError("network")

    monkeypatch.setattr(index, "list_published_refs", fail)
    with pytest.raises(index.ManifestRetrievalError):
        index.enumerate_dependencies()
    assert client.get("/dependencies").json()["coverage"]["total"] == 1
    monkeypatch.setattr(index, "list_published_refs", lambda *a, **kw: {})
    index.enumerate_dependencies()
    assert client.get("/dependencies", params={"q": "open"}).json()["matches"] == []
    assert client.get("/dependencies/snapshots/1").status_code == 200


def test_late_job_cannot_replace_newer_observation(database, monkeypatch):
    db, client = database
    work = index.enumerate_dependencies()

    def read(*a, **kw):
        with db("writer") as session:
            state = session.session.get(models.DependencyRefState, work[0][0])
            state.observed_commit = "d" * 64
        return MANIFEST

    monkeypatch.setattr(index, "read_published_manifest", read)
    index.index_dependency_ref(*work[0])
    assert client.get("/dependencies", params={"q": "open"}).json()["matches"] == []
    with db() as session:
        assert session.session.query(models.DependencyManifestSnapshot).count() == 0


def test_pilot_does_not_withdraw_unselected_apps_and_duplicate_is_idempotent(database):
    db, _client = database
    work = populate()
    assert index.enumerate_dependencies(["org.example.Other"]) == []
    index.index_dependency_ref(*work[0])
    with db() as session:
        assert session.session.query(models.DependencyDeclaration).count() == 2
        assert (
            session.session.query(models.DependencyRefState)
            .filter_by(active=True)
            .count()
            == 1
        )


def test_snapshot_and_declarations_are_atomic(database, monkeypatch):
    db, _client = database
    work = index.enumerate_dependencies()
    original = models.DependencyDeclaration

    def fail(**kwargs):
        if kwargs["kind"] == "archive":
            raise RuntimeError("simulated insert failure")
        return original(**kwargs)

    with monkeypatch.context() as context:
        context.setattr(models, "DependencyDeclaration", fail)
        with pytest.raises(RuntimeError):
            index.index_dependency_ref(*work[0])
    with db() as session:
        assert (
            session.session.query(
                func.count(models.DependencyManifestSnapshot.id)
            ).scalar()
            == 0
        )
        assert (
            session.session.query(models.DependencyRefState).one().status == "pending"
        )


def test_refresh_retains_immutable_links_and_excludes_new_rows_from_old_cursor(
    database, monkeypatch
):
    _db, client = database
    populate()
    old = client.get("/dependencies", params={"q": "open", "limit": 1}).json()
    old_snapshot = old["matches"][0]["snapshot_id"]
    new_commit = "e" * 64
    monkeypatch.setattr(
        index, "list_published_refs", lambda *a, **kw: {REF: new_commit}
    )
    monkeypatch.setattr(
        index,
        "read_published_manifest",
        lambda *a, **kw: {"modules": [{"name": "OpenSSL-new"}]},
    )
    populate()
    new = client.get("/dependencies", params={"q": "open"}).json()
    assert new["matches"][0]["commit"] == new_commit
    assert new["matches"][0]["stale"] is False
    assert (
        client.get(f"/dependencies/snapshots/{old_snapshot}").json()["manifest"]
        == MANIFEST
    )
    assert (
        client.get(
            "/dependencies", params={"q": "open", "cursor": old["next_cursor"]}
        ).json()["matches"]
        == []
    )
