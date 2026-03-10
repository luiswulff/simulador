from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime


@dataclass
class Collaborator:
    id: int
    name: str
    email: str
    whatsapp_group_id: str
    active: bool = True


@dataclass
class Task:
    id: int
    gmail_message_id: str
    subject: str
    description: str
    collaborator_id: int
    body_snippet: str = ""
    due_date: date | None = None
    status: str = "pending"
    extracted_at: datetime | None = None
    last_reminded_at: datetime | None = None
    reminder_count: int = 0
    urgency: str = "normal"  # normal, alta, critica


@dataclass
class ReminderLog:
    id: int
    task_id: int
    sent_at: datetime
    message_text: str
    whatsapp_status: str  # sent, failed
