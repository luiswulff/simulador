-- ============================================================================
-- PLANEJAMENTO ESTRATÉGICO 2027–2030 — SCRIPT ÚNICO DE CRIAÇÃO DO BANCO
-- Rode este arquivo inteiro UMA VEZ no SQL Editor do Supabase. Ele é idempotente
-- (pode ser rodado de novo sem perder dados).
--
-- Convenções de nomes (pensadas para integração com as demais aplicações da firma):
--   org_*  → dados mestres da FIRMA (áreas, pessoas). Compartilháveis com CRM,
--            propostas, RH, financeiro etc. Uma única fonte de verdade.
--   pe_*   → dados do PLANEJAMENTO ESTRATÉGICO.
--   vw_pe_* → views de leitura estáveis, para outras aplicações consumirem
--            (contrato de integração: as tabelas podem mudar, as views não).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Tipos
-- ----------------------------------------------------------------------------
do $$ begin
  create type pe_papel as enum ('diretoria', 'lider', 'colaborador');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pe_status as enum ('nao_iniciado', 'em_andamento', 'concluido', 'pausado', 'cancelado');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Função utilitária: updated_at
-- ----------------------------------------------------------------------------
create or replace function pe_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ============================================================================
-- 1. DADOS MESTRES DA FIRMA (org_*)
-- ============================================================================

