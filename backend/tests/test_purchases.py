import base64
from contextlib import contextmanager
import os
import sys
from types import SimpleNamespace

import jwt
import pytest
from fastapi import HTTPException

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(ROOT_DIR)

from app.routes import purchases


UPDATE_SECRET = base64.b64encode(b"test-update-secret").decode()
FLAT_MANAGER_SECRET = base64.b64encode(b"test-flat-manager-secret").decode()


def _update_token(**claims):
    claims.setdefault("exp", 2_000_000_000)
    return jwt.encode(
        claims,
        base64.b64decode(UPDATE_SECRET),
        algorithm="HS256",
    )


@pytest.fixture
def token_config(monkeypatch):
    monkeypatch.setattr(
        purchases.config.settings, "update_token_secret", UPDATE_SECRET
    )
    monkeypatch.setattr(
        purchases.config.settings, "flat_manager_secret", FLAT_MANAGER_SECRET
    )


@pytest.mark.parametrize(
    "claims",
    [
        {"token-id": "token-1"},
        {"user-id": 42},
    ],
)
def test_download_token_rejects_signed_tokens_missing_required_claims(
    token_config, claims
):
    token = _update_token(**claims)

    with pytest.raises(HTTPException) as exc_info:
        purchases.get_download_token(["app/org.example.App/x86_64/stable"], token)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "invalid_token"


def test_download_token_rejects_signed_tokens_without_expiration(token_config):
    token = jwt.encode(
        {"token-id": "token-1", "user-id": 42},
        base64.b64decode(UPDATE_SECRET),
        algorithm="HS256",
    )

    with pytest.raises(HTTPException) as exc_info:
        purchases.get_download_token(["app/org.example.App/x86_64/stable"], token)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "invalid_token"


def test_download_token_checks_ownership_for_user_in_update_token(
    monkeypatch, token_config
):
    checked = []
    monkeypatch.setattr(
        purchases, "_check_purchases", lambda appids, user_id: checked.append((appids, user_id))
    )
    token = _update_token(**{"token-id": "token-1", "user-id": 42})

    purchases.get_download_token(["app/org.example.App/x86_64/stable"], token)

    assert checked == [(["org.example.App"], 42)]


def test_purchase_check_uses_base_app_for_locale_and_debug_refs(monkeypatch):
    checked = []

    @contextmanager
    def fake_get_db(_db_type):
        yield SimpleNamespace()

    monkeypatch.setattr(purchases, "get_db", fake_get_db)
    monkeypatch.setattr(
        purchases.models.UserOwnedApp,
        "user_owns_app",
        lambda _db, _user_id, app_id: checked.append(app_id) or True,
    )

    purchases._check_purchases(
        ["org.example.App.Locale", "org.example.App.Debug"], 42
    )

    assert checked == ["org.example.App"]


def test_download_token_preserves_locale_and_debug_refs(monkeypatch, token_config):
    monkeypatch.setattr(
        purchases, "_check_purchases", lambda _appids, _user_id: None
    )
    token = _update_token(**{"token-id": "token-1", "user-id": 42})

    result = purchases.get_download_token(
        [
            "app/org.example.App.Locale/x86_64/stable",
            "app/org.example.App.Debug/x86_64/stable",
        ],
        token,
    )

    download_claims = jwt.decode(
        result.token,
        base64.b64decode(FLAT_MANAGER_SECRET),
        algorithms=["HS256"],
    )
    assert download_claims["sub"] == "download"
    assert download_claims["apps"] == [
        "org.example.App.Locale",
        "org.example.App.Debug",
    ]


def test_download_token_refreshes_update_token_without_changing_identity(
    monkeypatch, token_config
):
    monkeypatch.setattr(purchases, "_check_purchases", lambda *_args: None)
    token = _update_token(**{"token-id": "token-1", "user-id": 42})

    result = purchases.get_download_token(["app/org.example.App/x86_64/stable"], token)

    refreshed_claims = jwt.decode(
        result.update_token,
        base64.b64decode(UPDATE_SECRET),
        algorithms=["HS256"],
    )
    assert refreshed_claims["token-id"] == "token-1"
    assert refreshed_claims["user-id"] == 42
