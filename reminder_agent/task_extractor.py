from __future__ import annotations

import json
import logging

from anthropic import Anthropic

from .models import Collaborator

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """Você é um assistente da consultoria tributária Tax Group.
Analise o e-mail abaixo e identifique se ele contém:
1. Pendências que precisam ser resolvidas por algum colaborador
2. Clientes cobrando posição ou reclamando de algo
3. Solicitações que ainda não foram atendidas

Para cada pendência encontrada, identifique:
- O colaborador responsável (baseado no contexto do e-mail e na lista de colaboradores)
- Uma descrição curta da pendência
- O nível de urgência: "normal", "alta" (prazo apertado ou segunda cobrança), "critica" (cliente irritado, prazo vencido)
- O prazo, se mencionado (formato YYYY-MM-DD)

COLABORADORES CONHECIDOS:
{collaborators}

RESPONDA APENAS em JSON válido, no seguinte formato (lista de objetos):
[
  {{
    "collaborator_email": "email@empresa.com",
    "description": "Descrição curta da pendência",
    "urgency": "normal|alta|critica",
    "due_date": "YYYY-MM-DD ou null"
  }}
]

Se o e-mail não contém nenhuma pendência relevante, responda com uma lista vazia: []

IMPORTANTE:
- Ignore e-mails puramente informativos, newsletters, ou spam
- Se não conseguir identificar o colaborador responsável, use "desconhecido@taxcobrasil.com"
- Seja preciso: só extraia pendências reais, não invente

E-MAIL:
De: {from_addr}
Para: {to_addr}
Assunto: {subject}
Data: {date}

{body}
"""


def extract_tasks_from_email(
    client: Anthropic,
    email: dict,
    collaborators: list[Collaborator],
) -> list[dict]:
    collab_list = "\n".join(
        f"- {c.name} ({c.email})" for c in collaborators
    )

    prompt = EXTRACTION_PROMPT.format(
        collaborators=collab_list,
        from_addr=email["from"],
        to_addr=email["to"],
        subject=email["subject"],
        date=email["date"],
        body=email["body"],
    )

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()

        # Extrair JSON da resposta (pode vir envolto em ```json ... ```)
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        tasks = json.loads(text)
        if not isinstance(tasks, list):
            logger.warning("Resposta do Claude não é uma lista: %s", text[:200])
            return []

        logger.info("Extraídas %d pendências do e-mail '%s'", len(tasks), email["subject"][:60])
        return tasks

    except json.JSONDecodeError as e:
        logger.error("Erro ao parsear JSON do Claude: %s — resposta: %s", e, text[:300])
        return []
    except Exception as e:
        logger.error("Erro na extração de tarefas: %s", e)
        return []
