import base64
import datetime
from enum import StrEnum
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import select

from . import http_client, models
from .config import settings
from .db_session import DBSession
from .types import JSONValue


class EmailCategory(StrEnum):
    BUILD_NOTIFICATION = "build_notification"
    DEVELOPER_INVITE = "developer_invite"
    DEVELOPER_INVITE_ACCEPTED = "developer_invite_accepted"
    DEVELOPER_INVITE_DECLINED = "developer_invite_declined"
    DEVELOPER_LEFT = "developer_left"
    MODERATION_APPROVED = "moderation_approved"
    MODERATION_HELD = "moderation_held"
    MODERATION_REJECTED = "moderation_rejected"
    SECURITY_LOGIN = "security_login"
    UPLOAD_TOKEN_CREATED = "upload_token_created"


def _get_destination_and_append(
    payload: dict[str, JSONValue],
    db: DBSession,
    messages: list[tuple[str, dict[str, JSONValue]]],
    user: models.FlathubUser,
) -> None:
    message = _get_message_destination(user, payload, db)
    if message and message[0] not in dict(messages):
        messages.append(message)


def _get_message_destination(
    user: models.FlathubUser, payload: dict[str, JSONValue], db: DBSession
) -> tuple[str, dict[str, JSONValue]] | None:
    user_default_account = user.get_default_account(db)
    if user_default_account is None:
        print(f"Could not find default account for user #{user.id}")
        return None

    email = user_default_account.email
    if email is None:
        print(f"Could not find email address for user #{user.id}")
        return None

    return (email, payload)


def send_email_new(payload: dict[str, JSONValue], db: DBSession) -> None:
    from . import worker

    messages: list[tuple[str, dict[str, JSONValue]]] = []
    message_info = payload.get("messageInfo")

    if isinstance(message_info, dict):
        app_name = message_info.get("appName")
        subject = payload.get("subject")
        if isinstance(app_name, str) and isinstance(subject, str):
            payload["subject"] = f"{app_name} | {subject}"

        app_id = message_info.get("appId")
        if (
            isinstance(app_id, str)
            and app_id
            and not message_info.get("inform_only_moderators")
        ):
            by_github_repo = (
                db.session.query(models.FlathubUser)
                .filter(
                    models.FlathubUser.id.in_(
                        select(models.GithubAccount.user).where(
                            models.GithubAccount.id
                            == models.GithubRepository.github_account,
                            models.GithubRepository.reponame == app_id,
                        )
                    )
                )
                .all()
            )
            for user in by_github_repo:
                _get_destination_and_append(payload, db, messages, user)

            direct_upload_app = models.DirectUploadApp.by_app_id(db, app_id)
            if direct_upload_app is not None:
                by_direct_upload = models.DirectUploadAppDeveloper.by_app(
                    db, direct_upload_app
                )
                for _developer, user in by_direct_upload:
                    _get_destination_and_append(payload, db, messages, user)

    if "inform_only_moderators" in payload or "inform_moderators" in payload:
        users_with_moderator_permissions = models.FlathubUser.by_permission(
            db, "moderation"
        )
        for user in users_with_moderator_permissions:
            _get_destination_and_append(payload, db, messages, user)

    if payload.get("inform_admins"):
        admin_users = models.Role.by_name_users(db, models.RoleName.ADMIN)
        for user in admin_users:
            _get_destination_and_append(payload, db, messages, user)

    user_id = payload.get("userId")
    if isinstance(user_id, int) and (user := models.FlathubUser.by_id(db, user_id)):
        _get_destination_and_append(payload, db, messages, user)

    for destination, message in messages:
        worker.send_one_email_new.send(message, destination)


def send_one_email_new(payload: dict[str, JSONValue], dest: str) -> None:
    payload["to"] = dest

    result = http_client.post(f"{settings.backend_node_url}/emails", json=payload)

    if result.status_code != 200:
        raise RuntimeError(
            "Failed to send email",
            result.text or None,
            payload,
        )


router = APIRouter(prefix="/emails")


class BuildNotificationRequest(BaseModel):
    app_id: str
    build_id: int
    build_repo: str
    diagnostics: list[dict[str, JSONValue]]


def _diagnostic_is_warning(diagnostic: dict[str, JSONValue]) -> bool:
    is_warning = diagnostic["is_warning"]
    if not isinstance(is_warning, bool):
        raise TypeError("Build diagnostic is_warning must be a boolean")
    return is_warning


@router.post(
    "/build-notification",
    tags=["email"],
    responses={
        200: {"description": "Build notification sent successfully"},
        422: {"description": "Validation error"},
        500: {"description": "Internal server error"},
    },
)
def build_notification(
    request: BuildNotificationRequest,
    authorization: Annotated[HTTPAuthorizationCredentials, Depends(HTTPBearer())],
):
    from . import worker

    if settings.flat_manager_build_secret is None:
        raise HTTPException(
            status_code=500,
            detail="flat_manager_not_configured",
        )

    try:
        claims = jwt.decode(
            authorization.credentials,
            base64.b64decode(settings.flat_manager_build_secret),
            algorithms=["HS256"],
        )
        if "reviewcheck" not in claims["scope"]:
            raise HTTPException(status_code=403, detail="invalid_scope")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="invalid_token")

    is_failure = any(
        not _diagnostic_is_warning(diagnostic) for diagnostic in request.diagnostics
    )
    subject = (
        f"Build #{request.build_id} failed"
        if is_failure
        else f"Build #{request.build_id} passed with warnings"
    )

    payload = {
        "messageId": f"{request.build_repo}/{request.build_id}",
        "creation_timestamp": datetime.datetime.now(datetime.UTC).timestamp(),
        "subject": subject,
        "previewText": subject,
        "messageInfo": {
            "category": EmailCategory.BUILD_NOTIFICATION,
            "appId": request.app_id,
            "appName": request.app_id,  # todo get app name
            "diagnostics": request.diagnostics,
            "anyWarnings": any(
                _diagnostic_is_warning(diagnostic) for diagnostic in request.diagnostics
            ),
            "anyErrors": any(
                not _diagnostic_is_warning(diagnostic)
                for diagnostic in request.diagnostics
            ),
            "buildId": request.build_id,
            "buildRepo": request.build_repo,
        },
    }
    worker.send_email_new.send(payload)


def register_to_app(app: FastAPI):
    app.include_router(router)
