-- ============================================================================
-- CARGA DO SCORECARD 2026–2030 (quadro da diretoria) — gerado por gerar-carga-scorecard.py
-- Rode DEPOIS do schema.sql. Idempotente: atualiza definições pelo código e
-- NUNCA apaga metas ou medições já lançadas. Cria o ciclo 2027–2030 se não existir.
-- ============================================================================
insert into pe_ciclos (nome, ano_inicio, ano_fim, status)
select 'Planejamento Estratégico 2027–2030', 2027, 2030, 'ativo'
where not exists (select 1 from pe_ciclos where ano_inicio = 2027 and ano_fim = 2030);

with ciclo as (select id from pe_ciclos where ano_inicio = 2027 and ano_fim = 2030 limit 1),
dados (codigo, grupo, nome, unidade, linha_base, formula, descricao, pendencia, polaridade, ordem) as (values
  ('receita_global', 'Resultado financeiro', 'Receita global', 'R$ mi', 175, null, 'Receita externa reconhecida de todas as empresas/marcas do ecossistema, líquida de intercompany.', 'Confirmar perímetro (quais empresas entram) e unidade formal (R$ milhões).', 'maior', 0),
  ('receita_taxco', 'Resultado financeiro', 'Receita TaxCo', 'R$ mi', 130, null, 'Receita do perímetro TaxCo dentro da receita global.', 'Confirmar quais empresas, serviços e práticas compõem os R$ 130 mi.', 'maior', 1),
  ('receita_demais', 'Resultado financeiro', 'Receita das demais empresas/marcas', 'R$ mi', null, 'receita_global - receita_taxco', 'Diferença entre receita global e receita TaxCo. Não confundir com o ROL (a coincidência de R$ 45 mi em 2026 é só numérica).', null, 'maior', 2),
  ('rol', 'Resultado financeiro', 'ROL — Retorno Operacional Líquido', 'R$ mi', 45, null, 'Resultado operacional líquido ANTES do pró-labore dos sócios. Indicador de resultado, não de receita.', 'Formalizar a fórmula com a controladoria (quais custos/despesas já estão descontados).', 'maior', 3),
  ('margem_rol', 'Resultado financeiro', 'Margem ROL', '%', null, 'rol / receita_global * 100', null, null, 'maior', 4),
  ('ll', 'Resultado financeiro', 'Lucro líquido', 'R$ mi', 15, null, null, null, 'maior', 5),
  ('margem_liquida', 'Resultado financeiro', 'Margem líquida', '%', null, 'll / receita_global * 100', null, null, 'maior', 6),
  ('ponte_rol_ll', 'Resultado financeiro', 'Ponte ROL → LL (a reconciliar)', 'R$ mi', null, 'rol - ll', 'O que separa o ROL do lucro líquido: pró-labore dos sócios, resultado financeiro, tributos e outros ajustes.', 'Abrir os R$ 30 mi de 2026 por natureza. Não presumir que seja tudo pró-labore; pró-labore ≠ distribuição de lucros.', 'menor', 7),
  ('novas_unidades', 'Novas unidades', 'Novas unidades', 'unidades', 200, null, null, 'São unidades contratadas, inauguradas ou produtivas no ano?', 'maior', 8),
  ('contratos_por_unidade', 'Novas unidades', 'Contratos por unidade', 'contratos/unid.', 1.3, null, null, 'Média por mês ou por ano? Qual o critério de contagem?', 'maior', 9),
  ('contratos_novas_unidades', 'Novas unidades', 'Contratos gerados pelas novas unidades', 'contratos', null, 'novas_unidades * contratos_por_unidade', null, null, 'maior', 10),
  ('ticket_novas', 'Novas unidades', 'Ticket médio (novas unidades)', 'R$ mil', null, null, null, 'Definir: valor contratado ou reconhecido? Recorrente, projeto ou êxito?', 'maior', 11),
  ('receita_novas_unidades', 'Novas unidades', 'Receita contratada das novas unidades', 'R$ mi', null, 'contratos_novas_unidades * ticket_novas / 1000', 'Valor contratado — não é receita reconhecida no ano (depende do prazo de execução do contrato).', null, 'maior', 12),
  ('gcc_base', 'Carteira existente (GCC)', 'Base GCC (carteira existente)', 'clientes', 150, null, null, 'Os 150 são clientes, carteiras ou gestores?', 'maior', 13),
  ('contratos_por_cliente', 'Carteira existente (GCC)', 'Contratos por cliente', 'contratos/cliente', 1.3, null, null, 'Denominador (cliente ou carteira) e período (mês ou ano).', 'maior', 14),
  ('contratos_gcc', 'Carteira existente (GCC)', 'Contratos na carteira GCC', 'contratos', null, 'gcc_base * contratos_por_cliente', null, null, 'maior', 15),
  ('ticket_gcc', 'Carteira existente (GCC)', 'Ticket médio (GCC)', 'R$ mil', null, null, null, null, 'maior', 16),
  ('receita_gcc', 'Carteira existente (GCC)', 'Receita contratada da carteira GCC', 'R$ mi', null, 'contratos_gcc * ticket_gcc / 1000', null, null, 'maior', 17),
  ('headcount', 'Produtividade', 'Headcount médio', 'pessoas', null, null, 'Média do ano (não o número de fechamento).', null, 'maior', 18),
  ('receita_por_hc', 'Produtividade', 'Receita por headcount', 'R$ mil', null, 'receita_global * 1000 / headcount', null, null, 'maior', 19),
  ('rol_por_hc', 'Produtividade', 'ROL por headcount', 'R$ mil', null, 'rol * 1000 / headcount', null, null, 'maior', 20),
  ('area1_contratos', 'Áreas', 'Área 1 — nº de contratos', 'contratos', null, null, null, 'Nomear a área.', 'maior', 21),
  ('area1_receita', 'Áreas', 'Área 1 — receita', 'R$ mi', null, null, null, 'Nomear a área.', 'maior', 22),
  ('area2_contratos', 'Áreas', 'Área 2 — nº de contratos', 'contratos', null, null, null, 'Nomear a área.', 'maior', 23),
  ('area2_receita', 'Áreas', 'Área 2 — receita', 'R$ mi', null, null, null, 'Nomear a área.', 'maior', 24),
  ('area3_contratos', 'Áreas', 'Área 3 — nº de contratos', 'contratos', null, null, null, 'Nomear a área.', 'maior', 25),
  ('area3_receita', 'Áreas', 'Área 3 — receita', 'R$ mi', null, null, null, 'Nomear a área.', 'maior', 26)
)
insert into pe_indicadores (ciclo_id, escopo, frequencia, codigo, grupo, nome, unidade, linha_base, formula, descricao, pendencia, polaridade, ordem)
select ciclo.id, 'ambicao', 'anual', d.codigo, d.grupo, d.nome, d.unidade, d.linha_base::numeric, d.formula, d.descricao, d.pendencia, d.polaridade, d.ordem
from dados d cross join ciclo
on conflict (ciclo_id, codigo) where codigo is not null do update set
  grupo = excluded.grupo, nome = excluded.nome, unidade = excluded.unidade,
  linha_base = coalesce(pe_indicadores.linha_base, excluded.linha_base),
  formula = excluded.formula, descricao = coalesce(pe_indicadores.descricao, excluded.descricao),
  ordem = excluded.ordem;
