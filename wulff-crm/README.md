# Wulff Relationship CRM

*Relacionamentos construídos ao longo do tempo*

CRM pessoal de inteligência de relacionamentos: contatos, empresas, interações,
lembretes com cadência, Relationship Score, importação de bases (CSV/XLSX/JSON/VCF),
listas inteligentes, dashboard executivo e backup completo em JSON.

**Stack:** React + TypeScript + Vite · Tailwind CSS · Supabase (auth, banco, storage) ·
Netlify (hospedagem) · TanStack Query · PapaParse/SheetJS/parser vCard próprio.

---

## ⚠️ Expectativa honesta de deploy

A publicação **não é** "arrastar o ZIP e pronto": o Supabase é pré-requisito.
O setup completo leva **~15 minutos**, seguindo os passos abaixo na ordem.

---

## Setup guiado (~15 min)

### Passo 1 — Criar conta e projeto no Supabase (5 min)

1. Acesse [supabase.com](https://supabase.com) e clique em **Start your project**
   (login com GitHub ou e-mail). O plano **Free** é suficiente.
2. Clique em **New project**.
   *Tela: formulário com Name, Database Password, Region.*
3. Preencha:
   - **Name:** `wulff-crm`
   - **Database Password:** gere uma senha forte e **guarde-a** (não será usada pela
     aplicação, mas é a senha do banco).
   - **Region:** `South America (São Paulo)`.
4. Clique em **Create new project** e aguarde ~2 minutos até o projeto ficar verde/ativo.

### Passo 2 — Executar o script SQL único (2 min)

1. No menu lateral do Supabase, clique em **SQL Editor**.
   *Tela: editor de texto com botão "Run" no canto inferior direito.*
2. Clique em **New query**.
3. Abra o arquivo **`supabase/schema.sql`** deste projeto, copie **todo** o conteúdo
   e cole no editor.
4. Clique em **Run** (ou Ctrl+Enter). Deve aparecer **"Success. No rows returned"**.

> É um script único e idempotente: cria todas as tabelas, índices, triggers,
> Row Level Security e o bucket de fotos de uma vez. Não há migrations para rodar
> uma a uma.

### Passo 3 — Copiar as duas chaves (1 min)

1. Menu lateral → **Project Settings** (ícone de engrenagem) → **API**.
2. Copie dois valores:
   - **Project URL** (ex.: `https://abcdefgh.supabase.co`) → será `VITE_SUPABASE_URL`
   - **anon public** (chave longa em "Project API keys") → será `VITE_SUPABASE_ANON_KEY`

> ⚠️ **Nunca** use a chave `service_role` no front-end.

*(Opcional, recomendado para uso pessoal): em **Authentication → Providers → Email**,
desative "Confirm email" para entrar sem confirmação; e após criar a sua conta,
desative "Allow new users to sign up" em Authentication → Settings, garantindo que
apenas você acesse o sistema.)*

### Passo 4 — Publicar no Netlify (5 min)

**Opção A — via GitHub (recomendada):**

