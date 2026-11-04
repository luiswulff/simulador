"""Gera supabase/carga-scorecard-2026.sql a partir de src/data/scorecard-2026.json.
Uso: python3 supabase/gerar-carga-scorecard.py"""
import json, pathlib
raiz = pathlib.Path(__file__).resolve().parent.parent
itens = json.loads((raiz / 'src/data/scorecard-2026.json').read_text(encoding='utf-8'))
q = lambda v: 'null' if v is None else ("'" + str(v).replace("'", "''") + "'" if isinstance(v, str) else str(v))
linhas = []
for n, i in enumerate(itens):
    vals = [i['codigo'], i['grupo'], i['nome'], i.get('unidade'), i.get('linha_base'), i.get('formula'),
            i.get('descricao'), i.get('pendencia'), i.get('polaridade', 'maior'), n]
    linhas.append('  (' + ', '.join(q(v) for v in vals) + ')')
sql = f"""-- ============================================================================
-- CARGA DO SCORECARD 2026–2030 (quadro da diretoria) — gerado por gerar-carga-scorecard.py
-- Rode DEPOIS do schema.sql. Idempotente: atualiza definições pelo código e
-- NUNCA apaga metas ou medições já lançadas. Cria o ciclo 2027–2030 se não existir.
-- ============================================================================
insert into pe_ciclos (nome, ano_inicio, ano_fim, status)
select 'Planejamento Estratégico 2027–2030', 2027, 2030, 'ativo'
where not exists (select 1 from pe_ciclos where ano_inicio = 2027 and ano_fim = 2030);

with ciclo as (select id from pe_ciclos where ano_inicio = 2027 and ano_fim = 2030 limit 1),
dados (codigo, grupo, nome, unidade, linha_base, formula, descricao, pendencia, polaridade, ordem) as (values
{',\n'.join(linhas)}
)
insert into pe_indicadores (ciclo_id, escopo, frequencia, codigo, grupo, nome, unidade, linha_base, formula, descricao, pendencia, polaridade, ordem)
select ciclo.id, 'ambicao', 'anual', d.codigo, d.grupo, d.nome, d.unidade, d.linha_base::numeric, d.formula, d.descricao, d.pendencia, d.polaridade, d.ordem
from dados d cross join ciclo
on conflict (ciclo_id, codigo) where codigo is not null do update set
  grupo = excluded.grupo, nome = excluded.nome, unidade = excluded.unidade,
  linha_base = coalesce(pe_indicadores.linha_base, excluded.linha_base),
  formula = excluded.formula, descricao = coalesce(pe_indicadores.descricao, excluded.descricao),
  ordem = excluded.ordem;
"""
(raiz / 'supabase/carga-scorecard-2026.sql').write_text(sql, encoding='utf-8')
print(f'{len(itens)} indicadores')
