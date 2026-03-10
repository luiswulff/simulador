from __future__ import annotations

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv


@dataclass
class Config:
    gmail_credentials_path: str = "credentials/service_account.json"
    gmail_delegated_user: str = "arquivo@taxcobrasil.com"
    gmail_query: str = "is:unread"

    anthropic_api_key: str = ""

    evolution_api_url: str = ""
    evolution_instance: str = "default"
    evolution_api_key: str = ""

    schedule_hours: list[int] = field(default_factory=lambda: [9, 14])
    timezone: str = "America/Sao_Paulo"

    db_path: str = "data/reminder.db"

    dry_run: bool = False
    log_level: str = "INFO"


def load_config(env_path: str = ".env") -> Config:
    load_dotenv(env_path)

    hours_str = os.getenv("REMINDER_SCHEDULE_HOURS", "9,14")
    hours = [int(h.strip()) for h in hours_str.split(",")]

    return Config(
        gmail_credentials_path=os.getenv("GMAIL_CREDENTIALS_PATH", "credentials/service_account.json"),
        gmail_delegated_user=os.getenv("GMAIL_DELEGATED_USER", "arquivo@taxcobrasil.com"),
        gmail_query=os.getenv("GMAIL_QUERY", "is:unread"),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
        evolution_api_url=os.getenv("EVOLUTION_API_URL", ""),
        evolution_instance=os.getenv("EVOLUTION_INSTANCE", "default"),
        evolution_api_key=os.getenv("EVOLUTION_API_KEY", ""),
        schedule_hours=hours,
        timezone=os.getenv("REMINDER_TIMEZONE", "America/Sao_Paulo"),
        db_path=os.getenv("DB_PATH", "data/reminder.db"),
        dry_run=os.getenv("DRY_RUN", "false").lower() in ("true", "1", "sim"),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
    )
