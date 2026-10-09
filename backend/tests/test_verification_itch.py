import importlib
import os
import sys
import types
from contextlib import contextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import HTTPException

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(ROOT_DIR)


def _load_verification_module(monkeypatch):
    fake_worker = types.ModuleType("app.worker")
    fake_worker.republish_app = SimpleNamespace(send=lambda _app_id: None)

    fake_logins = types.ModuleType("app.logins")
    fake_logins.LoginInformation = type("LoginInformation", (), {})
    fake_logins.refresh_oauth_token = lambda _account: None

    monkeypatch.setitem(sys.modules, "app.worker", fake_worker)
    monkeypatch.setitem(sys.modules, "app.logins", fake_logins)
    sys.modules.pop("app.verification", None)

    import app.verification as verification_module

    return importlib.reload(verification_module)


def test_itch_app_id_maps_to_username(monkeypatch):
    verification = _load_verification_module(monkeypatch)
    assert verification._get_provider_username("io.itch.example_dev.MyGame") == (
        verification.LoginProvider.ITCH,
        "example-dev",
    )


def test_start_itch_verification_returns_authorization_url(monkeypatch):
    verification = _load_verification_module(monkeypatch)
    monkeypatch.setattr(verification, "_check_app_id", lambda *_args: None)
    monkeypatch.setattr(verification.config.settings, "itch_client_id", "client-id")
    monkeypatch.setattr(
        verification.config.settings,
        "itch_return_url",
        "https://flathub.org/login/itch-verification",
    )
    request = SimpleNamespace(session={})
    login = SimpleNamespace(user=SimpleNamespace(id=42))

    result = verification.start_itch_verification(
        verification.ItchVerificationStartRequest(
            new_app=False, return_to="/apps/io.itch.example_dev.MyGame"
        ),
        request,
        login,
        "io.itch.example_dev.MyGame",
    )

    parsed = urlsplit(result.redirect)
    params = parse_qs(parsed.query)
    assert parsed.scheme == "https"
    assert parsed.netloc == "itch.io"
    assert parsed.path == "/user/oauth"
    assert params["client_id"] == ["client-id"]
    assert params["scope"] == ["profile:me"]
    assert params["response_type"] == ["token"]
    assert params["redirect_uri"] == ["https://flathub.org/login/itch-verification"]
    assert params["state"] == [request.session["itch_verification"]["state"]]


def test_complete_itch_verification_checks_identity_and_records_verification(
    monkeypatch,
):
    verification = _load_verification_module(monkeypatch)
    app_id = "io.itch.example_dev.MyGame"
    state = "one-time-state"
    request = SimpleNamespace(
        session={
            "itch_verification": {
                "state": state,
                "app_id": app_id,
                "user_id": 42,
                "new_app": False,
                "return_to": f"/apps/{app_id}",
                "created_at": datetime.now(UTC).timestamp(),
            }
        }
    )
    login = SimpleNamespace(user=SimpleNamespace(id=42))
    inserted = []

    class Session:
        def add(self, item):
            inserted.append(item)

    @contextmanager
    def fake_get_db(_name):
        yield SimpleNamespace(session=Session())

    monkeypatch.setattr(verification, "_check_app_id", lambda *_args: None)
    monkeypatch.setattr(verification, "get_db", fake_get_db)
    monkeypatch.setattr(verification, "require_oauth_upgrade", lambda *_args: None)
    monkeypatch.setattr(
        verification, "_cleanup_stale_verifications", lambda *_args: None
    )
    monkeypatch.setattr(
        verification.http_client,
        "get",
        lambda *_args, **_kwargs: SimpleNamespace(
            status_code=200,
            json=lambda: {"user": {"username": "example-dev"}},
        ),
    )

    result = verification.complete_itch_verification(
        verification.ItchVerificationCompleteRequest(
            state=state, access_token="secret-token"
        ),
        request,
        login,
    )

    assert result.app_id == app_id
    assert result.return_to == f"/apps/{app_id}"
    assert len(inserted) == 1
    assert inserted[0].method == "login_provider"
    assert inserted[0].verified is True
    assert inserted[0].login_is_organization is False
    assert "itch_verification" not in request.session


def test_complete_itch_verification_rejects_mismatched_account(monkeypatch):
    verification = _load_verification_module(monkeypatch)
    request = SimpleNamespace(
        session={
            "itch_verification": {
                "state": "one-time-state",
                "app_id": "io.itch.example_dev.MyGame",
                "user_id": 42,
                "new_app": False,
                "return_to": "/apps/io.itch.example_dev.MyGame",
                "created_at": datetime.now(UTC).timestamp(),
            }
        }
    )
    login = SimpleNamespace(user=SimpleNamespace(id=42))
    monkeypatch.setattr(verification, "_check_app_id", lambda *_args: None)
    monkeypatch.setattr(
        verification.http_client,
        "get",
        lambda *_args, **_kwargs: SimpleNamespace(
            status_code=200,
            json=lambda: {"user": {"username": "somebody-else"}},
        ),
    )

    with pytest.raises(HTTPException) as exc:
        verification.complete_itch_verification(
            verification.ItchVerificationCompleteRequest(
                state="one-time-state", access_token="secret-token"
            ),
            request,
            login,
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == verification.ErrorDetail.USERNAME_DOES_NOT_MATCH
    assert "itch_verification" not in request.session
