# Planejamento Estratégico 2027–2030 — Arquitetura e estrutura do projeto

> Documento de referência para quem vai **preencher**, **operar** e **evoluir** a aplicação.
> Leia junto com o `README.md` (setup e publicação).

---

## 1. Objetivo

Transformar o planejamento estratégico 2027–2030 em um **sistema vivo**, e não num PDF:

1. **Navegável:** do nível mais alto (missão, visão, ambição Big Five brasileira) até a menor
   ação, por drill-down: *pilar → objetivo → iniciativa → ação → atualização*, e também
   *área → pessoa → o que está sob responsabilidade dela*.
2. **Acompanhável:** cada ação tem dono, prazo, % de avanço e histórico de check-ins; cada
   indicador tem metas anuais e medições. O progresso sobe automaticamente pela cascata.
3. **Integrável:** o cadastro de áreas e pessoas é **único da firma** (`org_*`), e outras
   aplicações (CRM, propostas, RH, financeiro, BI) leem o planejamento por **views estáveis**.

---

## 2. A estrutura do planejamento (o que o app organiza)

```
CICLO 2027–2030
├── DIREÇÃO
│   ├── Identidade ............ Missão · Visão · Propósito · Valores (+ comportamentos) · Cultura
│   └── Ambição 2030 .......... Frase-síntese ("Big Five brasileira")
│       ├── Indicadores da firma com metas 2027 / 2028 / 2029 / 2030
│       └── Roadmap de marcos por ano (a "transformação")
│
├── DESDOBRAMENTO (cascata executável)
│   └── Pilar (perspectiva)
│       └── Objetivo estratégico (OE-xx) ── indicadores do objetivo
│           └── Iniciativa / projeto (IN-xx.y) ── área, dono, período, orçamento
│               └── Ação 5W2H ── o quê, por quê, onde, quem, quando, como, quanto
│                   └── Atualizações (check-ins com % e comentário)
│
├── ORGANIZAÇÃO (dados mestres da firma)
│   ├── Áreas (hierarquia, líder) ── indicadores da área, iniciativas, ações
│   └── Pessoas (área, cargo, gestor, degrau societário) ── tudo que ela lidera
│
├── GENTE & SOCIEDADE
│   ├── Plano de cargos e salários (cargos, requisitos, faixas por nível) ── CONFIDENCIAL
│   └── Plano de carreira societário (degraus, critérios, tempo mínimo,
│       participação de referência, direitos e obrigações)
│
└── VALOR
    └── Valuation (cenários pessimista/base/otimista, projeções 2026–2030,
        EV por múltiplo de EBITDA e DCF simplificado) ── CONFIDENCIAL
```

**Regra de consolidação do progresso** (`src/lib/progresso.ts`):
ação (% informado; concluída = 100) → iniciativa = média das ações → objetivo = média das
iniciativas → pilar = média dos objetivos. Itens cancelados não entram na conta.

**Atingimento de indicador:** última medição do ano ÷ meta do ano (invertido quando a
polaridade é "quanto menor, melhor").

---

## 3. Mapa de telas (rotas = drill-down)

| Rota | Tela | Desce para |
|---|---|---|
| `/` | Painel estratégico: metas do ano, progresso por pilar, prazos, atrasos, marcos | pilar, indicador, ação |
| `/identidade` | Missão, visão, propósito, valores, cultura | — |
| `/ambicao` | Ambição, metas da firma ano a ano, roadmap 2027–2030 | indicador |
| `/estrategia` | Mapa estratégico (pilares × objetivos) | pilar, objetivo |
| `/estrategia/pilares/:id` | Pilar | objetivo |
| `/estrategia/objetivos/:id` | Objetivo: indicadores + iniciativas | indicador, iniciativa |
| `/estrategia/iniciativas/:id` | Iniciativa + plano de ação 5W2H | ação, pessoa, área |
| `/execucao` | Todas as ações, com filtros (minhas, atrasadas, área, pessoa, status) | ação |
| `/execucao/:id` | Ação: 5W2H completo + check-ins | — |
| `/indicadores`, `/indicadores/:id` | KPIs, metas por ano (editáveis), medições | — |
| `/areas`, `/areas/:id` | Área: objetivos, KPIs, iniciativas, ações, pessoas | pessoa |
| `/pessoas`, `/pessoas/:id` | Pessoa: cargo, degrau, objetivos, iniciativas, ações, equipe | — |
| `/cargos-salarios` | Cargos e faixas salariais (só Diretoria) | — |
| `/carreira-societaria` | Escada societária e quem está em cada degrau | pessoa |
| `/valuation` | Cenários e projeções (só Diretoria) | — |
| `/configuracoes` | Ciclo, usuários e perfis, integração | — |

Os filtros de `/execucao` ficam na URL (`?filtro=atrasadas&area=…`), então qualquer visão
pode ser compartilhada por link ou aberta a partir de outro sistema.

---

## 4. Arquitetura técnica

Mesma stack do **Wulff CRM** (de propósito, para reaproveitar conhecimento, hospedagem e
o projeto Supabase):

