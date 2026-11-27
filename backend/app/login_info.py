import secrets
import time
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass
from enum import StrEnum
from typing import Annotated, cast

import redis
from fastapi import Depends, HTTPException, Request

from . import config, models, utils
from .database import get_db

REAUTH_FRESHNESS_SECONDS = 300
SESSION_MAX_AGE = 86400
_session_store = redis.Redis(
    host=config.settings.redis_state_host,
    port=config.settings.redis_state_port,
    db=config.settings.redis_state_db,
    socket_connect_timeout=0.2,
    socket_timeout=0.2,
)


def mark_recently_authenticated(request: Request) -> None:
    request.session["auth-time"] = int(time.time())


def recently_authenticated(request: Request) -> bool:
    auth_time = request.session.get("auth-time")
    return (
        isinstance(auth_time, int | float)
        and not isinstance(auth_time, bool)
        and 0 <= time.time() - auth_time < REAUTH_FRESHNESS_SECONDS
    )


def require_recent_authentication(request: Request) -> None:
    if not recently_authenticated(request):
        raise HTTPException(status_code=403, detail="reauthentication_required")


class LoginState(StrEnum):
    """Login state, used to track state machine for login flows etc."""

    LOGGED_OUT = "logged-out"
    LOGGING_IN = "logging-in"
    LOGGED_IN = "logged-in"
    LOGGING_IN_AGAIN = "logging-in-again"

    def logged_in(self):
        """Returns whether this LoginState suggests the user is logged in at all"""
        return self == LoginState.LOGGED_IN or self == LoginState.LOGGING_IN_AGAIN

    def logging_in(self):
        """Returns whether this LoginState indicates a login flow is in action right now"""
        return self == LoginState.LOGGING_IN or self == LoginState.LOGGING_IN_AGAIN


@dataclass
class LoginInformation[U: models.FlathubUser | None = models.FlathubUser | None]:
    state: LoginState
    user: U
    method: str | None

    def __getitem__(self, key):
        return getattr(self, key)


LoggedInInformation = LoginInformation[models.FlathubUser]


@contextmanager
def _session_key(session_id: str) -> Generator[str]:
    try:
        yield f"auth:session:{session_id}"
    except redis.RedisError as exc:
        raise HTTPException(503, "session_store_unavailable") from exc


def revoke_authenticated_session(request: Request) -> bool:
    session_id = request.session.get("session-id")
    if session_id is not None:
        with _session_key(session_id) as key:
            revoked = _session_store.delete(key)
        del request.session["session-id"]
        return bool(revoked)
    return False


@contextmanager
def establish_authenticated_session(
    request: Request,
    user_id: int,
    method: str,
    passkey_id: int | None = None,
    *,
    reset_session: bool = False,
) -> Generator[None]:
    """Reserve the login before committing its transaction; publish the cookie after."""
    # Linking OAuth changes the method of an existing login. Keep its revocation
    # record so logout (including a concurrent logout) still covers both cookies.
    session_id = request.session.get("session-id")
    if request.session.get("user-id") != user_id:
        revoke_authenticated_session(request)
        session_id = None
    if session_id is None:
        session_id = secrets.token_urlsafe(32)
        with _session_key(session_id) as key:
            _session_store.set(key, user_id, ex=SESSION_MAX_AGE)
    yield
    if reset_session:
        pending_oidc = request.session.get("oidc_authorize_params")
        request.session.clear()
        if isinstance(pending_oidc, dict):
            request.session["oidc_authorize_params"] = pending_oidc
    request.session["session-id"] = session_id
    request.session["user-id"] = user_id
    request.session["auth-method"] = method
    mark_recently_authenticated(request)
    if method == "passkey":
        request.session["passkey-id"] = passkey_id
    else:
        request.session.pop("passkey-id", None)
    request.session.pop("passkey-flow", None)


def _passkey_session_user(request: Request, user_id) -> models.FlathubUser | None:
    passkey_id = request.session.get("passkey-id")
    if type(passkey_id) is int:
        with get_db("writer") as db:
            user = db.session.get(models.FlathubUser, user_id)
            credential = db.session.get(models.PasskeyCredential, passkey_id)
            if (
                user is not None
                and not user.login_disabled
                and credential is not None
                and credential.user == user.id
            ):
                db.session.expunge(user)
                return user
    request.session.clear()
    return None


def _session_is_active(request: Request, user_id: int) -> bool:
    session_id = request.session.get("session-id")
    if not isinstance(session_id, str):
        return False
    with _session_key(session_id) as key:
        owner = _session_store.get(key)
    return owner == str(user_id).encode()


def login_state(request: Request) -> LoginInformation:
    """
    A dependency which can be used to inject login status into endpoints.

    Returns a dictionary of:

    {
        state: LoginState,
        user: Optional[models.FlathubUser],
        method: Optional[str],
    }

    where the `user` value will be present if logged in at all
    And the method value will be present if a login flow is in progress
    """

    state: LoginState = LoginState.LOGGED_OUT
    user: models.FlathubUser | None = None
    method: str | None = None

    user_id = request.session.get("user-id", None)
    user = None
    if user_id is not None and not _session_is_active(request, user_id):
        request.session.clear()
    elif user_id is not None and request.session.get("auth-method") == "passkey":
        user = _passkey_session_user(request, user_id)
    elif user_id is not None:
        with get_db("replica") as db:
            user = db.session.get(models.FlathubUser, user_id)
            if user is not None and user.login_disabled:
                user = None
                revoke_authenticated_session(request)
                del request.session["user-id"]
            elif user is not None and request.session.get("auth-method") == "email":
                account = models.EmailAccount.by_user(db, user)
                if account is None or account.disabled_at is not None:
                    user = None
                    request.session.clear()
    if user is not None:
        state = LoginState.LOGGED_IN
    active_flow = request.session.get("active-login-flow", None)
    if active_flow is not None:
        method = active_flow
        if state == LoginState.LOGGED_IN:
            state = LoginState.LOGGING_IN_AGAIN
        else:
            state = LoginState.LOGGING_IN
    return LoginInformation(state, user, method)


