"""Gera supabase/carga-swot-rascunho.sql a partir de src/data/swot-rascunho.json.
Uso: python3 supabase/gerar-carga-swot.py"""
import json, pathlib
raiz = pathlib.Path(__file__).resolve().parent.parent
itens = json.loads((raiz / 'src/data/swot-rascunho.json').read_text(encoding='utf-8'))
q = lambda v: 'null' if v is None else ("'" + str(v).replace("'", "''") + "'" if isinstance(v, str) else str(v))
linhas = ['  (' + ', '.join(q(v) for v in [i['quadrante'], i['titulo'], i.get('descricao'), i.get('evidencia'), i.get('impacto'), n]) + ')'
          for n, i in enumerate(itens)]
sql = f"""-- ============================================================================
-- RASCUNHO DA ANÁLISE SWOT — gerado por gerar-carga-swot.py
-- Montado a partir do quadro 2026 e das telas do OnePage (04/11/2026).
-- Entra marcado como RASCUNHO (a validar pelos sócios). Idempotente: não
-- duplica itens com o mesmo título e não altera itens já editados.
-- Rode depois do schema.sql e da carga do scorecard (que cria o ciclo).
-- ============================================================================
with ciclo as (select id from pe_ciclos where ano_inicio = 2027 and ano_fim = 2030 limit 1),
dados (quadrante, titulo, descricao, evidencia, impacto, ordem) as (values
{',\n'.join(linhas)}
)
insert into pe_swot (ciclo_id, quadrante, titulo, descricao, evidencia, impacto, ordem, rascunho)
select ciclo.id, d.quadrante, d.titulo, d.descricao, d.evidencia, d.impacto, d.ordem, true
from dados d cross join ciclo
where not exists (select 1 from pe_swot s where s.ciclo_id = ciclo.id and s.titulo = d.titulo);
"""
(raiz / 'supabase/carga-swot-rascunho.sql').write_text(sql, encoding='utf-8')
print(f'{len(itens)} itens')
