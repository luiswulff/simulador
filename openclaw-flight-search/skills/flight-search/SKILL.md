---
name: flight-search
description: Pesquisa voos no Google Flights (preços, horários, escalas, avaliação do preço) em datas fixas ou flexíveis e monitora preços com alertas. Somente busca — não reserva nem compra.
homepage: https://github.com/luiswulff/simulador/tree/main/openclaw-flight-search
metadata:
  {
    "openclaw":
      {
        "emoji": "✈️",
        "requires": { "bins": ["python3"] },
        "primaryEnv": "SERPAPI_API_KEY",
      },
  }
---

# Pesquisa de voos

Use esta skill quando o usuário quiser saber preços, horários ou opções de voo, ou acompanhar um preço.
Script: `python3 {baseDir}/scripts/flights.py` (somente biblioteca padrão; a chave da SerpApi vem do ambiente ou de `{baseDir}/.env`).

## Fluxo

1. **Códigos IATA.** Se o usuário falou cidade/aeroporto por nome, descubra o código:
   `python3 {baseDir}/scripts/flights.py airports "florianópolis" --format text`
   Cidades com vários aeroportos (São Paulo: GRU/CGH/VCP; Rio: GIG/SDU; BH: CNF/PLU) — pergunte ou busque nos principais. Se o aeroporto não estiver na lista, use o código IATA que você conhece.
2. **Datas.** Converta datas relativas ("sexta que vem") para `AAAA-MM-DD` usando a data atual. Se o usuário for flexível, use `--flex-days 1..3`.
3. **Buscar.** Prefira `--format text` (compacto, poupa tokens). Use JSON quando precisar de detalhes (aeronave, comodidades, link).
   ```
   python3 {baseDir}/scripts/flights.py search --from GRU --to LIS --depart 2026-11-10 --return 2026-11-20 --adults 2 --format text
   ```
   Para achar opções mais baratas por outros aeroportos da cidade, use `--nearby` (ex.: GRU → GRU, CGH, VCP) ou liste-os: `--from GRU,VCP --to LIS,OPO`.
4. **Responder.** Apresente as 3–5 melhores opções: preço total, cia, horários (locais), duração e escalas, e o trade-off (mais barato × mais rápido × direto). Se aparecer "Avaliação do Google", diga se o preço está baixo/típico/alto e a faixa típica — isso ajuda a decidir entre comprar agora ou criar um monitor. Lembre que preços mudam a qualquer momento.
5. **Comprar** é com o usuário: indique a companhia e o link `booking.google_flights_url` (saída JSON).

## Opções de `search`

| Opção | Uso |
|---|---|
| `--from` / `--to` | IATA (obrigatório); aceita lista `GRU,VCP` |
| `--nearby` | inclui aeroportos da mesma cidade |
| `--depart` / `--return` | `AAAA-MM-DD`; sem `--return` = só ida |
| `--adults N`, `--children-ages 5,9`, `--infants N` | passageiros (máx. 9; bebês ≤ adultos) |
| `--cabin` | `economy` (padrão), `premium_economy`, `business`, `first` |
| `--max-stops 0/1/2` | 0 = só voos diretos |
| `--max-price`, `--max-duration H` | limites de preço total e horas por trecho |
| `--airlines LA,G3` / `--exclude-airlines AD` | nomes ou códigos IATA (LA = LATAM, G3 = GOL, AD = Azul) |
| `--depart-after 08:00` / `--depart-before 14:00` | janela de partida da ida (hora local) |
| `--flex-days N` | também ±N dias (máx. 3); mostra o menor preço por dia |
| `--sort` | `price` (padrão), `duration`, `departure`, `stops`, `best` (preço × tempo) |
| `--limit N` | padrão 10 |
| `--currency` | padrão `BRL` |

## Cotação (uma página)

Quando o usuário pedir uma **cotação**, faça a busca incluindo aeroportos próximos (`--nearby`) para achar rotas e conexões mais baratas, e gere o documento a partir dela:

```
python3 {baseDir}/scripts/flights.py search --from GRU --to LIS --nearby --depart 2026-12-10 --return 2026-12-20 --adults 2 --limit 60 > /tmp/busca.json
python3 {baseDir}/scripts/flights.py quote --from-json /tmp/busca.json --client "Nome do cliente" --pdf --format text
```

O que a cotação traz, sempre:
- **Opção principal** (melhor equilíbrio preço × tempo) **+ 2 ou 3 alternativas com conexão**, as mais baratas encontradas (`--extra 2|3`, padrão 3).
- Tudo **do mais barato ao mais caro**, com selos "Mais em conta", "Recomendada" e "Mais rápida".
- **Ida e volta completas**: em ida e volta, o script busca os voos de volta de cada opção (1 busca extra por opção; `--no-return` desliga) e o preço passa a ser o da viagem montada.
- Para cada trecho: horários, número de cada voo, **duração de cada voo, de cada conexão (com a cidade) e duração total**; avisa troca de aeroporto e pernoite.
- **Link "Validar no Google Flights"** em cada opção, já com os voos de ida selecionados.
- **Semáforo de preço** em cada opção: 🟢 abaixo do típico (até o primeiro terço da faixa típica do Google, ou abaixo dela), 🟡 dentro da faixa típica, 🔴 acima da faixa. Sem faixa do Google, compara com a opção mais barata (🟢 até +5%, 🟡 até +15%, 🔴 acima). Na mensagem ao usuário, cite a cor da opção recomendada.

A saída `--format text` lista as opções, durações, conexões e links; o `pdf_path` é o arquivo para enviar. Envie o PDF (ou o HTML, se não houver navegador para gerar PDF) e, na mensagem, resuma a opção 1 e a recomendada em uma linha cada. Nunca gere cotação com `provider: mock` para um cliente real.

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
- `watch check` é para o **job agendado**: se a saída começar com "Nenhum alerta", não envie nada ao usuário. Se houver `ALERTA`, envie um resumo curto com preço, opções e o `id` do monitor.
- Monitores com data de ida no passado viram `expired` sozinhos.

## Regras

- **Nunca compre, reserve ou preencha dados de pagamento/passageiros**, nem pelo navegador. Entregue as opções e o link ao usuário.
- Saída com `"error"` (exit ≠ 0): leia `error.code`.
  `invalid_request` → corrija os parâmetros; `missing_credentials`/`auth_error` → avise que a chave da SerpApi não está configurada ou é inválida; `rate_limited`/`network_error` → tente de novo uma vez mais tarde.
- Cada busca consome cota da SerpApi. `--flex-days N` faz 2N+1 buscas — use só com flexibilidade real. Resultados ficam em cache por 15 min (`--no-cache` só se o usuário pedir preço "agora").
- Em ida e volta, o preço é o total da viagem, mas só os voos de ida são detalhados; os horários da volta são escolhidos no link do Google Flights.
- `provider: mock` = **dados fictícios**; nunca apresente como preços reais.
