import os
import sys
from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(ROOT_DIR)

from app.routes import upload_tokens


class FakeRequest:
    class _Client:
        host = "127.0.0.1"

    client = _Client()
    headers = {"user-agent": "test-ua"}


class FakeLogin:
    def __init__(self, user, logged_in=True):
        self.user = user
        self.state = SimpleNamespace(logged_in=lambda: logged_in)


class FakeSession:
    def __init__(self, user):
        self.user = user
        self.added = []

    def merge(self, user):
        return self.user

    def add(self, value):
        self.added.append(value)

    def commit(self):
        pass


def _configure(monkeypatch, *, user):
    monkeypatch.setattr(
        upload_tokens.config.settings,
        "flat_manager_api",
        "https://flat-manager.example",
    )

    sessions = []

    @contextmanager
    def fake_get_db(_db_type="replica"):
        session = FakeSession(user)
        sessions.append(session)
        yield SimpleNamespace(session=session)

    monkeypatch.setattr(upload_tokens, "get_db", fake_get_db)
    return sessions


def _token():
    return SimpleNamespace(id=7, app_id="org.example.App", revoked=False)


def test_revoke_upload_token_requires_login(monkeypatch):
    monkeypatch.setattr(
        upload_tokens.config.settings, "flat_manager_api", "https://flat-manager.example"
    )

    with pytest.raises(HTTPException) as exc_info:
        upload_tokens.revoke_upload_token(
            7,
            http_request=FakeRequest(),
            login=FakeLogin(None, logged_in=False),
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == upload_tokens.ErrorDetail.NOT_LOGGED_IN


def test_revoke_upload_token_requires_access_before_remote_revoke(monkeypatch):
    user = SimpleNamespace(
        id=42,
        permissions=lambda: set(),
        dev_flatpaks=lambda _db: {"org.example.App"},
    )
    _configure(monkeypatch, user=user)
    token = _token()
    monkeypatch.setattr(
        upload_tokens.models.UploadToken,
        "by_id",
        staticmethod(lambda _db, _token_id: token),
    )
    remote_calls = []
    monkeypatch.setattr(upload_tokens.http_client, "post", remote_calls.append)

    with pytest.raises(HTTPException) as exc_info:
        upload_tokens.revoke_upload_token(
            7, http_request=FakeRequest(), login=FakeLogin(user)
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == upload_tokens.ErrorDetail.NOT_UPLOADER
    assert remote_calls == []
    assert token.revoked is False


def test_revoke_upload_token_does_not_mark_local_token_on_remote_failure(monkeypatch):
    user = SimpleNamespace(
        id=42,
        permissions=lambda: {"direct-upload"},
        dev_flatpaks=lambda _db: {"org.example.App"},
    )
    _configure(monkeypatch, user=user)
    token = _token()
    monkeypatch.setattr(
        upload_tokens.models.UploadToken,
        "by_id",
        staticmethod(lambda _db, _token_id: token),
    )
    monkeypatch.setattr(
        upload_tokens.utils, "create_flat_manager_token", lambda *args, **kwargs: "jwt"
    )
    monkeypatch.setattr(
        upload_tokens.http_client,
        "post",
        lambda *args, **kwargs: SimpleNamespace(is_success=False),
    )

    with pytest.raises(HTTPException) as exc_info:
        upload_tokens.revoke_upload_token(
            7, http_request=FakeRequest(), login=FakeLogin(user)
        )

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == upload_tokens.ErrorDetail.FLAT_MANAGER_ERROR
    assert token.revoked is False
