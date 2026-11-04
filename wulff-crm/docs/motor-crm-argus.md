# MOTOR DE CRM — OPEN CLAW ARGUS

> **Versão do motor:** 1.0 · **Data:** 2026-11-04 · **Autor da base:** Luis Wulff
> **Natureza:** especificação executável. O agente (Argus) lê este documento e o
> aplica contato a contato. Não é código: é o *contrato* de como avaliar,
> classificar, pontuar e auditar cada contato.

---

## 0. Propósito

Avaliar **todos** os contatos do celular, incorporá-los à base existente sem
duplicar, atribuir a cada um uma **classificação de CRM** e manter o conjunto
**sempre auditado**. Cada contato recebe um **selo**:

```
<LETRA><ESTRELAS>      exemplos:  C5   L4   P3   N1
```

- **Letra** = natureza da relação comercial (Seção 2).
- **Estrelas (1–5)** = força/prioridade do relacionamento, derivada do
  Relationship Score (Seção 5). 5★ = nota máxima, 1★ = menor.

Exibição amigável: `C ★★★★★`, `L ★★★★☆`, `P ★★★☆☆`.

### Princípios inegociáveis
1. **Incremental**: incorporar nunca destrói dado existente (só cria ou complementa).
2. **Auditável**: nenhuma mudança de letra ou estrela acontece sem registro (Seção 6).
3. **Sem invenção**: o motor classifica a partir de sinais **registrados**. Na
   ausência de sinal, abstém-se (N com baixa confiança ou marca para revisão) —
   nunca fabrica um fato para justificar uma classe.
4. **Determinístico onde dá, julgamento onde precisa** (Seção 4).
5. **Idempotente**: reavaliar um contato sem dado novo produz o mesmo selo.

---

## 1. Modelo do dado (o selo e seus campos)

Cada contato carrega, além dos campos de cadastro já existentes:

| Campo | Tipo | Descrição |
|---|---|---|
| `crm_class` | `C` \| `L` \| `P` \| `N` | Letra atual (Seção 2). Vazio = ainda não avaliado. |
| `crm_stars` | 1–5 | Estrelas atuais (Seção 5). |
| `crm_selo` | texto | Derivado: `crm_class` + `crm_stars` (ex.: `C5`). |
| `crm_score` | 0–100 | Relationship Score que gerou as estrelas. |
| `crm_source` | texto | Quem decidiu: `regra:R1`, `agente:argus`, `humano:luis`. |
| `crm_confidence` | 0–1 | Confiança da decisão de letra. |
| `crm_needs_review` | bool | `true` quando precisa de olho humano. |
| `crm_evaluated_at` | timestamp | Última avaliação. |
| `crm_engine_version` | texto | Versão do motor que avaliou (ex.: `1.0`). |

O histórico completo de mudanças vive no **log de avaliações** (Seção 6), não
sobrescreve estes campos.

---

## 2. As quatro letras (definições operacionais)

A letra responde a uma pergunta: **qual é a natureza comercial desta relação,
do seu ponto de vista (você vende)?**

### C — Cliente
Já comprou, contratou ou paga/pagou por algo seu.
- **Inclui**: cliente ativo, cliente recorrente, **ex-cliente** (comprou no
  passado — continua C, mas as estrelas caem pela recência).
- **Não é C**: quem só recebeu proposta e não fechou (isso é L).

### L — Lead
Potencial comercial **ainda não convertido**.
- **Inclui**: prospect, quem demonstrou interesse, proposta enviada e não
  fechada, contato de evento com fit comercial, indicação a prospectar.
- **Vira C** quando houver evidência de compra; **vira N** se esfriar sem fit.

### P — Parceiro / Partner
Relação de **reciprocidade ou colaboração**, não de compra-e-venda direta.
- **Inclui**: quem indica clientes, canal, sócio, investidor, fornecedor
  estratégico, advisor, co-criação, parceria institucional.
- Regra de desempate: se a pessoa **compra de você** → C vence P. Se a relação é
  mútua/estratégica sem você vender para ela → P.

