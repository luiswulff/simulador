---
name: hotel-search
description: Pesquisa hotéis no Google Hotels (categoria, preço por noite e total, dentro/fora do orçamento, notas, localização, comodidades, Hotels.com e site oficial) e gera cotação de uma página. Somente busca — não reserva.
homepage: https://github.com/luiswulff/simulador/tree/main/openclaw-flight-search
metadata:
  {
    "openclaw":
      {
        "emoji": "🏨",
        "requires": { "bins": ["python3"] },
        "primaryEnv": "SERPAPI_API_KEY",
      },
  }
---

# Pesquisa de hotéis

Use quando o usuário pedir hotel, hospedagem ou cotação de hotéis.
Script: `python3 {baseDir}/scripts/hotels.py` (biblioteca padrão; chave SerpApi no ambiente, em `{baseDir}/.env` ou no `.env` da skill flight-search).

## Fluxo

1. **Entenda o pedido**: local (cidade, bairro, endereço, evento ou escritório), datas de entrada e saída (ou noites), hóspedes, **orçamento por noite** (política da empresa), categoria mínima e comodidades obrigatórias. Datas relativas → `AAAA-MM-DD`.
2. **Buscar** (1 busca por página de 20 hotéis):
   ```
   python3 {baseDir}/scripts/hotels.py search --where "Avenida Paulista, São Paulo" --check-in 2026-11-16 --check-out 2026-11-18 --budget 600 --min-rating 4 --format text
   ```
   Se houver um endereço de referência (escritório, evento) e você souber as coordenadas, passe `--near=-23.5614,-46.6559` para calcular a distância.
3. **Responder** com 3–5 hotéis: nome, categoria (estrelas), diária e total, 🟢🟡🔴 (dentro/fora do preço), nota e nº de avaliações, localização, comodidades relevantes (café incluso, Wi-Fi, academia, estacionamento) e cancelamento.
4. **Cotação** (quando pedirem uma cotação/proposta ou para enviar a alguém):
   ```
   python3 {baseDir}/scripts/hotels.py search ... --limit 20 > /tmp/hoteis.json
   python3 {baseDir}/scripts/hotels.py quote --from-json /tmp/hoteis.json --client "Nome" --pdf --format text
   ```
   Envie o PDF (ou HTML) e resuma o recomendado e o mais em conta em uma linha cada.

## Opções de `search`

| Opção | Uso |
|---|---|
| `--where` | local ou nome do hotel (obrigatório) |
| `--check-in` / `--check-out` ou `--nights N` | datas `AAAA-MM-DD` (máx. 30 noites) |
| `--adults N`, `--children-ages 5,9` | hóspedes (padrão 1 adulto) |
| `--budget V` | orçamento/política **por noite, com taxas** — define o semáforo (também `HOTELS_BUDGET_PER_NIGHT`) |
| `--max-price V` | exclui hotéis acima de V por noite |
| `--min-stars 2..5`, `--min-rating 3.5/4/4.5` | categoria e nota mínimas |
| `--amenities cafe,wifi,academia,...` | exige comodidades (cafe = café incluso; também estacionamento, piscina, ar, restaurante, reuniao, lavanderia, traslado, pet, acessivel, cozinha) |
| `--free-cancellation` | só com cancelamento grátis |
| `--near lat,lng` | ponto de referência para distância (use `--near=-23.56,-46.65`) |
| `--include-rentals` | inclui aluguéis por temporada (padrão: só hotéis) |
| `--sort best/price/rating/distance` | padrão `best` (nota, localização, preço, avaliações, categoria) |
| `--pages 1..3`, `--limit N` | mais resultados (cada página = 1 busca) |

`details --token <id> --check-in ... --check-out ...` mostra os preços por site (Hotels.com, Booking, oficial…), a faixa típica do hotel, horários, endereço e telefone (1 busca).

## Semáforo de preço (dentro / fora)

1. **Com orçamento** (`--budget`): 🟢 até o orçamento · 🟡 até 10% acima · 🔴 acima (fora da política).
2. **Sem orçamento, na cotação**: faixa típica de preço **do próprio hotel** (Google): 🟢 no terço mais barato ou abaixo · 🟡 dentro · 🔴 acima.
3. **Sem as anteriores**: desconto informado pelo Google ("X% abaixo da média") = 🟢; senão compara com a mediana da categoria na busca (🟢 ≤ −10% · 🟡 até +15% · 🔴 acima).

## Cotação

- Curadoria: **recomendado** + melhores dentro do orçamento + **mais em conta com 3★ ou mais** (evita hostel) + **uma opção superior** (4★+, bem avaliada) mesmo fora da política, sinalizada. Ordem: do menor ao maior preço.
- Para cada hotel, o script consulta o detalhe (1 busca por hotel; `--no-details` desliga): melhor oferta entre os sites, **Hotels.com** e **Booking** (preço quando o Google tem; senão link que abre a busca do hotel com as datas — logado, o usuário vê a tarifa de membro), site oficial e faixa típica.

## Regras

- **Nunca reserve, pague ou faça login em sites de hotel**, e nunca peça ou guarde usuário/senha (inclusive do Hotels.com). Entregue os links; a reserva é do usuário.
- Erros vêm em JSON com `error.code`: `invalid_request` (corrija os parâmetros), `missing_credentials`/`auth_error` (chave SerpApi), `rate_limited`/`network_error` (tente uma vez mais tarde).
- Preços mudam: diga a data da consulta e recomende confirmar no link. `provider: mock` = dados fictícios, nunca para cliente real.
