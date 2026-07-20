import json
import smtplib
from email.message import EmailMessage

import httpx

from app.models import Notification, NotificationChannel


async def send_notification(notification: Notification, title: str, message: str) -> None:
    config = json.loads(notification.config_json)
    if notification.channel == NotificationChannel.DISCORD:
        await _send_discord(config, title, message)
    elif notification.channel == NotificationChannel.TELEGRAM:
        await _send_telegram(config, title, message)
    elif notification.channel == NotificationChannel.WEBHOOK:
        await _send_webhook(config, title, message)
    elif notification.channel == NotificationChannel.EMAIL:
        _send_email(config, title, message)


async def _send_discord(config: dict, title: str, message: str) -> None:
    webhook_url = config.get("webhook_url")
    if not webhook_url:
        return
    payload = {
        "embeds": [
            {
                "title": title,
                "description": message,
                "color": 15158332,
            }
        ]
    }
    async with httpx.AsyncClient(timeout=10) as client:
        await client.post(webhook_url, json=payload)


async def _send_telegram(config: dict, title: str, message: str) -> None:
    bot_token = config.get("bot_token")
    chat_id = config.get("chat_id")
    if not bot_token or not chat_id:
        return
    text = f"*{title}*\n\n{message}"
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    async with httpx.AsyncClient(timeout=10) as client:
        await client.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"})


async def _send_webhook(config: dict, title: str, message: str) -> None:
    url = config.get("url")
    if not url:
        return
    payload = {"title": title, "message": message, "source": "openops"}
    async with httpx.AsyncClient(timeout=10) as client:
        await client.post(url, json=payload)


def _send_email(config: dict, title: str, message: str) -> None:
    host = config.get("smtp_host")
    port = int(config.get("smtp_port", 587))
    username = config.get("username")
    password = config.get("password")
    sender = config.get("from_email")
    recipient = config.get("to_email")
    if not all([host, username, password, sender, recipient]):
        return

    email = EmailMessage()
    email["Subject"] = title
    email["From"] = sender
    email["To"] = recipient
    email.set_content(message)

    with smtplib.SMTP(host, port) as smtp:
        smtp.starttls()
        smtp.login(username, password)
        smtp.send_message(email)
