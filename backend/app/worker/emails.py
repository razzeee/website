import dramatiq

from .. import emails
from ..database import get_db
from ..types import JSONValue


@dramatiq.actor
def send_email_new(email):
    with get_db("writer") as db:
        emails.send_email_new(dict(**email), db)


@dramatiq.actor
def send_one_email_new(message: dict[str, JSONValue], dest: str) -> None:
    emails.send_one_email_new(message, dest)
