from __future__ import annotations

import logging

from anthropic import Anthropic

from .models import Collaborator, Task

logger = logging.getLogger(__name__)

REMINDER_PROMPT = """Você é o assistente virtual da Tax Group, uma consultoria tributária.
Sua função é enviar lembretes de pendências via WhatsApp para os colaboradores da empresa.

Gere UMA mensagem curta e direta para {name}, lembrando das seguintes pendências:

{task_list}

REGRAS:
- Linguagem: português brasileiro, tom profissional mas simpático
- Máximo 500 caracteres
- Seja direto: diga o que precisa ser feito
- Use emojis com moderação (máximo 2-3)
- Se houver itens com urgência "critica", destaque isso com firmeza
- Se houver itens com urgência "alta", mencione que é prioritário
- NÃO use saudações longas — vá direto ao ponto
- NÃO assine a mensagem com nome de pessoa, use "Assistente Tax Group" se necessário
- Formato adequado para WhatsApp (use *negrito* e quebras de linha)
"""


def generate_reminder(
    client: Anthropic,
    collaborator: Collaborator,
    tasks: list[Task],
) -> str:
    task_lines = []
    for i, t in enumerate(tasks, 1):
        line = f"{i}. [{t.urgency.upper()}] {t.description}"
        if t.due_date:
            line += f" (prazo: {t.due_date})"
        if t.reminder_count > 0:
            line += f" — já cobrado {t.reminder_count}x"
        task_lines.append(line)

    prompt = REMINDER_PROMPT.format(
        name=collaborator.name,
        task_list="\n".join(task_lines),
    )

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        message = response.content[0].text.strip()
        logger.info("Mensagem gerada para %s (%d chars)", collaborator.name, len(message))
        return message

    except Exception as e:
        logger.error("Erro ao gerar mensagem para %s: %s", collaborator.name, e)
        # Fallback com template simples
        items = "\n".join(f"• {t.description}" for t in tasks)
        return f"Olá {collaborator.name}, seguem pendências que precisam da sua atenção:\n\n{items}\n\nPor favor, dê um retorno. - Assistente Tax Group"