### N — Neutro / fora do CRM  *(adição ao seu C/L/P — ver nota)*
Avaliado e **sem** relação comercial ativa: amigos, família, conhecidos,
prestadores pessoais, e **não-humanos** (caixas `no-reply`, NF-e, lojas,
instituições — reaproveita a classificação da base consolidada).
- Serve para provar que o contato **foi avaliado** e descartado do funil — é o
  que torna "avaliar todos os contatos" auditável, sem inflar C/L/P.
- `N` ≠ vazio. **Vazio** = ainda não avaliado. **N** = avaliado, fora do CRM.

> **Nota:** você pediu C/L/P. `N` foi adicionado porque a maioria dos ~43 mil
> contatos do celular não é comercial; sem `N`, eles ou poluiriam o funil ou
> ficariam indistinguíveis dos "não avaliados". Se preferir, troque `N` por
> "deixar vazio" — o resto do motor não muda.

---

## 3. Pipeline de ingestão e reconciliação

Executado a cada nova carga de contatos do celular (vCard/CSV/Google export).

1. **Ler** a fonte (vCard, CSV Google, etc.).
2. **Normalizar** (mesmas regras da base: telefone → E.164 `+55…`, e-mail em
   minúsculas, nome em Título, aniversário incl. `--MM-DD`, nome-que-é-e-mail
   recuperado).
3. **Reconciliar** contra a base por, nesta ordem: e-mail → telefone normalizado
   → WhatsApp → LinkedIn → nome+empresa → similaridade de nome (fuzzy ≥ 0,82).
4. **Incorporar** (incremental):
   - Não encontrado → **cria** contato (`source = import`).
   - Encontrado → **complementa** campos vazios e agrega e-mails/telefones
     adicionais; **nunca** sobrescreve dado preenchido.
5. **Classificar** (Seção 4) → define `crm_class`.
6. **Pontuar** (Seção 5) → define `crm_stars` a partir do `crm_score`.
7. **Auditar** (Seção 6) → grava a avaliação.

Idempotência: um contato do celular já existente passa direto para os passos
5–7; não vira registro novo.

---

## 4. Classificação C/L/P/N — motor híbrido

Três camadas, nesta ordem. **A primeira que resolver com confiança decide.**
Sempre colete **todos** os sinais (para o log), mesmo que uma regra já tenha
decidido.

### Camada 1 — Regras determinísticas (alta confiança)
Avalie em ordem; a primeira que casar define a letra. `conf` = confiança.

| # | Condição (sinal registrado) | Letra | conf |
|---|---|---|---|
| **R0** | Tag `Mensageria automática` **ou** `Entidade / não humano`; ou e-mail institucional (`no-reply`, `nfe`, `boleto`, `contato@`, `sac@`…) sem nome humano | **N** | 0,99 |
| **R1** | Existe interação tipo `contrato`; **ou** categoria `Cliente`; **ou** tag `Cliente VIP` | **C** | 0,95 |
| **R2** | Categoria `Ex-cliente` (marca relação como inativa; estrelas caem pela recência) | **C** | 0,90 |
| **R3** | Categoria `Parceiro`, `Canal`, `Sócio`, `Investidor`; **ou** registro de "quem apresentou" com reciprocidade | **P** | 0,90 |
| **R4** | Categoria `Fornecedor` (parceiro de negócio, não comprador seu) | **P** | 0,80 |
| **R5** | Categoria `Prospect`; **ou** interação `proposta` sem `contrato` posterior; **ou** `potencial_comercial ≥ 3` sem compra; **ou** campo `oportunidades` preenchido | **L** | 0,85 |
| **R6** | Categoria `Amigo`, `Família` ou `Conhecido` **e** nenhum sinal comercial | **N** | 0,80 |
| **R7** | Nenhuma categoria de CRM, nenhuma interação comercial, só dado de contato | **N** | 0,55 → **marca `needs_review` se tiver empresa preenchida** |

Conflito de regras de alto peso (ex.: casou R1 **e** R3 → é cliente *e* parceiro)
→ **não decide na Camada 1**; manda para a Camada 2 com os dois sinais.

### Camada 2 — Julgamento do agente (Argus)
Aplicada quando: houve conflito de sinais fortes, **ou** só há sinal fraco, **ou**
R7 marcou revisão por ter empresa (pode ser L real).

