#!/usr/bin/env bash
# Instala dependências da skill taxgroup-funil (rode uma vez no servidor do OpenClaw).
set -euo pipefail
cd "$(dirname "$0")"
python3 -m venv .venv 2>/dev/null || true
if [ -x .venv/bin/pip ]; then PIP=.venv/bin/pip; PY=.venv/bin/python; else PIP="python3 -m pip"; PY=python3; fi
$PIP install -q -r requirements.txt
$PY -m playwright install chromium || echo "Aviso: não foi possível baixar o Chromium do Playwright; defina TAXFUNIL_CHROME com o caminho de um Chrome/Chromium."
[ -f config.yaml ] || cp config.example.yaml config.yaml
echo "OK. Edite config.yaml e teste com: $PY cli.py demo && $PY cli.py verificar"
