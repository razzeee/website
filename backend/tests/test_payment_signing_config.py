import base64

import pytest

from app.config import Settings


@pytest.mark.parametrize(
    "env,key",
    [
        ("production", None),
        ("production", ""),
        ("production", "change-me-for-production".ljust(32)),
        ("production", " " * 32),
        ("staging", "a" * 31),
    ],
)
def test_invalid_session_key_rejected(monkeypatch, env, key):
    monkeypatch.setenv("ENV", env)
    if key is None:
        monkeypatch.delenv("SESSION_SECRET_KEY", raising=False)
    else:
        monkeypatch.setenv("SESSION_SECRET_KEY", key)
    with pytest.raises(RuntimeError, match="SESSION_SECRET_KEY"):
        Settings().validate_signing_keys()


@pytest.mark.parametrize("env", ["development", "test"])
def test_local_environments_accept_default_session_key(env):
    Settings.model_construct(env=env).validate_signing_keys()


def test_production_warns_for_invalid_update_or_repository_keys(caplog):
    settings = Settings.model_construct(env="production", session_secret_key="é" * 16)
    settings.validate_signing_keys()
    assert len(caplog.records) == 1
    caplog.clear()
    settings.update_token_secret = base64.b64encode(b"b" * 32).decode()
    settings.flat_manager_secret = settings.update_token_secret
    settings.validate_signing_keys()
    assert len(caplog.records) == 1
    caplog.clear()
    settings.flat_manager_secret = base64.b64encode(b"c" * 32).decode()
    settings.validate_signing_keys()
    assert not caplog.records
    settings.update_token_secret = "not-base64!"
    settings.validate_signing_keys()
    assert len(caplog.records) == 1
    assert "Base64" in caplog.text
    assert settings.update_token_secret not in caplog.text
