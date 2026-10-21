# OpenClaw · Flight Search

Skill de **pesquisa de voos** para agentes autônomos [OpenClaw](https://docs.openclaw.ai).
O agente busca, compara e resume ofertas, **monitora preços** com alertas e — só se você habilitar — **reserva via Duffel com aprovação explícita** do usuário.

- Python 3.9+ só com biblioteca padrão (nada a instalar)
- Provedores plugáveis: **Duffel** (API de distribuição aérea, ofertas reserváveis), **SerpApi** (Google Flights) e **mock** (dados fictícios para testes)
- Saída JSON normalizada, igual para todos os provedores, ou texto compacto (`--format text`)
- Filtros (escalas, preço, duração, cias, horário, reembolsável), ordenação, datas flexíveis (±3 dias), cache de 15 min, novas tentativas em 429/5xx
- Erros sempre em JSON (`{"error": {"code", "message"}}`) com exit ≠ 0 — fácil para o agente reagir

## Instalação no OpenClaw

```bash
# copie a skill para o workspace do agente (ou ~/.agents/skills)
cp -r skills/flight-search <workspace>/skills/
```

Configure **uma** das chaves (no ambiente do gateway ou em `openclaw.json`):

```json5
// ~/.openclaw/openclaw.json
{
  skills: {
    entries: {
      "flight-search": {
        apiKey: "duffel_test_...",               // vira DUFFEL_ACCESS_TOKEN
        env: { SERPAPI_API_KEY: "..." }          // opcional, alternativa
      }
    }
  }
}
```

| Variável | Descrição |
|---|---|
| `DUFFEL_ACCESS_TOKEN` | Token da [Duffel](https://duffel.com) (`duffel_test_...` dá dados de teste gratuitos) |
| `SERPAPI_API_KEY` | Chave da [SerpApi](https://serpapi.com) (engine Google Flights; cobra por busca) |
| `FLIGHTS_PROVIDER` | Força `duffel`, `serpapi` ou `mock` (padrão: o primeiro com chave) |
| `FLIGHTS_CURRENCY` | Moeda padrão (SerpApi). Padrão `BRL` |
| `FLIGHTS_CACHE_TTL` / `FLIGHTS_CACHE_DIR` | Cache (padrão 900 s em `~/.cache/openclaw-flight-search`) |

Quando escolher qual: **Duffel** para preços de companhia com bagagem/regras de reembolso e possibilidade futura de reserva; **SerpApi** para cobertura ampla (inclui low-cost e cias que não estão na Duffel).

## Uso direto

```bash
S=skills/flight-search/scripts/flights.py

python3 $S airports "rio de janeiro" --format text
python3 $S search --from GRU --to LIS --depart 2026-11-10 --return 2026-11-20 --adults 2 --format text
python3 $S search --from CGH --to SDU --depart 2026-11-10 --max-stops 0 --depart-after 07:00 --depart-before 10:00 --sort departure
python3 $S search --from GRU --to MIA --depart 2026-12-15 --flex-days 3 --sort price --limit 5
python3 $S search --from GRU --to LIS --depart 2026-11-10 --provider mock --format text   # sem chave, dados fictícios
```

Exemplo de saída em texto:

```
GRU→LIS · ida e volta 2026-11-10/2026-11-20 · 2 adulto(s) · economy · duffel · 37 ofertas (mostrando 10)
1. BRL 6.241,10 | TAP Air Portugal | GRU→LIS 2026-11-10 22:05→11:40+1 10h35 direto [TP88] || LIS→GRU ... | 1 mala(s), não reembolsável | id=off_...
```

## Esquema JSON (resumo)

```
{ query{...}, count, returned,
  summary{cheapest, median, fastest_minutes, direct_available, currency},
  offers[{ id, provider, price{amount,currency}, airlines[],
           slices[{origin, destination, departure, arrival, duration_minutes, stops,
                   segments[{from,to,departure,arrival,carrier,carrier_name,flight_number,aircraft,duration_minutes}]}],
           total_duration_minutes, checked_bags, refundable, changeable, booking{} }],
  by_date[...]   # só com --flex-days
  errors[...]    # falhas parciais com --flex-days
}
```

Horários são **locais** de cada aeroporto. Preço é o **total** para todos os passageiros.

## Monitor de preço

```bash
python3 $S watch add --target-price 3000 --drop-percent 10 -- --from GRU --to LIS --depart 2026-11-10 --return 2026-11-20
python3 $S watch check --format text     # "Nenhum alerta (...)" ou linhas "ALERTA ..."
```

O estado fica em `~/.local/state/openclaw-flight-search/watches.json` (`FLIGHTS_STATE_DIR` muda o local).
Quem dispara o `watch check` periodicamente é o **cron do OpenClaw**. Exemplo (confira as flags com `openclaw cron add --help` na sua versão):

```bash
openclaw cron add \
  --name "Monitor de voos" \
  --cron "0 */6 * * *" --tz America/Sao_Paulo \
  --session isolated \
  --message "Use a skill flight-search: rode 'watch check --format text'. Se houver ALERTA, me envie um resumo curto; se não, não envie nada."
```

Cada verificação faz uma busca por monitor (sem cache). No SerpApi isso consome cota: 4 checagens/dia × N monitores.

## Reserva (opcional, desligada por padrão)

Fluxo em duas etapas, só com Duffel:

1. `book prepare --offer-id off_... --passengers-file pax.json` → consulta o preço **atual** da oferta, valida os passageiros e devolve um resumo + **código de aprovação de 6 dígitos** (válido por 30 min ou até a oferta expirar).
2. O agente mostra o resumo e o código; o usuário responde com o código.
3. `book confirm --booking-id bk_... --approval-code 123456` → confere o código, **consulta o preço de novo e aborta se mudou**, e emite o pedido pago com saldo Duffel (`balance`). O POST não tem novas tentativas automáticas, para evitar emissão duplicada.

Travas que **não dependem do agente** (variáveis de ambiente, controladas por você):

| Variável | Efeito |
|---|---|
| `FLIGHTS_BOOKING_ENABLED=1` | Sem ela, `book` sempre falha com `booking_disabled` |
| `FLIGHTS_ALLOW_LIVE_BOOKING=1` | Sem ela, tokens `duffel_live_...` são bloqueados → só modo teste (nenhum bilhete real) |
| `FLIGHTS_MAX_BOOKING_AMOUNT=5000` | Teto por reserva, checado no prepare e no confirm |

Outras proteções: 3 códigos errados cancelam a reserva pendente; uma reserva não pode ser confirmada duas vezes; depois da emissão, data de nascimento, e-mail e telefone são apagados do estado local (ficam só os nomes, o localizador e o id do pedido). Arquivos de estado são criados com permissão `600`.

> **Limitação honesta:** o código de aprovação aparece na saída que o próprio agente lê. Ele garante que o usuário **viu o resumo e confirmou**, mas não impede, tecnicamente, um agente que desobedeça a `SKILL.md`. As garantias rígidas são as variáveis acima. Para emitir bilhetes reais, recomendo também exigir aprovação manual do comando `book confirm` nas aprovações de execução (exec approvals) do OpenClaw e manter um teto baixo.

Exemplo de `pax.json`:

```json
[
  {"given_name": "Ana", "family_name": "Silva", "born_on": "1990-05-01", "gender": "f", "title": "ms",
   "email": "ana@example.com", "phone_number": "+5511999998888"}
]
```

## Testes

```bash
python3 -m unittest discover -s tests -v   # offline: toda chamada HTTP é simulada
```

## Próximos passos possíveis

- Servidor MCP expondo as mesmas funções como ferramentas
- Assentos e bagagem extra na reserva (serviços adicionais da Duffel)
