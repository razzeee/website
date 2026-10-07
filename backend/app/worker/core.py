from ..config import settings
from ..dramatiq_broker import broker
from ..emails import (
    sentry_before_breadcrumb,
    sentry_before_send,
    sentry_before_send_transaction,
)

__all__ = ["broker"]

if settings.sentry_dsn:
    import sentry_sdk
    from sentry_sdk.integrations.dramatiq import DramatiqIntegration

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        send_default_pii=False,
        environment="production",
        integrations=[DramatiqIntegration()],
        before_send=sentry_before_send,
        before_send_transaction=sentry_before_send_transaction,
        before_breadcrumb=sentry_before_breadcrumb,
    )