**Entrada que o agente deve ler:** nome, empresa, cargo, cidade; categorias e
tags; histórico de interações (tipos e resumos); notas; `oportunidades`,
`potencial_comercial`, `relationship_status`; origem do cadastro.

**Tarefa:** escolher **uma** letra (C/L/P/N) e devolver:
- `class`, `reason` (1 frase citando o sinal concreto que decidiu),
- `confidence` (0–1), `needs_review` (bool).

**Regras de julgamento (ordem de prioridade):**
1. Qualquer evidência de compra → **C** (C vence L e P).
2. Relação mútua/estratégica sem você vender para a pessoa → **P**.
3. Fit comercial futuro, sem compra → **L**.
4. Sem relação comercial → **N**.
5. **Abstenção**: se decidir exigiria inventar um fato, ou os sinais são
   genuinamente insuficientes → `class` = melhor palpite, `confidence < 0,6`,
   `needs_review = true`. Nunca "chutar alto".

### Camada 3 — Revisão humana (trava de segurança)
Marque `crm_needs_review = true` e **não aplique a mudança automaticamente**
quando:
- `confidence < 0,60`; **ou**
- a decisão **rebaixaria** um `C` já existente para `L`/`P`/`N` (proteção: um
  cliente conquistado não é despromovido por um robô — só por pessoa); **ou**
- sinais de alto peso continuam conflitando após a Camada 2.

Nesses casos, o selo antigo permanece e o contato entra numa fila de revisão.

---

## 5. Estrelas (1–5) a partir do Relationship Score

As estrelas reaproveitam o **Relationship Score (0–100)** já definido na base,
cuja composição e pesos são:

| Fator | Peso |
|---|---|
| Recência do último contato | 25 |
| Grau de proximidade | 20 |
| Quantidade de interações | 15 |
| Importância | 15 |
| Influência | 10 |
| Potencial / negócios | 5 |
| Conexões em comum | 5 |
| Completude do cadastro | 5 |

**Conversão score → estrelas** (faixas; ajustáveis):

| Score | Estrelas |
|---|---|
| 85–100 | ★★★★★ (5) |
| 65–84 | ★★★★☆ (4) |
| 45–64 | ★★★☆☆ (3) |
| 25–44 | ★★☆☆☆ (2) |
| 0–24 | ★☆☆☆☆ (1) |

Pontos importantes:
- **Estrelas são independentes da letra.** Um Lead quente e engajado pode ser
  `L5`; um cliente que esfriou há 2 anos pode ser `C2`. Isso é desejável: a
  letra diz *o que é*, a estrela diz *quão forte/prioritário é agora*.
- Como as estrelas são **função** do score, elas se atualizam sozinhas quando o
  relacionamento muda (nova interação, cadastro mais completo). Reavaliar é
  barato e idempotente.
- Contatos frios do celular (sem interação, cadastro magro) cairão naturalmente
  em 1–2★ — o que é verdade: baixa prioridade. Não é erro.

---

## 6. Protocolo de auditoria ("sempre auditado")

Toda avaliação — mudança **ou** confirmação — grava **uma linha imutável** no log
de avaliações. O log é append-only; os campos da Seção 1 guardam só o estado atual.

**Registro de avaliação (JSON):**
```json
{
  "contact_id": "uuid",
  "evaluated_at": "2026-11-04T13:20:00Z",
  "engine_version": "1.0",
  "evaluator": "regra:R1 | agente:argus | humano:luis",
  "class":  { "before": "L",  "after": "C" },
  "stars":  { "before": 3, "after": 5, "score": 88 },
  "signals": ["interacao:contrato#9f3", "categoria:Cliente"],
  "confidence": 0.95,
  "needs_review": false,
  "note": "fechou contrato em 2026-10; estrelas subiram pela recência"
}
```

**Invariantes auditáveis** (o motor deve garantir e conseguir provar):
- Nenhuma mudança de `crm_class`/`crm_stars` sem linha de log correspondente.
- Todo contato avaliado tem `crm_evaluated_at` e `crm_engine_version`.
- Toda decisão da Camada 2 traz `reason` + `signals` (rastreabilidade do porquê).
- Rebaixamento de `C` só com `evaluator = humano:*`.

