# Tax Group · Funil de Vendas, Captação em Feiras e Mapa de Leads

Skill para o **Argos OpenClaw**. Gera PDFs no padrão visual da Tax Group:

| Comando no WhatsApp | O que entrega |
|---|---|
| `/funil` | Pág. 1: funil one page (KPIs, funil por etapa, conversões, empresas por etapa, leitura executiva). Pág. 2+: todas as empresas por etapa, com cor por etapa, e os perdidos. O funil se adapta às etapas do pipeline do CRM. |
| `captura: ...` (texto, foto do crachá/cartão ou áudio) | Registra o contato da feira, avisa pendências, duplicados e empresa já abordada, envia ao CRM e devolve a posição no ranking. |
| `/ranking`, `/minhalista`, `/relatorio feira` | Ranking ao vivo; lista em PDF do vendedor; dashboard da feira (pág. 1) + lista por vendedor (pág. 2+). |
| `/mapa` | Mapa de leads em cards (20 ou 16 por página) com logo da empresa, filtrável por vendedor, temperatura ou etapa. |

## Estrutura

```
taxgroup-funil/
├── SKILL.md              ← instruções que o agente do OpenClaw lê
├── cli.py                ← ponto de entrada (sempre responde JSON)
├── taxfunil/             ← código: funil.py, feira.py, mapa.py, render.py, logos.py, crm/{hubspot,pipedrive,arquivo}.py
├── templates/            ← HTML/CSS dos PDFs (marca, cores, layout)
├── assets/               ← logos Tax Group e fonte Montserrat (OFL)
├── exemplos/             ← CSV de exemplo para o conector por arquivo
├── tests/                ← testes automáticos (sem acessar CRM real)
├── config.example.yaml   ← copie para config.yaml
└── instalar.sh
```

## Instalação no OpenClaw

1. **Copie a pasta** para as skills do workspace do agente, com o nome `taxgroup-funil`:
   ```bash
   cp -r openclaw-taxgroup-funil ~/.openclaw/workspace/skills/taxgroup-funil
   ```
   (Qualquer pasta de skills reconhecida pelo OpenClaw serve; a do workspace tem prioridade.)

2. **Instale as dependências** (Python 3.10+):
   ```bash
   cd ~/.openclaw/workspace/skills/taxgroup-funil && ./instalar.sh
   ```
   Cria `.venv`, instala os pacotes, baixa o Chromium do Playwright e cria o `config.yaml`.
   Se o servidor não puder baixar o Chromium, aponte um já instalado: `export TAXFUNIL_CHROME=/caminho/do/chromium`.

3. **Configure o `config.yaml`**: provedor do CRM, pipeline padrão, regra de pontuação e a lista de
   `vendedores` (nome + telefone do WhatsApp; `gestor: true` para quem vê relatórios completos).

4. **Tokens do CRM** — no `~/.openclaw/openclaw.json` (não coloque tokens no config.yaml):
   ```json5
   {
     skills: {
       entries: {
         "taxgroup-funil": {
           enabled: true,
           env: {
             HUBSPOT_TOKEN: "pat-na1-...",        // HubSpot: Private App
             // PIPEDRIVE_API_TOKEN: "...",        // Pipedrive: Configurações pessoais → API
             // LOGO_DEV_TOKEN: "pk_..."           // opcional: logos em alta qualidade (logo.dev)
           }
         }
       }
     }
   }
   ```
   Escopos da Private App do HubSpot: `crm.objects.deals.read/write`, `crm.objects.companies.read/write`,
   `crm.objects.contacts.read/write`, `crm.objects.owners.read`, `crm.schemas.deals.read`.

5. **Teste**:
   ```bash
   .venv/bin/python cli.py demo        # gera os 6 PDFs de exemplo em saidas/demo (dados fictícios)
   .venv/bin/python cli.py verificar   # confere Chromium, config e acesso ao CRM
   .venv/bin/python -m unittest discover -s tests
   ```
   Depois, abra uma nova sessão do agente (as skills são carregadas no início da sessão) e mande `/funil` no WhatsApp.

## CRMs

- **HubSpot** e **Pipedrive**: conexão direta pela API. As etapas do funil vêm do pipeline; o ganho é a etapa final
  e os perdidos aparecem separados, na etapa em que foram perdidos.
- **Connect / outros**: use `provedor: arquivo` com um CSV ou XLSX exportado (colunas em `taxfunil/crm/arquivo.py`,
  exemplo em `exemplos/crm_exemplo.csv`). As capturas de feira vão para `dados/capturas_para_crm.csv` para importar.
  Para conectar outro CRM pela API, crie `taxfunil/crm/<nome>.py` com `carregar_funil()` e `enviar_captura()`
  e registre em `taxfunil/crm/__init__.py`.

## Padrões adotados (ajustáveis no config.yaml)

- **Pontuação do ranking**: captura 1 pt · lead quente +2 · reunião agendada +5.
- **Campos obrigatórios da captura**: nome, empresa, telefone ou e-mail, temperatura e consentimento LGPD.
  Captura incompleta fica salva como pendente e não vai ao CRM até ser completada.
- **Envio ao CRM**: imediato. Se o CRM falhar, a captura fica salva e `/sincronizar` reenvia.
- **Permissões**: cada vendedor vê e corrige só as próprias capturas; relatório completo, exportação e listas de
  outros vendedores são só para gestores.
- **Logos**: ícone do site da empresa (gratuito); com `LOGO_DEV_TOKEN`, usa logo.dev. Cache em `dados/logos`.
  Sem logo, o card mostra as iniciais da empresa.
- **Mapa**: 20 cards por página (16 com `--cards 16`).
- **Qualidade do PDF**: toda geração mede se algum texto passa da borda (`layout_ok` no JSON).

## Dados e privacidade

As capturas ficam em `dados/feira.db` (SQLite) no servidor do OpenClaw. Os PDFs ficam em `saidas/`. Ambos contêm
dados pessoais (LGPD): restrinja o acesso ao servidor e apague periodicamente o que não for mais necessário.
