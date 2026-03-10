from __future__ import annotations

import base64
import logging
import re
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime

from google.oauth2 import service_account
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/gmail.modify"]


def build_gmail_service(credentials_path: str, delegated_user: str):
    credentials = service_account.Credentials.from_service_account_file(
        credentials_path, scopes=SCOPES
    )
    delegated = credentials.with_subject(delegated_user)
    return build("gmail", "v1", credentials=delegated)


def fetch_unread_emails(service, query: str = "is:unread", max_results: int = 50) -> list[dict]:
    results = service.users().messages().list(
        userId="me", q=query, maxResults=max_results
    ).execute()

    messages = results.get("messages", [])
    if not messages:
        logger.info("Nenhum e-mail encontrado com a query: %s", query)
        return []

    emails = []
    for msg_ref in messages:
        msg = service.users().messages().get(
            userId="me", id=msg_ref["id"], format="full"
        ).execute()

        headers = {h["name"]: h["value"] for h in msg["payload"]["headers"]}

        body = _extract_body(msg["payload"])

        emails.append({
            "message_id": msg["id"],
            "thread_id": msg.get("threadId", ""),
            "subject": headers.get("Subject", "(sem assunto)"),
            "from": headers.get("From", ""),
            "to": headers.get("To", ""),
            "date": headers.get("Date", ""),
            "body": body[:2000],  # limita para não estourar o prompt
        })

    logger.info("Encontrados %d e-mails", len(emails))
    return emails


def _extract_body(payload: dict) -> str:
    if payload.get("body", {}).get("data"):
        return _decode_base64(payload["body"]["data"])

    parts = payload.get("parts", [])
    for part in parts:
        mime = part.get("mimeType", "")
        if mime == "text/plain" and part.get("body", {}).get("data"):
            return _decode_base64(part["body"]["data"])

    for part in parts:
        mime = part.get("mimeType", "")
        if mime == "text/html" and part.get("body", {}).get("data"):
            html = _decode_base64(part["body"]["data"])
            return _strip_html(html)

    for part in parts:
        if part.get("parts"):
            return _extract_body(part)

    return ""


def _decode_base64(data: str) -> str:
    return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")


def _strip_html(html: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def mark_as_read(service, message_id: str):
    service.users().messages().modify(
        userId="me",
        id=message_id,
        body={"removeLabelIds": ["UNREAD"]},
    ).execute()
    logger.debug("E-mail %s marcado como lido", message_id)


def has_reply(service, thread_id: str, original_from: str) -> bool:
    """Verifica se alguém da empresa já respondeu ao thread."""
    thread = service.users().threads().get(userId="me", id=thread_id).execute()
    messages = thread.get("messages", [])
    if len(messages) <= 1:
        return False

    for msg in messages[1:]:
        headers = {h["name"]: h["value"] for h in msg["payload"]["headers"]}
        msg_from = headers.get("From", "")
        if original_from not in msg_from:
            return True
    return False
