---
name: flight-search
description: Pesquisa voos (preços, horários, escalas, bagagem) entre aeroportos em datas específicas ou flexíveis. Somente busca — não reserva nem compra.
homepage: https://github.com/luiswulff/simulador/tree/main/openclaw-flight-search
metadata:
  {
    "openclaw":
      {
        "emoji": "✈️",
        "requires": { "bins": ["python3"] },
        "primaryEnv": "DUFFEL_ACCESS_TOKEN",
      },
  }
---

# Pesquisa de voos

Use esta skill quando o usuário quiser saber preços, horários ou opções de voo.
Script: `python3 {baseDir}/scripts/flights.py` (somente biblioteca padrão, sem instalação).

## Fluxo

1. **Códigos IATA.** Se o usuário falou cidade/aeroporto por nome, descubra o código:
   `python3 {baseDir}/scripts/flights.py airports "florianópolis" --format text`
   Cidades com vários aeroportos (São Paulo: GRU/CGH/VCP; Rio: GIG/SDU) — pergunte ou busque nos principais.
2. **Datas.** Converta datas relativas ("sexta que vem") para `AAAA-MM-DD` usando a data atual. Se o usuário for flexível, use `--flex-days 1..3`.
3. **Buscar.** Prefira `--format text` (compacto, poupa tokens). Use JSON quando precisar de campos detalhados.
   ```
   python3 {baseDir}/scripts/flights.py search --from GRU --to LIS --depart 2026-11-10 --return 2026-11-20 --adults 2 --format text
   ```
4. **Responder.** Apresente as 3–5 melhores opções: preço total, cia, horários (locais), duração, escalas, bagagem, e o trade-off (mais barato × mais rápido × direto). Diga o provedor e que preços mudam a qualquer momento.

## Opções de `search`

| Opção | Uso |
|---|---|
| `--from` / `--to` | IATA (obrigatório) |
| `--depart` / `--return` | `AAAA-MM-DD`; sem `--return` = só ida |
| `--adults N`, `--children-ages 5,9`, `--infants N` | passageiros (máx. 9; bebês ≤ adultos) |
| `--cabin` | `economy` (padrão), `premium_economy`, `business`, `first` |
| `--max-stops 0/1/2` | 0 = só voos diretos |
| `--max-price`, `--max-duration H` | limites de preço total e horas por trecho |
| `--airlines LA,G3` / `--exclude-airlines AD` | nomes ou códigos IATA |
| `--depart-after 08:00` / `--depart-before 14:00` | janela de partida da ida (hora local) |
| `--refundable` | só tarifas reembolsáveis (quando o provedor informa) |
| `--flex-days N` | também ±N dias (máx. 3); devolve `by_date` com o menor preço por dia |
| `--sort` | `price` (padrão), `duration`, `departure`, `stops`, `best` (preço × tempo) |
| `--limit N` | padrão 10 |
| `--provider` | `duffel`, `serpapi` ou `mock` |

## Regras

- **Nunca reserve, compre ou insira dados de pagamento/passageiros.** Para reservar, entregue as opções ao usuário (o campo `booking` traz `offer_id` da Duffel ou link do Google Flights).
- Saída com `"error"` (exit ≠ 0): leia `error.code`.
  `invalid_request` → corrija os parâmetros; `missing_credentials`/`auth_error` → avise que a chave não está configurada; `rate_limited`/`network_error` → tente de novo uma vez mais tarde.
- `--flex-days` faz uma chamada por dia — use só quando houver flexibilidade real (o SerpApi cobra por busca).
- Resultados ficam em cache por 15 min; use `--no-cache` só se o usuário pedir preço "agora".
- `provider: mock` = **dados fictícios**; nunca apresente como preços reais.
- No SerpApi, preço de ida e volta vem completo, mas só os voos de ida são detalhados.
