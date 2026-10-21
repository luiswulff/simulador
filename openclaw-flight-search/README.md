# OpenClaw · Flight Search

Skill de **pesquisa de voos** para agentes autônomos [OpenClaw](https://docs.openclaw.ai).
O agente busca, compara e resume ofertas — **não reserva nem compra** (decisão de segurança: compra fica com o humano).

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

## Testes

```bash
python3 -m unittest discover -s tests -v   # offline, respostas dos provedores simuladas
```

## Próximos passos possíveis

- Reserva via Duffel Orders com etapa de **aprovação humana** obrigatória
- Monitor de preço (cron do OpenClaw + alerta quando cair abaixo de X)
- Servidor MCP expondo as mesmas funções como ferramentas