create table if not exists org_areas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  sigla text,
  descricao text,
  area_pai_id uuid references org_areas(id) on delete set null,
  lider_id uuid,                       -- FK adicionada após org_pessoas
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pe_cargos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  familia text,                        -- ex.: Consultoria Tributária, Backoffice
  descricao text,
  requisitos text,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pe_carreira_degraus (
  id uuid primary key default gen_random_uuid(),
  trilha text not null default 'societaria' check (trilha in ('profissional', 'societaria')),
  ordem int not null default 0,
  nome text not null,
  descricao text,
  criterios text,                      -- critérios objetivos de acesso ao degrau
  tempo_minimo_meses int,
  participacao_pct numeric(6,3),       -- participação societária de referência (%)
  direitos text,
  obrigacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists org_pessoas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  nome text not null,
  email text,
  area_id uuid references org_areas(id) on delete set null,
  cargo_id uuid references pe_cargos(id) on delete set null,
  degrau_id uuid references pe_carreira_degraus(id) on delete set null,
  gestor_id uuid references org_pessoas(id) on delete set null,
  data_admissao date,
  is_socio boolean not null default false,
  ativo boolean not null default true,
  foto_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table org_areas add constraint org_areas_lider_fk
    foreign key (lider_id) references org_pessoas(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Perfis de acesso do planejamento (quem pode ver/editar o quê)
-- ----------------------------------------------------------------------------
create table if not exists pe_perfis (
  user_id uuid primary key references auth.users(id) on delete cascade,
  papel pe_papel not null default 'colaborador',
  pessoa_id uuid references org_pessoas(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Primeiro usuário vira 'diretoria'; os demais entram como 'colaborador'.
-- Nome de trigger próprio para conviver com outros apps no mesmo projeto Supabase.
create or replace function pe_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pessoa uuid;
begin
  select id into v_pessoa from org_pessoas where lower(email) = lower(new.email) limit 1;
  insert into pe_perfis (user_id, papel, pessoa_id)
  values (
    new.id,
    case when exists (select 1 from pe_perfis) then 'colaborador'::pe_papel else 'diretoria'::pe_papel end,
    v_pessoa
  ) on conflict (user_id) do nothing;
  if v_pessoa is not null then
    update org_pessoas set user_id = new.id where id = v_pessoa and user_id is null;
  end if;
  return new;
end $$;

drop trigger if exists pe_on_auth_user_created on auth.users;
create trigger pe_on_auth_user_created
  after insert on auth.users
  for each row execute function pe_handle_new_user();

create or replace function pe_meu_papel()
returns pe_papel language sql stable security definer set search_path = public as $$
  select papel from pe_perfis where user_id = auth.uid()
$$;

create or replace function pe_minha_pessoa()
returns uuid language sql stable security definer set search_path = public as $$
  select pessoa_id from pe_perfis where user_id = auth.uid()
$$;

-- Áreas lideradas pelo usuário (inclui subáreas diretas)
create or replace function pe_minhas_areas()
returns setof uuid language sql stable security definer set search_path = public as $$
  select a.id from org_areas a
  where a.lider_id = pe_minha_pessoa()
     or a.area_pai_id in (select id from org_areas where lider_id = pe_minha_pessoa())
$$;

-- ============================================================================
-- 2. CICLO E IDENTIDADE
-- ============================================================================

create table if not exists pe_ciclos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                  -- "Planejamento Estratégico 2027–2030"
  ano_inicio int not null,
  ano_fim int not null,
  ambicao text,                        -- frase-síntese: "Ser a Big Five brasileira"
  status text not null default 'ativo' check (status in ('rascunho', 'ativo', 'encerrado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pe_identidade (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid not null references pe_ciclos(id) on delete cascade,
  tipo text not null check (tipo in ('missao', 'visao', 'proposito', 'valor', 'cultura')),
  titulo text not null,
  descricao text,
  comportamentos text,                 -- comportamentos observáveis (valores/cultura)
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Marcos da transformação (roadmap ano a ano rumo à ambição)
create table if not exists pe_marcos (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid not null references pe_ciclos(id) on delete cascade,
  ano int not null,
  titulo text not null,
  descricao text,
  status pe_status not null default 'nao_iniciado',
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 3. DESDOBRAMENTO ESTRATÉGICO (cascata)
--    Pilar → Objetivo → Iniciativa → Ação (5W2H) → Atualizações
--    Indicadores podem estar na Ambição (nível firma), num Objetivo ou numa Área.
-- ============================================================================

create table if not exists pe_pilares (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid not null references pe_ciclos(id) on delete cascade,
  nome text not null,
  descricao text,
  cor text,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pe_objetivos (
  id uuid primary key default gen_random_uuid(),
  pilar_id uuid not null references pe_pilares(id) on delete cascade,
  codigo text,                         -- ex.: OE-01
  titulo text not null,
  descricao text,
  area_id uuid references org_areas(id) on delete set null,
  responsavel_id uuid references org_pessoas(id) on delete set null,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pe_iniciativas (
  id uuid primary key default gen_random_uuid(),
  objetivo_id uuid not null references pe_objetivos(id) on delete cascade,
  codigo text,                         -- ex.: IN-01.02
  titulo text not null,
  descricao text,
  area_id uuid references org_areas(id) on delete set null,
  responsavel_id uuid references org_pessoas(id) on delete set null,
  inicio date,
  fim date,
  status pe_status not null default 'nao_iniciado',
  prioridade text check (prioridade in ('alta', 'media', 'baixa')),
  orcamento numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pe_acoes (
  id uuid primary key default gen_random_uuid(),
  iniciativa_id uuid not null references pe_iniciativas(id) on delete cascade,
  o_que text not null,                 -- What
  por_que text,                        -- Why
  onde text,                           -- Where
  responsavel_id uuid references org_pessoas(id) on delete set null,  -- Who
  prazo date,                          -- When
  como text,                           -- How
  quanto numeric(14,2),                -- How much
  area_id uuid references org_areas(id) on delete set null,
  status pe_status not null default 'nao_iniciado',
  percentual int not null default 0 check (percentual between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pe_acao_atualizacoes (
  id uuid primary key default gen_random_uuid(),
  acao_id uuid not null references pe_acoes(id) on delete cascade,
  data date not null default current_date,
  texto text not null,
  percentual int check (percentual between 0 and 100),
  autor_id uuid references org_pessoas(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists pe_indicadores (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid not null references pe_ciclos(id) on delete cascade,
  escopo text not null default 'objetivo' check (escopo in ('ambicao', 'objetivo', 'area')),
  objetivo_id uuid references pe_objetivos(id) on delete cascade,
  area_id uuid references org_areas(id) on delete set null,
  nome text not null,
  descricao text,                      -- fórmula / fonte do dado
  unidade text,                        -- R$, %, nº, R$ mi …
  polaridade text not null default 'maior' check (polaridade in ('maior', 'menor')),
  frequencia text default 'mensal',
  linha_base numeric,
  responsavel_id uuid references org_pessoas(id) on delete set null,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pe_indicador_metas (
  id uuid primary key default gen_random_uuid(),
  indicador_id uuid not null references pe_indicadores(id) on delete cascade,
  ano int not null,
  meta numeric not null,
  unique (indicador_id, ano)
);

create table if not exists pe_indicador_medicoes (
  id uuid primary key default gen_random_uuid(),
  indicador_id uuid not null references pe_indicadores(id) on delete cascade,
  data_ref date not null,
  valor numeric not null,
  comentario text,
  autor_id uuid references org_pessoas(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 4. PESSOAS: CARGOS E SALÁRIOS (CONFIDENCIAL)
-- ============================================================================

create table if not exists pe_faixas_salariais (
  id uuid primary key default gen_random_uuid(),
  cargo_id uuid not null references pe_cargos(id) on delete cascade,
  nivel text not null,                 -- I, II, III / Júnior, Pleno, Sênior
  minimo numeric(12,2),
  medio numeric(12,2),
  maximo numeric(12,2),
  vigencia int,                        -- ano de vigência da tabela
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 5. VALUATION (CONFIDENCIAL)
-- ============================================================================

create table if not exists pe_valuation_cenarios (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid not null references pe_ciclos(id) on delete cascade,
  nome text not null,                  -- Pessimista / Base / Otimista
  descricao text,
  multiplo_ebitda numeric(6,2),        -- EV/EBITDA de referência
  taxa_desconto_pct numeric(6,2),      -- WACC (% a.a.)
  crescimento_perpetuo_pct numeric(6,2),
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pe_valuation_projecoes (
  id uuid primary key default gen_random_uuid(),
  cenario_id uuid not null references pe_valuation_cenarios(id) on delete cascade,
  ano int not null,
  receita numeric(16,2),
  ebitda numeric(16,2),
  lucro_liquido numeric(16,2),
  headcount int,
  socios int,
  unique (cenario_id, ano)
);

-- ============================================================================
-- 6. HISTÓRICO (auditoria de tudo que muda — o plano "vivo" tem memória)
-- ============================================================================

create table if not exists pe_historico (
  id bigserial primary key,
  tabela text not null,
  registro_id uuid,
  operacao text not null,
  dados jsonb,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create or replace function pe_auditar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into pe_historico (tabela, registro_id, operacao, dados)
  values (
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then old.id else new.id end), null),
    tg_op,
    case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

-- ============================================================================
-- 7. TRIGGERS (updated_at + auditoria) e ÍNDICES
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'org_areas','org_pessoas','pe_cargos','pe_carreira_degraus','pe_ciclos','pe_identidade',
    'pe_marcos','pe_pilares','pe_objetivos','pe_iniciativas','pe_acoes','pe_indicadores',
    'pe_faixas_salariais','pe_valuation_cenarios'
  ] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format('create trigger %I_touch before update on %I for each row execute function pe_touch_updated_at()', t, t);
  end loop;

  foreach t in array array[
    'pe_identidade','pe_marcos','pe_pilares','pe_objetivos','pe_iniciativas','pe_acoes',
    'pe_indicadores','pe_indicador_metas','pe_indicador_medicoes','pe_faixas_salariais',
    'pe_carreira_degraus','pe_cargos','pe_valuation_cenarios','pe_valuation_projecoes',
    'org_areas','org_pessoas'
  ] loop
    execute format('drop trigger if exists %I_audit on %I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function pe_auditar()', t, t);
  end loop;
end $$;

create index if not exists idx_pe_objetivos_pilar on pe_objetivos(pilar_id);
create index if not exists idx_pe_iniciativas_objetivo on pe_iniciativas(objetivo_id);
create index if not exists idx_pe_acoes_iniciativa on pe_acoes(iniciativa_id);
create index if not exists idx_pe_acoes_responsavel on pe_acoes(responsavel_id);
create index if not exists idx_pe_acoes_prazo on pe_acoes(prazo);
create index if not exists idx_pe_medicoes_indicador on pe_indicador_medicoes(indicador_id, data_ref);
create index if not exists idx_org_pessoas_area on org_pessoas(area_id);
create index if not exists idx_pe_historico_registro on pe_historico(tabela, registro_id);

-- ============================================================================
-- 8. ROW LEVEL SECURITY
--   diretoria   → lê e edita tudo (inclui salários e valuation)
--   lider       → lê tudo que não é confidencial; edita iniciativas, ações,
--                 indicadores e medições da(s) sua(s) área(s)
--   colaborador → lê tudo que não é confidencial; atualiza as ações em que é
--                 responsável e registra atualizações
--   Confidencial (só diretoria): pe_faixas_salariais, pe_valuation_*, pe_historico
-- ============================================================================

do $$
declare t text;
begin
  -- Tabelas de leitura geral, edição só da diretoria
  foreach t in array array[
    'org_areas','org_pessoas','pe_cargos','pe_carreira_degraus','pe_ciclos','pe_identidade',
    'pe_marcos','pe_pilares','pe_objetivos','pe_indicador_metas'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select to authenticated using (pe_meu_papel() is not null)', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format($p$create policy %I on %I for all to authenticated
      using (pe_meu_papel() = 'diretoria') with check (pe_meu_papel() = 'diretoria')$p$, t || '_write', t);
  end loop;

  -- Confidenciais: só diretoria lê e edita
  foreach t in array array['pe_faixas_salariais','pe_valuation_cenarios','pe_valuation_projecoes','pe_historico'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_dir', t);
    execute format($p$create policy %I on %I for all to authenticated
      using (pe_meu_papel() = 'diretoria') with check (pe_meu_papel() = 'diretoria')$p$, t || '_dir', t);
  end loop;
end $$;

-- pe_perfis: cada um lê o próprio; diretoria gerencia todos
alter table pe_perfis enable row level security;
drop policy if exists pe_perfis_self on pe_perfis;
create policy pe_perfis_self on pe_perfis for select to authenticated
  using (user_id = auth.uid() or pe_meu_papel() = 'diretoria');
drop policy if exists pe_perfis_dir on pe_perfis;
create policy pe_perfis_dir on pe_perfis for all to authenticated
  using (pe_meu_papel() = 'diretoria') with check (pe_meu_papel() = 'diretoria');

-- Iniciativas e indicadores: líder edita os da sua área
do $$
declare t text;
begin
  foreach t in array array['pe_iniciativas','pe_indicadores'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select to authenticated using (pe_meu_papel() is not null)', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format($p$create policy %I on %I for all to authenticated
      using (pe_meu_papel() = 'diretoria' or (pe_meu_papel() = 'lider' and area_id in (select pe_minhas_areas())))
      with check (pe_meu_papel() = 'diretoria' or (pe_meu_papel() = 'lider' and area_id in (select pe_minhas_areas())))$p$,
      t || '_write', t);
  end loop;
end $$;

-- Ações: diretoria tudo; líder da área; responsável pode atualizar
alter table pe_acoes enable row level security;
drop policy if exists pe_acoes_read on pe_acoes;
create policy pe_acoes_read on pe_acoes for select to authenticated using (pe_meu_papel() is not null);
drop policy if exists pe_acoes_write on pe_acoes;
create policy pe_acoes_write on pe_acoes for all to authenticated
  using (pe_meu_papel() = 'diretoria' or (pe_meu_papel() = 'lider' and area_id in (select pe_minhas_areas())))
  with check (pe_meu_papel() = 'diretoria' or (pe_meu_papel() = 'lider' and area_id in (select pe_minhas_areas())));
drop policy if exists pe_acoes_responsavel on pe_acoes;
create policy pe_acoes_responsavel on pe_acoes for update to authenticated
  using (responsavel_id = pe_minha_pessoa()) with check (responsavel_id = pe_minha_pessoa());

-- Atualizações de ações e medições: qualquer perfil lê; insere quem é autor
do $$
declare t text;
begin
  foreach t in array array['pe_acao_atualizacoes','pe_indicador_medicoes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select to authenticated using (pe_meu_papel() is not null)', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('create policy %I on %I for insert to authenticated with check (pe_meu_papel() is not null)', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_dir', t);
    execute format($p$create policy %I on %I for all to authenticated
      using (pe_meu_papel() = 'diretoria') with check (pe_meu_papel() = 'diretoria')$p$, t || '_dir', t);
  end loop;
end $$;

-- ============================================================================
-- 9. VIEWS DE INTEGRAÇÃO (contrato estável para outras aplicações)
--    security_invoker: as views respeitam o RLS de quem consulta.
-- ============================================================================

create or replace view vw_pe_acoes with (security_invoker = true) as
select
  a.id, a.o_que, a.prazo, a.status, a.percentual,
  coalesce(a.prazo < current_date and a.status not in ('concluido', 'cancelado'), false) as atrasada,
  i.id as iniciativa_id, i.titulo as iniciativa,
  o.id as objetivo_id, o.codigo as objetivo_codigo, o.titulo as objetivo,
  p.id as pilar_id, p.nome as pilar,
  r.id as responsavel_id, r.nome as responsavel, r.email as responsavel_email,
  ar.id as area_id, ar.nome as area
from pe_acoes a
join pe_iniciativas i on i.id = a.iniciativa_id
join pe_objetivos o on o.id = i.objetivo_id
join pe_pilares p on p.id = o.pilar_id
left join org_pessoas r on r.id = a.responsavel_id
left join org_areas ar on ar.id = coalesce(a.area_id, i.area_id);

create or replace view vw_pe_indicadores with (security_invoker = true) as
select
  ind.id, ind.nome, ind.unidade, ind.polaridade, ind.escopo,
  ind.objetivo_id, ind.area_id,
  m.ano, m.meta,
  (select valor from pe_indicador_medicoes x
     where x.indicador_id = ind.id and extract(year from x.data_ref) = m.ano
     order by x.data_ref desc limit 1) as ultimo_valor
from pe_indicadores ind
left join pe_indicador_metas m on m.indicador_id = ind.id;
