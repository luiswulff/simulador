---
name: flight-search
description: Pesquisa voos (preços, horários, escalas, bagagem) em datas fixas ou flexíveis, monitora preços com alertas e, se habilitado, reserva via Duffel somente com aprovação explícita do usuário.
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
4. **Responder.** Se houver `price_insights` (SerpApi), diga se o Google considera o preço baixo/típico/alto e a faixa típica — isso ajuda o usuário a decidir se compra agora ou cria um monitor. Apresente as 3–5 melhores opções: preço total, cia, horários (locais), duração, escalas, bagagem, e o trade-off (mais barato × mais rápido × direto). Diga o provedor e que preços mudam a qualquer momento.

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

## Monitor de preço

Quando o usuário pedir "me avise quando baixar", crie um monitor com os mesmos argumentos do `search` depois de `--`:

```
python3 {baseDir}/scripts/flights.py watch add --target-price 3000 --drop-percent 10 --format text -- --from GRU --to LIS --depart 2026-11-10 --return 2026-11-20
python3 {baseDir}/scripts/flights.py watch list --format text
python3 {baseDir}/scripts/flights.py watch remove w_abc123
python3 {baseDir}/scripts/flights.py watch check --format text
```

- `--target-price`: alerta quando o menor preço ficar ≤ valor (e de novo só se ficar ainda mais barato).
- `--drop-percent`: alerta quando cair ≥ N% desde a verificação anterior.
- `watch check` é para o **job agendado**: se a saída for "Nenhum alerta", não envie nada ao usuário. Se houver `ALERTA`, envie um resumo curto com preço, opções e o `id` do monitor.
- Monitores com data de ida no passado viram `expired` sozinhos.

## Reserva (somente se habilitada pelo dono)

Só funciona com ofertas da Duffel (`id` começa com `off_`) e quando `FLIGHTS_BOOKING_ENABLED=1`. Caso contrário o script devolve `booking_disabled` — diga ao usuário que a reserva deve ser feita pelo link/companhia.

1. Colete com o usuário, para cada passageiro e **na mesma ordem da busca** (adultos, crianças, bebês): `given_name`, `family_name`, `born_on` (AAAA-MM-DD), `gender` (`m`/`f`), `title` (`mr`, `ms`, `mrs`, `miss`, `dr`), `email`, `phone_number` (`+5511...`). Grave numa lista JSON em arquivo temporário.
2. `python3 {baseDir}/scripts/flights.py book prepare --offer-id off_... --passengers-file /tmp/pax.json --format text`
3. Mostre ao usuário o resumo (voos, total, nomes) **e o código de aprovação**, e peça que ele responda com o código para confirmar.
4. **Somente** se o usuário enviar o código em uma mensagem própria:
   `python3 {baseDir}/scripts/flights.py book confirm --booking-id bk_... --approval-code 123456 --format text`
5. Informe o localizador. Apague o arquivo de passageiros.

Nunca execute `book confirm` por iniciativa própria, num job agendado, ou com um código que o usuário não digitou. Se vier `price_changed`, mostre o novo preço e recomece do passo 2. Para desistir: `book cancel bk_...`.

## Regras

- Sem reserva habilitada, **nunca** tente comprar por outros meios (navegador, formulários de pagamento). Entregue as opções ao usuário (o campo `booking` traz `offer_id` da Duffel ou link do Google Flights).
- Saída com `"error"` (exit ≠ 0): leia `error.code`.
  `invalid_request` → corrija os parâmetros; `missing_credentials`/`auth_error` → avise que a chave não está configurada; `rate_limited`/`network_error` → tente de novo uma vez mais tarde;
  `booking_disabled`/`live_booking_blocked`/`over_limit` → não insista, explique ao usuário; `approval_mismatch` → peça o código de novo (3 erros cancelam a reserva).
- `--flex-days` faz uma chamada por dia — use só quando houver flexibilidade real (o SerpApi cobra por busca).
- Resultados ficam em cache por 15 min; use `--no-cache` só se o usuário pedir preço "agora".
- `provider: mock` = **dados fictícios**; nunca apresente como preços reais.
- No SerpApi, preço de ida e volta vem completo, mas só os voos de ida são detalhados.