**Cadência de reavaliação:**
- A cada ingestão de contatos do celular (incremental).
- Quando qualquer sinal muda (nova interação, nova tag, cadastro editado).
- Varredura periódica (ex.: semanal) para re-derivar estrelas pela recência —
  relacionamentos esfriam com o tempo mesmo sem nenhuma edição.

---

## 7. Contrato de saída (o que o Argus devolve por contato)

```json
{
  "contact_id": "uuid",
  "selo": "C5",
  "class": "C",
  "stars": 5,
  "score": 88,
  "source": "regra:R1",
  "confidence": 0.95,
  "needs_review": false
}
```

**Laço de execução do agente**, por contato:
1. Normalizar + reconciliar (Seção 3, passos 2–4).
2. Coletar sinais; aplicar Camada 1 (Seção 4). Resolveu com confiança? siga.
3. Senão, aplicar Camada 2; se `needs_review`, aplicar Camada 3 (não muda o selo).
4. Calcular `score` → `stars` (Seção 5).
5. Montar o selo; gravar o registro de auditoria (Seção 6).

---

## 8. Exemplos trabalhados (dados fictícios)

**Ex. 1 — Cliente claro (Camada 1).**
Contato com interação `contrato` + categoria `Cliente`, último contato há 10
dias, importância 5, 8 interações. → R1 ⇒ **C**, conf 0,95. Score 88 ⇒ **5★**.
Selo **`C5`**. Log: `evaluator=regra:R1`, `signals=[contrato, categoria:Cliente]`.

**Ex. 2 — Ambíguo → agente (Camada 2).**
Pessoa com empresa e cargo, sem categoria, sem interação, veio de import do
celular, mas há uma nota "me pediu orçamento em evento". R7 marcaria revisão;
a Camada 2 lê a nota → sinal de interesse não convertido ⇒ **L**, conf 0,7,
`needs_review=false`. Score 38 ⇒ **2★**. Selo **`L2`**.

**Ex. 3 — Não-humano (Camada 1, exclusão).**
`nfe@loja-exemplo.com.br`, tag `Mensageria automática`. → R0 ⇒ **N**, conf 0,99.
Score baixo ⇒ **1★**. Selo **`N1`**. Fica fora do funil, mas auditado.

---

## 9. Apêndice — materialização opcional no banco (Wulff CRM)

Você escolheu o motor como **spec** (não como módulo). Se um dia quiser gravar os
selos no Supabase do Wulff CRM, estes são os campos e a conversão de estrelas —
mantêm o motor e o app consistentes:

```sql
-- Campos do selo no contato
alter table contacts add column if not exists crm_class text
  check (crm_class in ('C','L','P','N'));
alter table contacts add column if not exists crm_stars smallint
  check (crm_stars between 1 and 5);
alter table contacts add column if not exists crm_source text;
alter table contacts add column if not exists crm_confidence real;
alter table contacts add column if not exists crm_needs_review boolean default false;
alter table contacts add column if not exists crm_evaluated_at timestamptz;
alter table contacts add column if not exists crm_engine_version text;

-- Estrelas a partir do score (usa a função contact_score do upgrade v1.1)
create or replace function stars_from_score(s int)
returns smallint language sql immutable as $$
  select case
    when s >= 85 then 5 when s >= 65 then 4 when s >= 45 then 3
    when s >= 25 then 2 else 1 end::smallint
$$;

-- Log de avaliações (append-only)
create table if not exists crm_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  evaluated_at timestamptz not null default now(),
  engine_version text not null,
  evaluator text not null,
  class_before text, class_after text,
  stars_before smallint, stars_after smallint, score int,
  signals jsonb, confidence real, needs_review boolean, note text
);
```

---

## 10. Changelog
- **1.0 (2026-11-04):** primeira versão. Letras C/L/P + N; estrelas pelo
  Relationship Score; motor híbrido (regras R0–R7 + agente + revisão humana);
  protocolo de auditoria e contrato de saída.
