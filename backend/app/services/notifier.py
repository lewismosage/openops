import json
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from app.config import settings
from app.models import Notification, NotificationChannel

logger = logging.getLogger(__name__)


async def send_notification(notification: Notification, title: str, message: str) -> None:
    config = json.loads(notification.config_json)
    if notification.channel == NotificationChannel.EMAIL:
        _send_email(config, title, message)


def _send_email(config: dict, title: str, message: str) -> None:
    host = settings.email_host
    port = settings.email_port
    username = settings.email_host_user
    password = settings.email_host_password
    sender = _from_address()
    recipient = config.get("to_email")
    if not all([host, username, password, sender, recipient]):
        logger.warning("Email notification skipped: SMTP or recipient not configured")
        return

    email = EmailMessage()
    email["Subject"] = title
    email["From"] = sender
    email["To"] = recipient
    email.set_content(message)

    try:
        with smtplib.SMTP(host, port) as smtp:
            smtp.starttls()
            smtp.login(username, password)
            smtp.send_message(email)
        logger.info("Email notification sent to %s: %s", recipient, title)
    except Exception:
        logger.exception("Failed to send email notification to %s", recipient)
        raise


def _from_address() -> str:
    address = settings.default_from_email.strip()
    name = settings.default_from_name.strip()
    if name and address:
        return formataddr((name, address))
    return address
