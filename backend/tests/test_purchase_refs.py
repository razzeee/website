import base64
import os
import sys
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import HTTPException

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(ROOT_DIR)

from app.routes import purchases


UPDATE_SECRET = base64.b64encode(b"test-update-secret").decode()


def _update_token(monkeypatch):
    monkeypatch.setattr(
        purchases.config.settings, "update_token_secret", UPDATE_SECRET
    )
    return jwt.encode(
        {
            "token-id": "token-1",
            "user-id": 42,
            "exp": datetime.now(UTC) + timedelta(hours=1),
        },
        base64.b64decode(UPDATE_SECRET),
        algorithm="HS256",
    )


@pytest.mark.parametrize("app_ref", ["app//x86_64/stable", "/x86_64/stable"])
def test_check_purchases_rejects_refs_without_an_app_id(app_ref):
    class State:
        def logged_in(self):
            return True

    login = type("Login", (), {"state": State(), "user": type("User", (), {"id": 42})()})()

    with pytest.raises(HTTPException) as exc_info:
        purchases.check_purchases([app_ref], login)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "invalid_app_id"


def test_download_token_rejects_ref_without_an_app_id(monkeypatch):
    token = _update_token(monkeypatch)

    with pytest.raises(HTTPException) as exc_info:
        purchases.get_download_token(["app//x86_64/stable"], token)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "invalid_app_id"
