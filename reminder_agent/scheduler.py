from __future__ import annotations

import logging

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from .config import Config

logger = logging.getLogger(__name__)


def create_scheduler(config: Config, job_func, job_args: tuple = ()) -> BlockingScheduler:
    scheduler = BlockingScheduler(timezone=config.timezone)

    for hour in config.schedule_hours:
        trigger = CronTrigger(
            hour=hour,
            minute=0,
            day_of_week="mon-fri",
            timezone=config.timezone,
        )
        scheduler.add_job(
            job_func,
            trigger=trigger,
            args=job_args,
            name=f"reminder_{hour}h",
            misfire_grace_time=3600,
        )
        logger.info("Agendado: lembrete às %02d:00 (seg-sex, %s)", hour, config.timezone)

    return scheduler
