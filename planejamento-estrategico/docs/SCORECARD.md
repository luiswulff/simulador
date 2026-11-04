# Scorecard 2026–2030 — do quadro da diretoria para o app

Fonte: quadro manuscrito da diretoria (ano-base 2026) + definições da liderança.
Estrutura e valores em `src/data/scorecard-2026.json` (fonte única para o modo demo e para
`supabase/carga-scorecard-2026.sql`, que carrega o scorecard no banco de produção).

## Ano-base 2026 (do quadro)

| Bloco | Indicador | 2026 |
|---|---|---:|
| Resultado financeiro | Receita global | R$ 175 mi |
| | Receita TaxCo | R$ 130 mi |
| | ROL — Retorno Operacional Líquido | R$ 45 mi |
| | Lucro líquido | R$ 15 mi |
| Novas unidades | Novas unidades | 200 |
| | Contratos por unidade | 1,3 |
| | Ticket médio | a definir |
| Carteira existente (GCC) | Base GCC | 150 |
| | Contratos por cliente | 1,3 |
| | Ticket médio | a definir |
| Produtividade | Receita / headcount, ROL / headcount | a definir |
| Áreas 1, 2, 3 | Nº de contratos e R$ por ano | a definir |

Metas 2027–2030: **em branco**, a definir pela sociedade.

## Indicadores calculados (fórmula no app)

| Indicador | Fórmula | 2026 |
|---|---|---:|
| Margem ROL | `rol / receita_global * 100` | 25,7% |
| Margem líquida | `ll / receita_global * 100` | 8,6% |
| Ponte ROL → LL (a reconciliar) | `rol - ll` | R$ 30 mi |
| Receita das demais empresas | `receita_global - receita_taxco` | R$ 45 mi |
| Contratos das novas unidades | `novas_unidades * contratos_por_unidade` | 260 |
| Contratos na carteira GCC | `gcc_base * contratos_por_cliente` | 195 |
| Receita contratada (novas / GCC) | `contratos * ticket / 1000` | depende do ticket |
| Receita / ROL por headcount | `… * 1000 / headcount` | depende do headcount |

Quando uma meta ou medição de origem é lançada, os calculados se atualizam sozinhos,
inclusive as metas: definir a receita 2030 e o ROL 2030 já mostra a margem ROL 2030.

## Definições que importam

- **ROL = Retorno Operacional Líquido**: resultado operacional *antes do pró-labore dos sócios*.
  É indicador de resultado, **não** de receita. O fato de 175 − 130 também dar 45 é só coincidência numérica.
- **Ponte ROL → LL**: os R$ 30 mi de 2026 precisam ser abertos por natureza (pró-labore,
  resultado financeiro, tributos, outros). Pró-labore ≠ distribuição de lucros.
- **Contrato ≠ receita**: contratos e tickets geram *receita contratada*; a receita do ano
  depende do prazo de execução de cada contrato.
- **Receita do ano** = base retida (já líquida de churn) + expansão da base (GCC: cross-sell,
  upsell, reajuste) + clientes novos (novas unidades, venda direta) + aquisições.
  É o desenho natural dos objetivos do pilar *Crescimento*.

## Pendências de validação (aparecem como "validar" no app)

1. Perímetro da receita global (quais empresas) e da receita TaxCo.
2. Fórmula formal do ROL com a controladoria.
3. Abertura dos R$ 30 mi entre ROL e LL.
4. As 200 novas unidades são contratadas, inauguradas ou produtivas?
5. 1,3 contrato por unidade: por mês ou por ano? Qual o critério de contagem?
6. Os 150 da GCC são clientes, carteiras ou gestores? O 1,3 é por cliente ou por carteira?
7. Ticket médio: contratado ou reconhecido; recorrente, projeto ou êxito.
8. Headcount médio do ano (não o de fechamento).
9. Nomes das Áreas 1, 2 e 3 e seus responsáveis.

Ao validar, edite o indicador e limpe o campo *Pendência de validação*.

## O que ficou de fora do documento do ChatGPT (de propósito)

- A projeção de 30% a.a. até ~R$ 500 mi virou **simulador de sensibilidade** na tela da
  Ambição, não meta. Metas são decisão da sociedade.
- Scorecard com mais de 25 indicadores em seis blocos: começar com o quadro da diretoria e
  acrescentar caixa, retenção/churn, recorrência e CAC quando houver dado confiável.
- Cronograma e governança genéricos: o ritual de gestão já está em `ARQUITETURA.md` §8.
