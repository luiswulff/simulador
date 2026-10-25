# Padrão visual — Argos Core · TaxCo

Guia do visual usado nas cotações de **voos** e **hotéis** do Argos Core (OpenClaw). Serve para manter qualquer novo documento — cotação, relatório, resumo para cliente — com a mesma cara.

- **Base:** identidade TaxCo, extraída do *Handbook APG* (jul/2026): preto, branco e pedra; Hanken Grotesk; rótulos em caixa alta espaçada; painéis retos; numerais finos.
- **Estrutura:** minimalista, inspirada na Apple — uma página, leitura de cima para baixo, resumo antes do detalhe.
- **Referência viva:** `skills/flight-search/templates/quote.html` e `skills/hotel-search/templates/quote.html`. Exemplos prontos em `exemplos/`.

---

## 1. Princípios

1. **Uma página.** Tudo que importa cabe em uma folha A4 e em uma rolagem no celular.
2. **Resumo antes do detalhe.** Rota/local → três números → opções → letras miúdas.
3. **Do mais barato ao mais caro.** Toda lista de opções é ordenada por preço.
4. **Monocromático com um único código de cor:** só o semáforo de preço usa cor. Todo o resto é preto, cinza e pedra.
5. **Estrutura com significado.** Numerais (01, 02…) indicam a posição na lista; selos e cores indicam estado real (mais em conta, recomendado, fora da política). Nada decorativo.
6. **Sem logo.** O cabeçalho usa o nome do produto em texto (**ARGOS CORE**).
7. **Sempre validável.** Cada opção tem link para a fonte (Google Flights, Google Hotels, Hotels.com, Booking, site oficial).

---

## 2. Cores

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#FFFFFF` | Fundo da página |
| `--stone` | `#F0EDE6` | Painéis/cartões (o "pedra" da TaxCo) |
| `--ink` | `#000000` | Texto principal, títulos, filetes fortes, barras de voo, selo sólido |
| `--muted` | `#595959` | Texto secundário, rótulos, metadados |
| `--faint` | `#A5A5A5` | Numerais grandes (01, 02…), contorno de selos neutros |
| `--line` | `#D1CFC9` | Filetes finos, divisórias internas, barras de conexão, estrela apagada |
| `--go` | `#1E8E3E` | Semáforo verde · "cancelamento grátis" |
| `--caution` | `#E5A100` | Semáforo amarelo |
| `--stop` | `#D93025` | Semáforo vermelho |

Regras:
- O documento é **sempre claro** (`color-scheme: light`); não há versão escura.
- Cores semânticas (`--go`, `--caution`, `--stop`) aparecem **só** no semáforo e no aviso de cancelamento grátis.
- Nunca usar gradiente, sombra ou cor de destaque além dessas.

---

## 3. Tipografia

