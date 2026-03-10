"""
Agente de Lembretes de Tarefas via WhatsApp — Tax Group

Uso:
    python -m reminder_agent                    # Inicia scheduler (9h e 14h)
    python -m reminder_agent --once             # Execução única
    python -m reminder_agent --add-collaborator "Nome" "email" "grupo_whatsapp_id"
"""
from __future__ import annotations

import logging
import sys
from collections import defaultdict

from anthropic import Anthropic

from .config import load_config
from .db import (
    get_all_collaborators,
    get_collaborator,
    get_pending_tasks,
    init_db,
    insert_task,
    log_reminder,
    mark_reminded,
    upsert_collaborator,
)
from .gmail_reader import build_gmail_service, fetch_unread_emails, has_reply, mark_as_read
from .message_generator import generate_reminder
from .scheduler import create_scheduler
from .task_extractor import extract_tasks_from_email
from .whatsapp_sender import send_message

logger = logging.getLogger(__name__)


def run_reminder_cycle(config):
    """Executa um ciclo completo: ler Gmail → extrair pendências → cobrar via WhatsApp."""
    logger.info("=== Iniciando ciclo de lembretes ===")

    conn = init_db(config.db_path)
    collaborators = get_all_collaborators(conn)

    if not collaborators:
        logger.warning("Nenhum colaborador cadastrado. Use --add-collaborator para adicionar.")
        conn.close()
        return

    # --- Etapa 1: Buscar e-mails do Gmail ---
    try:
        gmail_service = build_gmail_service(config.gmail_credentials_path, config.gmail_delegated_user)
        emails = fetch_unread_emails(gmail_service, config.gmail_query)
    except Exception as e:
        logger.error("Erro ao acessar Gmail: %s", e)
        conn.close()
        return

    # --- Etapa 2: Analisar e-mails com Claude e extrair pendências ---
    anthropic_client = Anthropic(api_key=config.anthropic_api_key)
    new_tasks_count = 0

    for email in emails:
        # Verificar se o thread já foi respondido
        try:
            if email["thread_id"] and has_reply(gmail_service, email["thread_id"], email["from"]):
                logger.debug("E-mail '%s' já tem resposta, pulando", email["subject"][:50])
                mark_as_read(gmail_service, email["message_id"])
                continue
        except Exception:
            pass  # Se não conseguir verificar, processa mesmo assim

        # Extrair pendências com IA
        extracted = extract_tasks_from_email(anthropic_client, email, collaborators)

        for task_data in extracted:
            # Encontrar o colaborador pelo email
            collab_email = task_data.get("collaborator_email", "")
            collab = next((c for c in collaborators if c.email == collab_email), None)

            if not collab:
                logger.warning("Colaborador '%s' não encontrado, pendência ignorada", collab_email)
                continue

            task_id = insert_task(
                conn,
                gmail_message_id=email["message_id"],
                subject=email["subject"],
                description=task_data.get("description", "Pendência não especificada"),
                collaborator_id=collab.id,
                body_snippet=email["body"][:500],
                due_date=task_data.get("due_date"),
                urgency=task_data.get("urgency", "normal"),
            )

            if task_id:
                new_tasks_count += 1

        # Marcar e-mail como lido após processamento
        try:
            mark_as_read(gmail_service, email["message_id"])
        except Exception as e:
            logger.warning("Não foi possível marcar e-mail como lido: %s", e)

    logger.info("Novas pendências extraídas: %d", new_tasks_count)

    # --- Etapa 3: Buscar pendências e agrupar por colaborador ---
    pending_tasks = get_pending_tasks(conn)
    if not pending_tasks:
        logger.info("Nenhuma pendência para cobrar. Ciclo encerrado.")
        conn.close()
        return

    tasks_by_collaborator = defaultdict(list)
    for task in pending_tasks:
        tasks_by_collaborator[task.collaborator_id].append(task)

    # --- Etapa 4: Gerar mensagens e enviar via WhatsApp ---
    sent_count = 0
    failed_count = 0

    for collab_id, tasks in tasks_by_collaborator.items():
        collab = get_collaborator(conn, collab_id)
        if not collab:
            continue

        # Gerar mensagem com IA
        message = generate_reminder(anthropic_client, collab, tasks)

        if config.dry_run:
            logger.info("[DRY RUN] Mensagem para %s:\n%s", collab.name, message)
            print(f"\n{'='*60}")
            print(f"PARA: {collab.name} ({collab.whatsapp_group_id})")
            print(f"{'='*60}")
            print(message)
            print(f"{'='*60}\n")
            status = "sent"
        else:
            # Enviar via Evolution API
            result = send_message(
                config.evolution_api_url,
                config.evolution_instance,
                config.evolution_api_key,
                collab.whatsapp_group_id,
                message,
            )
            status = "sent" if result.get("ok") else "failed"

        # Registrar resultado
        for task in tasks:
            log_reminder(conn, task.id, message, status)
            if status == "sent":
                mark_reminded(conn, task.id, message)

        if status == "sent":
            sent_count += 1
        else:
            failed_count += 1

    logger.info("Ciclo encerrado. Enviados: %d, Falhas: %d", sent_count, failed_count)
    conn.close()


def handle_add_collaborator(args: list[str]):
    """Adiciona um colaborador ao banco de dados."""
    if len(args) < 3:
        print("Uso: python -m reminder_agent --add-collaborator NOME EMAIL GRUPO_WHATSAPP_ID")
        print('Exemplo: python -m reminder_agent --add-collaborator "João Silva" "joao@taxcobrasil.com" "120363xxxx@g.us"')
        sys.exit(1)

    name, email, group_id = args[0], args[1], args[2]
    config = load_config()
    conn = init_db(config.db_path)
    collab_id = upsert_collaborator(conn, name, email, group_id)
    conn.close()
    print(f"Colaborador adicionado/atualizado: {name} ({email}) — ID: {collab_id}")


def main():
    config = load_config()

    logging.basicConfig(
        level=getattr(logging, config.log_level, logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    args = sys.argv[1:]

    if "--add-collaborator" in args:
        idx = args.index("--add-collaborator")
        handle_add_collaborator(args[idx + 1:])
        return

    if "--once" in args:
        logger.info("Modo execução única")
        run_reminder_cycle(config)
        return

    # Modo scheduler
    logger.info("Iniciando agente de lembretes em modo scheduler")
    logger.info("Horários: %s (timezone: %s)", config.schedule_hours, config.timezone)

    if config.dry_run:
        logger.info("*** MODO DRY RUN — mensagens NÃO serão enviadas via WhatsApp ***")

    scheduler = create_scheduler(config, run_reminder_cycle, job_args=(config,))

    try:
        scheduler.start()
    except KeyboardInterrupt:
        logger.info("Agente encerrado pelo usuário")
        scheduler.shutdown()


if __name__ == "__main__":
    main()
