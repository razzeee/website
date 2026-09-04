import os
import sys
from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(ROOT_DIR)

from app import verification


class FakeLogin:
    user = SimpleNamespace(id=42)


class FakeRequest:
    endoflife = None
    endoflife_rebase = None


def _configure(monkeypatch, *, direct_upload_app=None):
    monkeypatch.setattr(verification.config.settings, "flat_manager_api", "https://flat-manager.example")
    monkeypatch.setattr(verification, "is_appid_runtime", lambda _app_id: False)
    monkeypatch.setattr(
        verification.models.RuntimeScope,
        "by_app_id",
        staticmethod(lambda _db, _app_id: None),
    )
    monkeypatch.setattr(
        verification.models.DirectUploadApp,
        "by_app_id",
        staticmethod(lambda _db, _app_id: direct_upload_app),
    )
    monkeypatch.setattr(
        verification.models.UploadToken,
        "by_app_id",
        staticmethod(lambda _db, _app_id: []),
    )

    @contextmanager
    def fake_get_db(_db_type="replica"):
        yield SimpleNamespace(session=SimpleNamespace(merge=lambda value: value, commit=lambda: None))

    monkeypatch.setattr(verification, "get_db", fake_get_db)


def test_archive_normal_app_archives_github_and_republishes(monkeypatch):
    _configure(monkeypatch)
    archived = []
    republished = []
    monkeypatch.setattr(verification, "_archive_github_repo", lambda app_id: archived.append(app_id) or True)
    monkeypatch.setattr(verification.worker.republish_app, "send", lambda *args: republished.append(args))

    verification.archive(FakeRequest(), FakeLogin(), "org.example.App")

    assert archived == ["org.example.App"]
    assert republished == [("org.example.App", None, None)]


def test_archive_does_not_republish_when_github_archive_fails(monkeypatch):
    _configure(monkeypatch)
    republished = []
    monkeypatch.setattr(verification, "_archive_github_repo", lambda _app_id: False)
    monkeypatch.setattr(verification.worker.republish_app, "send", lambda *args: republished.append(args))

    verification.archive(FakeRequest(), FakeLogin(), "org.example.App")

    assert republished == []