**Fonte única:** [Hanken Grotesk](https://fonts.google.com/specimen/Hanken+Grotesk) (Google Fonts), pesos 200, 400, 500, 600, 700 e itálico 400.

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:ital,wght@0,200;0,400;0,500;0,600;0,700;1,400&display=swap">
```
```css
--font: "Hanken Grotesk", "Helvetica Neue", Arial, sans-serif;
font-variant-numeric: tabular-nums;   /* números alinhados em todo o documento */
```

| Papel | Tamanho (tela) | Peso | Detalhes |
|---|---|---|---|
| Título (rota/local) | 30–32px | 700 | `letter-spacing: -.015em`; seta "→" em peso 200 |
| Número de resumo | 21px | 700 | `letter-spacing: -.01em` |
| Preço da opção | 18–19px | 700 | |
| Nome (cia/hotel) | 15px | 600–700 | |
| Corpo | 13px | 400 | `line-height: 1.5` |
| Detalhe | 11–12px | 400 | cor `--muted` |
| **Rótulo** | 9.5px | 600–700 | **CAIXA ALTA**, `letter-spacing: .24em` |
| Selo / semáforo | 8.5px | 700 | caixa alta, `letter-spacing: .16–.18em` |
| Numeral de posição | 30px | **200** | cor `--faint`, formato `01`, `02` |
| Nota de rodapé | 10.5px | 400 | `line-height: 1.55` |
| Cliente ("Para …") | 13px | 400 itálico | |

---

## 4. Layout

- Largura máxima **820px**, centralizada. Espaço entre blocos: **20px**.
- Margem lateral mínima de **16px** com safe-area:
  `padding-left: max(16px, env(safe-area-inset-left, 0px))` (idem à direita).
- Sem cantos arredondados (exceto o círculo do semáforo). Sem sombras.
- Grids com `minmax(0, 1fr)` em colunas com texto, para nunca estourar a largura.

Ordem fixa da página:

```
┌──────────────────────────────────────────────────────────┐
│ ARGOS CORE                              COTAÇÃO DE VOOS  │  ← barra superior (rótulos)
│ IDA E VOLTA                                              │  ← rótulo de contexto
│ São Paulo → Lisboa                                       │  ← título
│ GRU → LIS · qui, 10 dez – dom, 20 dez 2026 · 2 adultos   │  ← metadados
│ Para Helena Prado                                        │  ← cliente (itálico, opcional)
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│  ← filete preto 1.5px
│ A PARTIR DE       MAIS RÁPIDA       FAIXA TÍPICA         │  ← 3 números-resumo
│ R$ 12.085         19h50             R$ 8.300–13.500      │
│ OPÇÕES · DO MENOR AO MAIOR PREÇO    ● ● ● legenda        │
│ ┌────────────────────────────────────────────────────┐   │
│ │ 01 ● TÍPICO  R$ 12.085,00 …           Link ↗       │   │  ← cartões em pedra
│ └────────────────────────────────────────────────────┘   │
│ Notas de rodapé (fonte, data da consulta, avisos)        │
│──────────────────────────────────────────────────────────│  ← filete fino
│ ARGOS CORE                COTAÇÃO AC-… · VÁLIDA ATÉ …    │  ← rodapé
└──────────────────────────────────────────────────────────┘
```

---

## 5. Componentes

### Barra superior e rodapé
Dois rótulos nas pontas. À esquerda **ARGOS CORE** (`--ink`, 700); à direita o tipo de documento ou referência/validade (`--muted`, 600). O rodapé tem filete fino `--line` acima.

### Hero
Rótulo de contexto (ex.: `IDA E VOLTA`, `HOSPEDAGEM`) → título → metadados em `--muted` separados por " · " → cliente em itálico. Fecha com **filete preto de 1.5px** — a assinatura visual do padrão.

### Números-resumo (stats)
Grade `repeat(auto-fit, minmax(180px, 1fr))`, sem fundo. Cada um: rótulo (`--muted`) → número (21px/700) → linha de apoio (11px, `--muted`). Exemplos: "A partir de", "Mais rápida", "Faixa típica · Google", "Dentro do orçamento".

### Cabeçalho da lista + legenda
Rótulo "OPÇÕES · DO MENOR AO MAIOR PREÇO" à esquerda; à direita a legenda do semáforo (três bolinhas com rótulo curto) e a régua usada (ex.: "FAIXA TÍPICA GOOGLE R$ 8.300–13.500", "ORÇAMENTO R$ 600/NOITE").

### Cartão de opção
- Fundo `--stone`, padding `12px 18px`, sem borda/raio/sombra; 8px entre cartões.
- **Cabeçalho do cartão** (uma linha, filete `--line` embaixo):
  `01` numeral fino → semáforo → preço (+ "por pessoa"/"por noite") → nome + selos → link à direita.
- **Corpo:**
  - *Voos:* uma linha por trecho (Ida/Volta) — coluna de data (78px) · horários + barra + trechos · duração total (80px).
  - *Hotéis:* duas colunas — nota/localização/fatos | comodidades + links.

### Semáforo de preço
Bolinha de 11px + rótulo curto em caixa alta (`TÍPICO`, `ACIMA`, `DENTRO`, `FORA`). O rótulo garante leitura em preto e branco; o texto completo vai no `title`.

| Cor | Voos (faixa típica Google) | Hotéis com orçamento | Hotéis sem orçamento |
|---|---|---|---|
| 🟢 `--go` | abaixo da faixa ou no 1º terço | até o orçamento | 1º terço da faixa típica do hotel / desconto Google |
| 🟡 `--caution` | dentro da faixa | até +10% | dentro da faixa típica |
| 🔴 `--stop` | acima da faixa | acima de +10% (fora da política) | acima da faixa típica |

Sem faixa do Google, a régua é relativa: voos à opção mais barata (+5% / +15%); hotéis à mediana da categoria (−10% / +15%).

### Selos (tags)
Caixa reta, 8.5px, caixa alta, `padding: 3px 7px 2px`.
- **Sólido** (fundo `--ink`, texto branco): `MAIS EM CONTA` — no máximo um por documento.
- **Contorno preto:** `RECOMENDADO(A)`.
- **Contorno cinza** (`--faint`/`--muted`): `MAIS RÁPIDA`, `MELHOR AVALIADO`, `FORA DA POLÍTICA`.

### Numeral de posição
`01`, `02`… em 30px, peso 200, `--faint`. Indica a ordem por preço.

### Links
Texto `--ink`, peso 600, sublinhado fino (`text-underline-offset: 3px`, espessura 1px), sempre com "↗". Rótulos curtos: `Google Flights ↗`, `Hotels.com R$ 898 ↗`, `Booking ↗`, `Oficial R$ 504 ↗`, `Melhor: Vio.com R$ 661 ↗`. Foco visível: `outline: 2px solid var(--ink)`.

### Barra de trecho (voos)
Faixa de 4px dividida proporcionalmente ao tempo: **voo em `--ink`**, **conexão em `--line`**, 3px entre partes. Acima: horários nas pontas (hora em 14px/700, aeroporto em `--muted`, `+1` sobrescrito). Abaixo, por extenso: `LH507 GRU 18:45 → FRA 10:15 · 11h30` e *Conexão em Frankfurt **2h25*** (itálico com duração em negrito).

### Estrelas (hotéis)
`★★★★` em `--ink` + estrelas restantes em `--line`. Sem categoria: rótulo `SEM CATEGORIA`.

### Comodidades (hotéis)
Etiquetas pequenas (10.5px) com fundo branco sobre o cartão pedra; até 5 por hotel, em ordem de relevância corporativa: café incluso, Wi-Fi, academia, estacionamento, salas de reunião, ar, piscina.

---

## 6. Escrita e formatos (pt-BR)

| Item | Formato | Exemplo |
|---|---|---|
| Moeda | símbolo + milhar com ponto + centavos com vírgula | `R$ 12.085,00` (resumos sem centavos: `R$ 12.085`) |
| Faixa de preço | traço curto, sem repetir símbolo | `R$ 8.300–13.500` |
| Data | dia da semana abreviado + dia + mês | `qui, 10 dez` · com ano no hero: `qui, 10 dez – dom, 20 dez 2026` |
| Hora | 24h, **local do aeroporto/hotel** | `23:30`, `12:10+1` |
| Duração | horas + minutos com dois dígitos | `9h40`, `17h05`, `2h25` |
| Distância | km com vírgula | `0,5 km do ponto de referência` |
| Nota | uma casa, vírgula | `Nota 4,3 · 2.673 avaliações` |
| Separador | ponto médio com espaços | ` · ` |

Tom: direto, factual, sem adjetivos de venda. Sempre informar a **fonte e a data da consulta** e que preços mudam sem aviso. Nunca apresentar dados fictícios (`provider: mock`) como reais — o hero passa a dizer "Amostra com dados fictícios".

---

## 7. Responsivo (celular)

Abaixo de 620px:
- título cai para 25–26px;
- cabeçalho do cartão quebra: nome e preço ocupam linha própria;
- colunas de trecho viram: data + duração na mesma linha, trajeto embaixo;
- colunas de hotel viram uma só;
- legenda alinha à esquerda.

Critério de aceite: **nenhuma rolagem horizontal a 390px**.

---

## 8. Impressão / PDF (A4, uma página)

```css
@media print {
  @page { size: A4; margin: 9mm 10mm; }
  body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page, .cards { display: block; }          /* o Chrome pagina mal grids */
  .page { zoom: var(--print-zoom, 1); }      /* escala calculada pelo script */
  .card { break-inside: avoid; }
}
```

- Fontes, espaçamentos e selos ficam um pouco menores na impressão (ver templates).
- A escala (`--print-zoom`) é calculada pelo script: voos pela quantidade de trechos (acima de ~22 linhas), hotéis pelo número de opções (5 → 0,92; 6 → 0,82).
- PDF gerado com Chrome/Chromium headless e `--virtual-time-budget=8000`, para as fontes carregarem antes de imprimir.
- Critério de aceite: **1 página A4** e fontes Hanken Grotesk embutidas no PDF.

---

## 9. Acessibilidade

- Cor nunca é o único sinal: semáforo sempre com rótulo; selos com texto.
- Contraste: texto principal preto sobre branco/pedra; secundário `#595959` (7:1 sobre branco; 6:1 sobre o pedra `#F0EDE6`).
- Links com foco visível; `title` nos rótulos curtos (semáforo, links abreviados).
- Barras e gráficos com `aria-label`/`role="img"` quando carregam informação.

---

## 10. Não fazer

- Logo, ícones decorativos, emojis no documento (emojis só na saída de texto do agente).
- Cantos arredondados, sombras, gradientes, fundos escuros.
- Cores fora da tabela; cor de destaque fora do semáforo.
- Mais de um selo sólido por documento.
- Texto cortado no meio da palavra (encurtar com reticências no fim de palavra).
- Segunda página na impressão.

---

## 11. Ponto de partida (CSS)

```css
:root {
  --bg: #FFFFFF; --stone: #F0EDE6; --ink: #000000; --muted: #595959;
  --faint: #A5A5A5; --line: #D1CFC9;
  --go: #1E8E3E; --caution: #E5A100; --stop: #D93025;
  --font: "Hanken Grotesk", "Helvetica Neue", Arial, sans-serif;
  color-scheme: light;
}
body  { margin: 0; background: var(--bg); color: var(--ink); font: 400 13px/1.5 var(--font);
        font-variant-numeric: tabular-nums; padding-block: 32px 40px;
        padding-left: max(16px, env(safe-area-inset-left, 0px));
        padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.page { max-width: 820px; margin: 0 auto; display: grid; gap: 20px; }
.label { font-size: 9.5px; font-weight: 700; letter-spacing: .24em; text-transform: uppercase; }
.hero { display: grid; gap: 6px; padding-bottom: 16px; border-bottom: 1.5px solid var(--ink); }
.hero h1 { margin: 0; font-size: 32px; line-height: 1.1; font-weight: 700; letter-spacing: -.015em; }
.card { background: var(--stone); padding: 12px 18px; display: grid; gap: 4px; }
.rank { font-size: 30px; line-height: .9; font-weight: 200; color: var(--faint); }
.tag  { font-size: 8.5px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase;
        padding: 3px 7px 2px; border: 1px solid var(--ink); }
.tag.accent { background: var(--ink); color: var(--bg); }
.signal i { width: 11px; height: 11px; border-radius: 50%; display: block; }
.signal.green i { background: var(--go); } .signal.yellow i { background: var(--caution); }
.signal.red i { background: var(--stop); }
```