- **Front-end:** React 18 + TypeScript + Vite + Tailwind CSS + TanStack Query + React Router
- **Back-end:** Supabase (Postgres + Auth + Row Level Security)
- **Hospedagem:** Netlify (build estático; `netlify.toml` já configurado)

```
src/
├── config.ts              # nome da firma, chaves, modo demonstração
├── data/
│   ├── types.ts           # tipos de todas as tabelas (espelho do schema.sql)
│   ├── repo.ts            # ÚNICA porta de acesso a dados: SupabaseRepo | LocalRepo (demo)
│   ├── hooks.ts           # useList / useRow / useSave / useRemove / useIndex
│   ├── campos.ts          # definição declarativa dos formulários de cada entidade
│   ├── ciclo.ts           # ciclo ativo e ano de referência
│   └── seed.ts            # dados ILUSTRATIVOS do modo demonstração
├── lib/                   # formatação (pt-BR), regras de progresso e atingimento
├── contexts/AuthContext   # sessão, perfil e permissões na interface (usePode)
├── components/            # Layout (menu), UI (cards de drill-down, progresso…), EntityForm
└── pages/                 # uma página por nível do drill-down
supabase/schema.sql        # script ÚNICO e idempotente do banco (tabelas, RLS, views, auditoria)
```

**Decisões que facilitam a evolução:**

- **Camada de dados única (`repo.ts`).** As telas nunca chamam o Supabase diretamente. Trocar o
  backend, ou ler parte dos dados de outro sistema da firma, mexe em um arquivo só.
- **Formulários declarativos (`campos.ts`).** Adicionar um campo = coluna no SQL + tipo em
  `types.ts` + uma linha em `campos.ts`. Nenhuma tela precisa ser reescrita.
- **Modo demonstração.** Sem as variáveis do Supabase, o app roda com dados de exemplo no
  navegador. Serve para apresentar a estrutura à sociedade antes de abrir o banco.
- **Histórico automático.** Toda inclusão, alteração e exclusão nas tabelas do plano é gravada
  em `pe_historico` (trigger), o que permite auditoria e uma "linha do tempo" do plano.

---

## 5. Modelo de dados

| Tabela | Conteúdo | Chave de ligação |
|---|---|---|
| `org_areas` | Áreas da firma (hierarquia, líder) | `area_pai_id`, `lider_id` |
| `org_pessoas` | Pessoas (login, área, cargo, degrau, gestor, sócio) | `user_id` (auth) |
| `pe_perfis` | Perfil de acesso de cada usuário | `user_id` → `pessoa_id` |
| `pe_ciclos` | Ciclo de planejamento (2027–2030; prepara 2031–2034) | — |
| `pe_identidade` | Missão, visão, propósito, valores, cultura | `ciclo_id` |
| `pe_marcos` | Marcos da transformação por ano | `ciclo_id` |
| `pe_pilares` → `pe_objetivos` → `pe_iniciativas` → `pe_acoes` → `pe_acao_atualizacoes` | Cascata executável | FK em cascata |
| `pe_indicadores` + `pe_indicador_metas` + `pe_indicador_medicoes` | KPIs (nível ambição, objetivo ou área), metas anuais e medições | `objetivo_id` / `area_id` |
| `pe_cargos` + `pe_faixas_salariais` | Plano de cargos e salários | `cargo_id` |
| `pe_carreira_degraus` | Degraus da carreira (trilha societária/profissional) | `org_pessoas.degrau_id` |
| `pe_valuation_cenarios` + `pe_valuation_projecoes` | Cenários e projeções financeiras | `cenario_id` |
| `pe_historico` | Auditoria de todas as mudanças | `tabela` + `registro_id` |

Salário **individual** não é guardado de propósito. Ele pertence à folha/RH; aqui ficam só as
faixas do plano. Se um dia for necessário, crie uma tabela própria com RLS só para a Diretoria.

---

## 6. Perfis de acesso e confidencialidade

As permissões são garantidas **no banco** (Row Level Security). A interface só esconde os
botões que dariam erro.

| | Diretoria | Líder de área | Colaborador |
|---|---|---|---|
| Ler identidade, ambição, mapa, áreas, pessoas, carreira | ✅ | ✅ | ✅ |
| Editar identidade, pilares, objetivos, áreas, pessoas, carreira | ✅ | — | — |
| Criar/editar iniciativas, ações e KPIs **da própria área** | ✅ | ✅ | — |
| Atualizar % e status das **próprias ações** | ✅ | ✅ | ✅ |
| Registrar check-ins e medições | ✅ | ✅ | ✅ |
| **Cargos e salários · Valuation · Histórico** | ✅ | — | — |
| Gerenciar usuários e perfis | ✅ | — | — |

- O **primeiro usuário** que se cadastra vira Diretoria; os demais entram como Colaborador.
- Um login é ligado automaticamente à pessoa de `org_pessoas` que tem o **mesmo e-mail**.
- Uma pessoa é **líder** das áreas em que aparece como `lider_id` e das subáreas diretas delas.
- Os testes de RLS (diretoria, líder e colaborador) foram rodados num Postgres local antes da
  entrega: leitura e escrita permitidas e bloqueadas conforme a tabela acima.

