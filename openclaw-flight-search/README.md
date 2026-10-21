# OpenClaw · Flight Search

Skill de **pesquisa e monitoramento de preços de voos** para agentes autônomos [OpenClaw](https://docs.openclaw.ai), usando o Google Flights via [SerpApi](https://serpapi.com).
O agente busca, compara, avalia se o preço está bom, gera cotações de uma página e avisa quando baixar. **Não reserva nem compra** — a compra fica com você, pelo link do Google Flights.

- Python 3.9+ só com biblioteca padrão (nada a instalar)
- Avaliação de preço do Google (baixo / típico / alto + faixa típica)
- Filtros (escalas, preço, duração, cias, horário), ordenação, datas flexíveis (±3 dias)
- Monitor de preço com alertas por preço-alvo ou queda percentual
- Saída JSON ou texto compacto; erros sempre em JSON com exit ≠ 0
- Cache de 15 min e novas tentativas automáticas em falhas temporárias

## Instalação

1. Copie a pasta da skill para o workspace do agente (ou `~/.agents/skills`):
   ```bash
   cp -r skills/flight-search <workspace>/skills/
   ```
2. Configure a chave da SerpApi — **uma** das opções:
   - renomeie `.env.example` para `.env` (dentro de `<workspace>/skills/flight-search/`) e preencha `SERPAPI_API_KEY=sua_chave`, **ou**
   - no `~/.openclaw/openclaw.json`:
     ```json5
     { skills: { entries: { "flight-search": { apiKey: "sua_chave" } } } }
     ```
   Variável de ambiente tem prioridade sobre o `.env`. O `.env` está no `.gitignore` — **não faça commit da chave**.
3. Teste:
   ```bash
   python3 <workspace>/skills/flight-search/scripts/flights.py search --from GRU --to LIS --depart 2026-12-10 --format text
   ```

| Variável | Descrição |
|---|---|
| `SERPAPI_API_KEY` | Chave da SerpApi (obrigatória) |
| `FLIGHTS_CURRENCY` | Moeda padrão. Padrão `BRL` |
| `FLIGHTS_CACHE_TTL` / `FLIGHTS_CACHE_DIR` | Cache (padrão 900 s em `~/.cache/openclaw-flight-search`) |
| `FLIGHTS_STATE_DIR` | Onde ficam os monitores (padrão `~/.local/state/openclaw-flight-search`) |

## Uso

```bash
S=skills/flight-search/scripts/flights.py

python3 $S airports "rio de janeiro" --format text
python3 $S search --from GRU --to LIS --depart 2026-12-10 --return 2026-12-20 --adults 2 --format text
python3 $S search --from CGH --to SDU --depart 2026-11-13 --max-stops 0 --depart-after 07:00 --depart-before 10:00 --sort departure --format text
python3 $S search --from GRU --to MIA --depart 2026-12-15 --flex-days 3 --limit 5 --format text
```

Saída real (out/2026):

```
CGH→SDU · ida e volta 2026-11-13/2026-11-15 · 1 adulto(s) · economy · serpapi · 12 ofertas (mostrando 4)
Avaliação do Google: preço típico; faixa típica BRL 620,00–BRL 1.400,00
1. BRL 1.309,00 | Gol | CGH→SDU 2026-11-13 07:10→08:15 1h05 direto [G31004] | id=serpapi-2026-11-13-1
2. BRL 1.818,00 | Azul | CGH→SDU 2026-11-13 07:20→08:20 1h00 direto [AD6050] | id=serpapi-2026-11-13-31
```

Horários são **locais** de cada aeroporto. Preço é o **total** para todos os passageiros. Em ida e volta, o preço é da viagem completa, mas só os voos de ida são detalhados.

## Cotação (uma página)

O comando `quote` transforma uma busca numa cotação de **uma página A4**, em estilo minimalista: rota, três números-resumo (a partir de, mais rápida, faixa típica do Google) e cartões **do mais barato ao mais caro**:

- **opção principal** (melhor equilíbrio preço × tempo) **+ 2 ou 3 alternativas com conexão**, as mais baratas da busca;
- **ida e volta completas** (o script busca a volta de cada opção: +1 busca SerpApi por opção, com cache; `--no-return` desliga);
- cada trecho com barra proporcional ao tempo, **cada voo e cada conexão com duração** e a **duração total**;
- link **"Validar no Google Flights"** em cada opção, já com os voos de ida selecionados.
- **semáforo de preço** em cada opção, com legenda:
  - 🟢 **Abaixo** — no primeiro terço da faixa típica do Google para a rota e as datas, ou abaixo dela;
  - 🟡 **Típico** — dentro da faixa típica;
  - 🔴 **Acima** — acima da faixa típica.
  Sem a faixa do Google, a régua é a opção mais barata da cotação (🟢 até +5%, 🟡 até +15%, 🔴 acima). O JSON de `quote` traz o campo `signal` de cada opção.

```bash
python3 $S search --from GRU --to LIS --nearby --depart 2026-12-10 --return 2026-12-20 --adults 2 --limit 60 > busca.json
python3 $S quote --from-json busca.json --client "Helena Prado" --pdf --format text
```

Custo típico de uma cotação de ida e volta: 1 busca + 4 buscas de volta = **5 créditos SerpApi**.
**Visual: padrão TaxCo** (Handbook APG): Hanken Grotesk, preto/branco/pedra `#F0EDE6`, rótulos em caixa alta espaçada, filete preto sob o destaque, painéis retos e numerais finos. O rótulo do produto é **Argos Core** (`FLIGHTS_BRAND_NAME` ou `--brand`).

O template fica em `skills/flight-search/templates/quote.html`. Com muitos trechos, a impressão reduz levemente a escala para manter tudo em uma página.

## Monitor de preço

```bash
python3 $S watch add --target-price 3000 --drop-percent 10 -- --from GRU --to LIS --depart 2026-12-10 --return 2026-12-20
python3 $S watch list --format text
python3 $S watch check --format text     # "Nenhum alerta (...)" ou linhas "ALERTA ..."
```

Quem dispara o `watch check` periodicamente é o **cron do OpenClaw**. Exemplo (confira as flags com `openclaw cron add --help` na sua versão):

```bash
openclaw cron add \
  --name "Monitor de voos" \
  --cron "0 */6 * * *" --tz America/Sao_Paulo \
  --session isolated \
  --message "Use a skill flight-search: rode 'watch check --format text'. Se houver ALERTA, me envie um resumo curto; se não, não envie nada."
```

**Cota:** cada verificação faz uma busca por monitor. Com 4 checagens/dia e 3 monitores são ~360 buscas/mês — confira o limite do seu plano na SerpApi.

## Esquema JSON (resumo)

```
{ query{...}, count, returned,
  summary{cheapest, median, fastest_minutes, direct_available, currency},
  price_insights{level, typical_range, lowest_price},
  offers[{ id, provider, price{amount,currency}, airlines[],
           slices[{origin, destination, departure, arrival, duration_minutes, stops,
                   segments[{from,to,departure,arrival,carrier,carrier_name,flight_number,aircraft,duration_minutes,amenities[]}]}],
           total_duration_minutes, booking{google_flights_url, departure_token} }],
  by_date[...]   # só com --flex-days
  errors[...]    # falhas parciais com --flex-days
}
```

## Testes

```bash
python3 -m unittest discover -s tests -v   # offline: toda chamada HTTP é simulada
```
