from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timedelta

from .models import Collaborator, Task

SCHEMA = """
CREATE TABLE IF NOT EXISTS collaborators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    whatsapp_group_id TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gmail_message_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_snippet TEXT,
    description TEXT NOT NULL,
    collaborator_id INTEGER NOT NULL REFERENCES collaborators(id),
    due_date TEXT,
    urgency TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'pending',
    extracted_at TEXT DEFAULT (datetime('now')),
    last_reminded_at TEXT,
    reminder_count INTEGER DEFAULT 0,
    UNIQUE(gmail_message_id, collaborator_id)
);

CREATE TABLE IF NOT EXISTS reminder_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    sent_at TEXT DEFAULT (datetime('now')),
    message_text TEXT NOT NULL,
    whatsapp_status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_collaborator ON tasks(collaborator_id);
"""


def init_db(db_path: str) -> sqlite3.Connection:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


def upsert_collaborator(conn: sqlite3.Connection, name: str, email: str, group_id: str) -> int:
    conn.execute(
        """INSERT INTO collaborators (name, email, whatsapp_group_id)
           VALUES (?, ?, ?)
           ON CONFLICT(email) DO UPDATE SET name=excluded.name, whatsapp_group_id=excluded.whatsapp_group_id""",
        (name, email, group_id),
    )
    conn.commit()
    row = conn.execute("SELECT id FROM collaborators WHERE email = ?", (email,)).fetchone()
    return row[0]


def get_all_collaborators(conn: sqlite3.Connection) -> list[Collaborator]:
    rows = conn.execute("SELECT id, name, email, whatsapp_group_id, active FROM collaborators WHERE active = 1").fetchall()
    return [Collaborator(id=r[0], name=r[1], email=r[2], whatsapp_group_id=r[3], active=bool(r[4])) for r in rows]


def get_collaborator(conn: sqlite3.Connection, collaborator_id: int) -> Collaborator | None:
    row = conn.execute("SELECT id, name, email, whatsapp_group_id, active FROM collaborators WHERE id = ?", (collaborator_id,)).fetchone()
    if not row:
        return None
    return Collaborator(id=row[0], name=row[1], email=row[2], whatsapp_group_id=row[3], active=bool(row[4]))


def insert_task(
    conn: sqlite3.Connection,
    gmail_message_id: str,
    subject: str,
    description: str,
    collaborator_id: int,
    body_snippet: str = "",
    due_date: str | None = None,
    urgency: str = "normal",
) -> int | None:
    try:
        cur = conn.execute(
            """INSERT INTO tasks (gmail_message_id, subject, body_snippet, description, collaborator_id, due_date, urgency)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (gmail_message_id, subject, body_snippet, description, collaborator_id, due_date, urgency),
        )
        conn.commit()
        return cur.lastrowid
    except sqlite3.IntegrityError:
        return None  # duplicata


def get_pending_tasks(conn: sqlite3.Connection, cooldown_hours: int = 24) -> list[Task]:
    cutoff = (datetime.utcnow() - timedelta(hours=cooldown_hours)).isoformat()
    rows = conn.execute(
        """SELECT id, gmail_message_id, subject, description, collaborator_id, body_snippet,
                  due_date, status, extracted_at, last_reminded_at, reminder_count, urgency
           FROM tasks
           WHERE status IN ('pending', 'reminded')
             AND (last_reminded_at IS NULL OR last_reminded_at < ?)""",
        (cutoff,),
    ).fetchall()

    tasks = []
    for r in rows:
        tasks.append(Task(
            id=r[0], gmail_message_id=r[1], subject=r[2], description=r[3],
            collaborator_id=r[4], body_snippet=r[5],
            due_date=r[6], status=r[7], extracted_at=r[8],
            last_reminded_at=r[9], reminder_count=r[10], urgency=r[11],
        ))
    return tasks


def mark_reminded(conn: sqlite3.Connection, task_id: int, message_text: str):
    now = datetime.utcnow().isoformat()
    conn.execute(
        """UPDATE tasks SET status = 'reminded', last_reminded_at = ?, reminder_count = reminder_count + 1
           WHERE id = ?""",
        (now, task_id),
    )
    conn.commit()


def mark_done(conn: sqlite3.Connection, task_id: int):
    conn.execute("UPDATE tasks SET status = 'done' WHERE id = ?", (task_id,))
    conn.commit()


def log_reminder(conn: sqlite3.Connection, task_id: int, message_text: str, status: str):
    conn.execute(
        "INSERT INTO reminder_log (task_id, message_text, whatsapp_status) VALUES (?, ?, ?)",
        (task_id, message_text, status),
    )
    conn.commit()
