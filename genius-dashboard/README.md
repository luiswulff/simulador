# ARGOS GENIUS — Executive Project Dashboard

Painel executivo desktop/web dos projetos, JVs e inovações catalogados pelo **Módulo Genius**
do Argos Core (ecossistema TaxCo). Lê o `GENIUS.md` do workspace do OpenClaw e apresenta cada
projeto como um **One-Pager executivo** com tese, modelo econômico, stakeholders e checklist de
follow-up.

Stack: **Next.js 14 (App Router) · TypeScript · Tailwind CSS · Lucide Icons · Framer Motion**.

---

## Rodando localmente

```bash
cd genius-dashboard
npm install
npm run dev          # http://localhost:3000
```

Outros scripts:

| Script | O que faz |
| --- | --- |
| `npm run build` / `npm start` | Build e execução em produção |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (config do Next) |
| `npm run sync:genius` | Grava em `data/projects.json` o merge do `GENIUS.md` com a base curada |
| `npm run sync:genius -- --check` | Só relata a diferença (sai com código 1 se houver drift) |
| `npm run sync:genius -- --file <path>` | Aponta para um `GENIUS.md` específico |

---

## Fonte de dados e sincronia

O painel resolve o `GENIUS.md` **em runtime, a cada request** (a página e a rota `/api/projects`
são `force-dynamic`), nesta ordem:

1. `GENIUS_MD_PATH` (veja `.env.example`);
2. `/Users/luiswulff/.openclaw/workspace/GENIUS.md` — quando o painel roda na mesma máquina do
   workspace OpenClaw/Argos, a sincronia é automática: salvou o `GENIUS.md`, recarregou a página;
3. `data/GENIUS.md` — cópia versionada aqui, usada como fallback.

O que é lido do markdown é fundido sobre a base curada `data/projects.json`:

* **conteúdo** (título, parceiro, tese, escopo/pilares, modelo econômico, próximos passos,
  evento de origem) vem do `GENIUS.md`;
* **taxonomia** (vertical primária, verticais, origem e status) vem do JSON curado, porque os
  rótulos da tabela-índice são texto livre (`🟢 Estruturado (Rebate 30-50%)`, `🟡 Pauta Alinhada`…);
* **enriquecimentos** que não existem no markdown — `summary`, `contacts`, `highlightMetric`,
  `declaredValueBRL` — também vêm do JSON.

Um projeto **novo** no `GENIUS.md` (nº 18 em diante) aparece automaticamente no painel, com
classificação best-effort e um aviso de sincronia no cabeçalho pedindo curadoria. Um projeto que
existe no JSON e sumiu do markdown continua listado, também com aviso.

Se nenhum `GENIUS.md` estiver acessível ou o parsing falhar, o painel cai para o
`data/projects.json` e o badge do topo passa de *Sincronizado com GENIUS.md* (verde) para
*Base curada* (âmbar).

### `GET /api/projects`

```jsonc
{
  "projects": [ /* ProjectGenius[] */ ],
  "source": {
    "kind": "genius-md",              // ou "projects-json"
    "path": "/Users/.../GENIUS.md",
    "label": "Sincronizado com GENIUS.md",
    "syncedAt": "2026-08-29T15:40:00.000Z",
    "warnings": []
  }
}
```

---

## Interface

* **Header executivo** — logo, métricas consolidadas (Total de Projetos, VGV/Volume Mapeado,
  JVs & Parcerias Ativas, Follow-ups Pendentes) e a origem dos dados em uso.
* **Filtros múltiplos com contadores** — Vertical, Origem e Status combinam entre si; cada chip
  mostra quantos projetos entrariam no recorte. Mais busca instantânea por qualquer campo.
* **Busca global `⌘K` / `Ctrl+K`** — navegação por `↑ ↓`, `↵` abre o One-Pager. Se o projeto
  escolhido estiver fora do recorte atual, os filtros são limpos para não perder a seleção.
* **Split-screen master–detail** — lista de cards à esquerda, One-Pager à direita, com abas
  *Tese de Negócio*, *Modelo Financeiro*, *Stakeholders* e *Follow-up*. Em telas pequenas o
  One-Pager vira uma visão de tela cheia.
* **Checklist de follow-up persistente** — marcações salvas em `localStorage`
  (`argos-genius:checklist:v1`), indexadas pelo texto do passo, então reescrever o `GENIUS.md`
  não embaralha o que já foi marcado. O checklist **não** altera o `GENIUS.md`.
* **Copiar resumo** — exporta o One-Pager como texto limpo (com o estado atual do checklist)
  para WhatsApp/Telegram.
* **PDF / Impressão** — `window.print()` renderiza uma folha dedicada com o One-Pager completo
  (todas as abas), em tinta escura sobre papel branco.

Atalhos: `⌘K`/`Ctrl+K` busca global · `/` foca o filtro · `↑ ↓` navega na lista · `Esc` fecha.

---

## Estrutura

```
genius-dashboard/
├── data/
│   ├── GENIUS.md              # cópia de fallback do Módulo Genius
│   └── projects.json          # base curada (17 projetos) — merge do GENIUS.md + curadoria
├── scripts/sync-genius.mts    # CLI de sincronia (type stripping nativo do Node 22)
└── src/
    ├── app/                   # App Router: página, layout, /api/projects, globals.css
    ├── components/            # TopBar, FilterBar, ProjectList/Card, CommandPalette, onepager/
    └── lib/                   # types, genius-parser, projects (loader), filters, format, useChecklist
```

### Notas sobre os dados

* Os **17 projetos** correspondem ao índice do `GENIUS.md` (última atualização: 29/08/2026).
* A métrica **VGV / Volume Mapeado** soma apenas volumes declarados explicitamente nos
  one-pagers (`declaredValueBRL`) — hoje o VGV de R$ 20M do Guahyba Private Estate e o teto de
  R$ 15M por operação da Província. Não há estimativa inferida.
* Projetos **11 a 17** não trazem um bloco “Próximos Passos” no `GENIUS.md`; os passos exibidos
  foram derivados da tese registrada e vêm marcados como tal no One-Pager (`nextStepsDerived`),
  para revisão antes de virar cobrança.