1. Suba esta pasta para um repositório GitHub.
2. Em [app.netlify.com](https://app.netlify.com): **Add new site → Import an existing project → GitHub**.
3. Selecione o repositório. O Netlify lê o `netlify.toml` automaticamente
   (build `npm run build`, publish `dist`). Se o projeto estiver em um subdiretório,
   configure o **Base directory** para ele.
4. Antes de publicar, clique em **Add environment variables** e crie:
   - `VITE_SUPABASE_URL` = Project URL do Passo 3
   - `VITE_SUPABASE_ANON_KEY` = anon public do Passo 3
5. Clique em **Deploy**. Em ~2 minutos o site estará no ar.

**Opção B — deploy manual por ZIP/pasta:**

1. Na sua máquina: crie o arquivo `.env` a partir do `.env.example` com as duas
   variáveis do Passo 3 e rode:
   ```bash
   npm install
   npm run build
   ```
2. Arraste a pasta **`dist/`** gerada para [app.netlify.com/drop](https://app.netlify.com/drop).

> No deploy manual, as variáveis são embutidas no build — refaça o build se trocá-las.

### Passo 5 — Primeiro acesso (2 min)

1. Abra o site publicado → **"Primeiro acesso? Criar conta de administrador"**.
2. Cadastre-se com seu e-mail e senha. O primeiro usuário recebe o perfil
   **Administrador** e as 26 categorias padrão são criadas automaticamente.
3. (Opcional) **Modo demonstração:** rode o arquivo `supabase/seed-demo.sql` no
   SQL Editor (depois de criar sua conta) para popular 32 contatos, 10 empresas,
   interações, lembretes, notas e conexões — todos **fictícios**.
4. Importe suas bases reais em **Importações → Nova importação**.

---

## Desenvolvimento local

```bash
cp .env.example .env    # preencha as 2 variáveis
npm install
npm run dev             # http://localhost:5173
npm run build           # gera dist/
```

---

## Limites do free tier (documentação honesta)

O sistema foi dimensionado para operar 100% no plano gratuito:

| Recurso | Limite free | Consumo estimado |
|---|---|---|
| Banco Postgres | 500 MB | ~20 mil contatos + histórico ≈ 60–120 MB |
| Storage (fotos/docs) | 1 GB | ~5.000 fotos comprimidas |
| Usuários ativos/mês | 50.000 | 1 (single-tenant) |

O projeto free hiberna após ~1 semana sem uso; o primeiro acesso do dia pode levar
alguns segundos para "acordar". **Gere backups JSON periódicos** (Configurações →
Backup) — o arquivo é restaurável pela própria aplicação em qualquer outro projeto
Supabase, garantindo portabilidade total dos dados.

---

## Arquitetura

```
src/
├── components/          # Layout, busca global, avatar, score, formulários rápidos
├── contexts/            # AuthContext (sessão Supabase)
├── features/
│   ├── import/          # parsers (CSV/XLSX/JSON/VCF), mapeamento, normalização,
│   │                    #   deduplicação e gravação incremental
│   ├── export/          # exportações CSV/XLSX/JSON + backup/restore completo
│   └── photos/          # provedor de busca de fotos (desacoplado — V2)
├── lib/                 # supabase, normalização, score, formatação, auditoria
├── pages/               # Dashboard, Contatos, Empresas, Agenda, Interações,
│                        #   Importações, Listas inteligentes, Configurações, Login
└── types/               # tipos do banco
supabase/
├── schema.sql           # script ÚNICO de criação do banco (rodar 1x)
└── seed-demo.sql        # dados fictícios de demonstração (opcional)
docs/
└── DIAGNOSTICO-BASES.md # diagnóstico das 4 bases reais (só estatísticas)
```

**Decisões de arquitetura:**

- **Single-tenant pessoal:** todas as tabelas têm `user_id` com Row Level Security
  simples (`user_id = auth.uid()`). Sem multi-tenancy.
- **Relationship Score** calculado no cliente com pesos explícitos (exibidos ao
  clicar no score): proximidade 20, recência 25, interações 15, importância 15,
  influência 10, negócios 5, conexões 5, completude 5.
- `contacts.last_interaction_at` e `interactions_count` mantidos por trigger.
- Importação **incremental** — nunca apaga dados existentes; cada linha importada
  fica registrada em `import_rows` com o dado original para auditoria.
- Fotos no Supabase Storage (`contact-photos/<user_id>/…`), nunca em localStorage.

## Relationship Score — composição

| Fator | Peso |
|---|---|
| Recência do último contato | 25 |
| Grau de proximidade | 20 |
| Quantidade de interações | 15 |
| Importância | 15 |
| Influência | 10 |
| Potencial/negócios | 5 |
| Conexões em comum | 5 |
| Completude do cadastro | 5 |

---

## Multiusuário (v1.1)

A base pode ser compartilhada com sócios e assistentes:

1. A pessoa cria a própria conta na tela de login do sistema.
2. O administrador vai em **Configurações → Equipe** e adiciona o e-mail dela com um papel:
   - **Executivo** — vê tudo, cria e edita contatos, empresas, notas, interações e lembretes;
   - **Assistente** — cadastra, organiza, importa e atualiza; **não vê notas privadas**;
   - **Consulta** — apenas visualização.
3. Ao entrar, a pessoa escolhe a base no **seletor do topo da tela** ("Minha base" ⇄ base compartilhada).

As permissões são aplicadas no banco (Row Level Security) — não apenas na interface.
Bancos criados com o schema v1.0 devem rodar **`supabase/upgrade-v1.1.sql`** uma vez.

> Recomendação: membros devem usar contas dedicadas (sem dados próprios), pois as listas
> exibem tudo que a conta pode ler (base própria + compartilhadas).

## Enriquecimento via LinkedIn

- Cada contato tem os botões **"Buscar no LinkedIn"** (pesquisa de pessoas já preenchida com
  nome + empresa) e **"Enriquecer cadastro"** (modal para colar URL do perfil, cargo, empresa,
  cidade e segmento de uma vez). A lista de contatos tem um atalho de LinkedIn por linha.
- **Por que não é 100% automático:** o LinkedIn não oferece API pública de busca/leitura de
  perfis de terceiros, e raspagem viola os Termos de Uso. Para automação real, conecte um
  provedor pago (ex.: Proxycurl) implementando `src/features/enrichment/provider.ts` via
  Netlify Function — o botão "Enriquecer automaticamente" já existe e passa a funcionar.

## Ordenação e filtro por score (v1.1)

O score é calculado também **no banco** (função `contact_score` + view `contacts_scored`,
mesmos pesos da interface), permitindo na lista de contatos:

- ordenar por **Nome A→Z / Z→A**, **Score maior/menor primeiro**, **último contato** e
  **cadastro mais recente**;
- filtrar por **faixa de score (mín–máx)** com precisão, aplicada no servidor.

## O que ficou preparado para a V2 (e como ativar)

A interface do MVP não exibe nada disso (sem botões mortos); a base está pronta:

| Funcionalidade | O que já existe | Como ativar |
|---|---|---|
| **Mapa de Relacionamentos (grafo)** | Tabela `relationships` populada (inclui "quem apresentou"); aba Relacionamentos no contato | Construir página de grafo (ex.: d3/vis.js) lendo `relationships` |
| **Campos personalizados** | Tabelas `custom_fields` e `custom_field_values` | Criar UI de gestão em Configurações e render dinâmico no formulário |
| **Módulo de Relatórios** | Indicadores no dashboard; dados normalizados | Criar página `/relatorios` com agregações (a rota está reservada no menu como oculta) |
| **Busca de foto na internet** | Tela pronta no editor de fotos; interface `PhotoSearchProvider` desacoplada | Implementar o provedor em `src/features/photos/searchProvider.ts` chamando uma API de busca (Google Programmable Search/Bing) **via Netlify Function** — nunca exponha a chave no front-end |
| **Integrações (Google, Outlook, WhatsApp, RD, HubSpot…)** | Arquitetura de importação por arquivo compatível com todos os exports | Adicionar OAuth/APIs conforme credenciais (Seção 28 da spec) |
| **Camada de IA** | Dados estruturados (interações, notas, score) prontos para consumo | Criar Netlify Functions chamando o modelo desejado (Seção 29) |

## Limitações atuais conhecidas

- A busca fuzzy de duplicados roda no navegador — para arquivos com mais de ~8.000
  linhas ela é automaticamente desativada (mantêm-se e-mail/telefone/nome exato).
- Restauração de backup reinsere registros com os mesmos IDs (upsert) — conflitos de
  unicidade são reportados na tela, sem interromper o restante.
- O deploy manual por ZIP embute as variáveis no build (comportamento padrão do Vite).

## Credenciais de demonstração

Não há credenciais embutidas: crie a sua conta (Passo 5) e, se quiser dados de
exemplo, rode `supabase/seed-demo.sql`. Todos os dados do seed são fictícios.

## Próximos passos recomendados

1. Importar as 4 bases reais (uma por vez, ação padrão "Complementar dados").
2. Classificar os ~50 contatos mais estratégicos (grau 1–2 + importância).
3. Criar as listas inteligentes de trabalho (ex.: "90 dias sem contato").
4. Configurar cadências (lembretes recorrentes) para o grupo estratégico.
5. Gerar o primeiro backup JSON.