LoginStatusDep = Annotated[LoginInformation, Depends(login_state)]


def logged_in(login: LoginStatusDep) -> LoggedInInformation:
    if login.state == LoginState.LOGGED_OUT or login.user is None:
        raise HTTPException(status_code=401, detail="not_logged_in")

    return cast("LoggedInInformation", login)


LoggedInDep = Annotated[LoggedInInformation, Depends(logged_in)]


def quality_moderator_only(login: LoggedInDep):
    with get_db("replica") as db:
        user = db.session.merge(login.user)
        if "quality-moderation" not in user.permissions():
            raise HTTPException(status_code=403, detail="not_quality_moderator")
        login.user = user
        return login


def view_users_only(login: LoggedInDep):
    with get_db("replica") as db:
        user = db.session.merge(login.user)
        if "view-users" not in user.permissions():
            raise HTTPException(status_code=403, detail="no_permission_to_view_users")
        login.user = user
        return login


def modify_users_only(login: LoggedInDep):
    with get_db("replica") as db:
        user = db.session.merge(login.user)
        if "modify-users" not in user.permissions():
            raise HTTPException(status_code=403, detail="no_permission_to_modify_users")
        login.user = user
        return login


def manage_oidc_clients_only(login: LoggedInDep):
    with get_db("replica") as db:
        user = db.session.get(models.FlathubUser, login.user.id)
        if user is None or "manage-oidc-clients" not in user.permissions():
            raise HTTPException(
                status_code=403, detail="no_permission_to_manage_oidc_clients"
            )
        login.user = user
        return login


def moderator_only(login: LoggedInDep):
    with get_db("replica") as db:
        user = db.session.merge(login.user)
        if "moderation" not in user.permissions():
            raise HTTPException(status_code=403, detail="not_moderator")
        login.user = user
        return login


def require_active_user(db, user_id: int) -> models.FlathubUser:
    user = db.session.get(models.FlathubUser, user_id)
    if user is None or user.login_disabled:
        raise HTTPException(status_code=401, detail="not_logged_in")
    return user


def can_manage_app(db, user: models.FlathubUser, app_id: str) -> bool:
    """Check app access without treating an administrator as a team member."""
    if app_id in user.dev_flatpaks(db):
        return True
    if models.MANAGE_APPS_PERMISSION not in user.permissions():
        return False
    return (
        models.App.by_appid(db, app_id) is not None
        or models.DirectUploadApp.by_app_id(db, app_id) is not None
        or models.RuntimeScope.by_app_id(db, app_id) is not None
        or (
            utils.is_valid_app_id(app_id)
            and models.GithubRepository.exists_by_name(db, app_id)
        )
    )


def manage_apps_only(login: LoggedInDep):
    with get_db("writer") as db:
        user = require_active_user(db, login.user.id)
        if models.MANAGE_APPS_PERMISSION not in user.permissions():
            raise HTTPException(status_code=403, detail="no_permission_to_manage_apps")
        db.session.expunge(user)
        login.user = user
        return login


def moderator_or_app_author_only(app_id: str, login: LoggedInDep):
    with get_db("writer") as db:
        user = require_active_user(db, login.user.id)
        if "moderation" not in user.permissions() and not can_manage_app(
            db, user, app_id
        ):
            raise HTTPException(status_code=403, detail="not_app_developer")
        db.session.expunge(user)
        login.user = user
        return login


def app_author_only(app_id: str, login: LoggedInDep):
    with get_db("replica") as db:
        user = db.session.merge(login.user)
        if app_id in user.dev_flatpaks(db):
            login.user = user
            return login

    raise HTTPException(status_code=403, detail="not_app_author")


def quality_moderator_or_app_author_only(app_id: str, login: LoggedInDep):
    if login.user:
        with get_db("writer") as db:
            user = require_active_user(db, login.user.id)
            if "quality-moderation" in user.permissions() or can_manage_app(
                db, user, app_id
            ):
                db.session.expunge(user)
                login.user = user
                return login

    raise HTTPException(status_code=403, detail="not_quality_moderator_or_app_author")


QualityModeratorDep = Annotated[LoggedInInformation, Depends(quality_moderator_only)]
ViewUsersDep = Annotated[LoggedInInformation, Depends(view_users_only)]
ModifyUsersDep = Annotated[LoggedInInformation, Depends(modify_users_only)]
ManageAppsDep = Annotated[LoggedInInformation, Depends(manage_apps_only)]
ManageOidcClientsDep = Annotated[LoggedInInformation, Depends(manage_oidc_clients_only)]
ModeratorDep = Annotated[LoggedInInformation, Depends(moderator_only)]
ModeratorOrAppAuthorDep = Annotated[
    LoggedInInformation, Depends(moderator_or_app_author_only)
]
AppAuthorDep = Annotated[LoggedInInformation, Depends(app_author_only)]
QualityModeratorOrAppAuthorDep = Annotated[
    LoggedInInformation, Depends(quality_moderator_or_app_author_only)
]
