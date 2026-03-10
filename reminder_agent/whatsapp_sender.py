from __future__ import annotations

import logging

import requests

logger = logging.getLogger(__name__)


def send_message(
    base_url: str,
    instance: str,
    api_key: str,
    group_id: str,
    text: str,
) -> dict:
    url = f"{base_url.rstrip('/')}/message/sendText/{instance}"

    headers = {
        "apikey": api_key,
        "Content-Type": "application/json",
    }

    payload = {
        "number": group_id,
        "text": text,
    }

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        logger.info("Mensagem enviada para grupo %s — status: %s", group_id, data.get("status", "ok"))
        return {"ok": True, "data": data}
    except requests.exceptions.Timeout:
        logger.error("Timeout ao enviar mensagem para grupo %s", group_id)
        return {"ok": False, "error": "timeout"}
    except requests.exceptions.HTTPError as e:
        logger.error("Erro HTTP ao enviar para grupo %s: %s", group_id, e)
        return {"ok": False, "error": str(e)}
    except Exception as e:
        logger.error("Erro ao enviar mensagem para grupo %s: %s", group_id, e)
        return {"ok": False, "error": str(e)}