---

## 7. Integração com as demais aplicações da firma

**Recomendação: um único projeto Supabase para a firma**, com prefixos por domínio:

| Prefixo | Dono | Exemplo |
|---|---|---|
| `org_*` | Cadastro mestre (compartilhado) | áreas, pessoas |
| `pe_*` | Planejamento estratégico | este app |
| `crm_*` (futuro) | CRM / relacionamento | contatos, empresas |
| … | Outros apps | propostas, horas, financeiro |

> O Wulff CRM atual é single-tenant pessoal (tabelas sem prefixo, RLS por `user_id`). Se ele for
> virar um CRM da firma, a migração recomendada é renomear para `crm_*` e apontar
> `owner`/responsáveis para `org_pessoas`. Os dois apps já convivem no mesmo projeto sem
> conflito, porque os nomes de tabela e de trigger são distintos.

**Como outro sistema consome o planejamento:**

1. **Leitura por views** (contrato estável, respeita o RLS de quem consulta):
   - `vw_pe_acoes`: ação + iniciativa + objetivo + pilar + responsável + área + `atrasada`
   - `vw_pe_indicadores`: indicador + meta por ano + último valor medido no ano
   ```ts
   const { data } = await supabase.from('vw_pe_acoes').select('*').eq('responsavel_email', email);
   ```
2. **Escrita de medições automáticas:** um sistema financeiro/BI pode gravar em
   `pe_indicador_medicoes` (ex.: receita do mês), via **Edge Function** com chave de serviço
   guardada no servidor, nunca no front-end.
3. **Links profundos:** qualquer app pode abrir `https://<pe>/estrategia/objetivos/<id>` ou
   `/execucao?pessoa=<id>`.
4. **Login único:** com o mesmo projeto Supabase, a sessão e os usuários são os mesmos para
   todos os apps. Um *portal* da firma pode listar os apps com um único login.

---

## 8. Como manter o plano vivo (ritual de gestão sugerido)

| Cadência | Quem | O que acontece no app |
|---|---|---|
| **Semanal** | Responsáveis por ações | Check-in em cada ação (`/execucao?filtro=minhas`): % + comentário |
| **Mensal** | Líderes de área | Reunião de área usando `/areas/:id`; lançar medições dos KPIs da área |
| **Mensal** | Diretoria | Painel + `/execucao?filtro=atrasadas`; destravar e repriorizar |
| **Trimestral** | Sócios | Revisão da estratégia (RAE): pilares, objetivos, indicadores da ambição, marcos |
| **Anual** | Sócios | Revisão de metas do ano seguinte, faixas salariais, degraus societários e valuation |

---

## 9. Roadmap de evolução da aplicação

| Fase | Entrega | Status |
|---|---|---|
| **1. Fundação** | Estrutura completa, drill-down, CRUD, RLS, auditoria, modo demo, views de integração | ✅ entregue |
| **2. Conteúdo real** | Sócios preenchem identidade, ambição, metas, pilares, objetivos; RH importa áreas/pessoas/cargos | 🔜 próximo |
| **3. Rotina** | Lembretes por e-mail de check-in e de prazo, "minhas pendências" ao entrar, exportação PDF/Excel do plano | planejado |
| **4. Gestão** | Gráficos de evolução dos KPIs, farol por área, linha do tempo a partir de `pe_historico`, comentários | planejado |
| **5. Pessoas** | Avaliação de desempenho ligada aos critérios dos degraus, PDI, comitê de promoção societária | planejado |
| **6. Integrações** | Medições automáticas (financeiro/BI), metas comerciais ligadas ao CRM, portal único da firma | planejado |
| **7. IA** | Resumo executivo mensal, alertas de risco e sugestões de ações (via Edge Functions) | opcional |

---

## 10. O que a firma precisa decidir/preencher (conteúdo, não código)

1. Missão, visão, propósito, valores (com comportamentos observáveis) e traços de cultura.
2. A definição operacional de **"Big Five brasileira"**: em que métrica (receita, nº de
   profissionais, nº de sócios, praças, ranking setorial) e contra quais firmas?
3. Os 4 a 6 indicadores da ambição, com **linha de base 2026** e metas 2027–2030.
4. Pilares (perspectivas) e de 8 a 15 objetivos estratégicos, cada um com um sponsor.
5. Iniciativas de 2027, com dono, prazo e orçamento; ações 5W2H do primeiro semestre.
6. Organograma (áreas e líderes) e cadastro de pessoas (idealmente exportado do RH).
7. Cargos, requisitos e faixas salariais (pesquisa de mercado).
8. Degraus societários: critérios, tempos, participação, direitos e obrigações. Validar com
   o acordo de sócios e com o jurídico.
9. Premissas de valuation (múltiplo, WACC, crescimento) e projeções por cenário.

> Todo o conteúdo do **modo demonstração** é ilustrativo (marcado com "[Exemplo]"). Não há
> nenhum dado real da firma no código.
