-- ============================================================================
-- WULFF RELATIONSHIP CRM — UPGRADE v1.1
-- Multiusuário (papéis Executivo/Assistente/Consulta) + Score no banco.
--
-- Para bancos JÁ CRIADOS com o schema.sql v1.0: execute este arquivo inteiro
-- uma vez no SQL Editor. Instalações novas não precisam dele (o schema.sql
-- atualizado já inclui tudo). O script é idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) profiles.email — necessário para convidar membros pelo e-mail
-- ----------------------------------------------------------------------------
alter table profiles add column if not exists email text;

update profiles p set email = u.email
from auth.users u where u.id = p.id and p.email is null;

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, 'admin');
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- 2) workspace_members — quem pode acessar a base de quem, e com qual papel
--    admin      → tudo (reservado; o dono já é admin por definição)
--    executivo  → visualiza, cria e edita (contatos, empresas, notas, etc.)
--    assistente → cadastra, organiza, importa e atualiza; NÃO vê notas privadas
--    consulta   → somente visualização
-- ----------------------------------------------------------------------------
create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  role user_role not null default 'consulta',
  created_at timestamptz not null default now(),
  unique (owner_id, member_id),
  check (owner_id <> member_id)
);

alter table workspace_members enable row level security;

drop policy if exists wm_owner_all on workspace_members;
create policy wm_owner_all on workspace_members
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists wm_member_read on workspace_members;
create policy wm_member_read on workspace_members
  for select using (member_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3) Funções auxiliares de permissão
-- ----------------------------------------------------------------------------
create or replace function member_role_in(owner uuid)
returns user_role language sql stable security definer set search_path = public as $$
  select role from workspace_members
  where owner_id = owner and member_id = auth.uid()
$$;

create or replace function can_read_ws(owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select owner = auth.uid() or member_role_in(owner) is not null
$$;

create or replace function can_write_ws(owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select owner = auth.uid()
      or member_role_in(owner) in ('admin','executivo','assistente')
$$;

-- Busca exata por e-mail para convidar membro (não expõe listagem de usuários)
create or replace function find_profile_by_email(p_email text)
returns table (id uuid, full_name text, email text)
language sql stable security definer set search_path = public as $$
  select id, full_name, email from profiles
  where lower(email) = lower(trim(p_email)) limit 1
$$;

-- Workspaces que eu posso acessar como membro
create or replace function my_workspaces()
returns table (owner_id uuid, owner_name text, owner_email text, role user_role)
language sql stable security definer set search_path = public as $$
  select wm.owner_id, p.full_name, p.email, wm.role
  from workspace_members wm
  join profiles p on p.id = wm.owner_id
  where wm.member_id = auth.uid()
$$;

-- Membros da MINHA base (com nome/e-mail para a tela de equipe)
create or replace function list_my_members()
returns table (id uuid, member_id uuid, member_name text, member_email text, role user_role, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select wm.id, wm.member_id, p.full_name, p.email, wm.role, wm.created_at
  from workspace_members wm
  join profiles p on p.id = wm.member_id
  where wm.owner_id = auth.uid()
  order by wm.created_at
$$;

grant execute on function member_role_in(uuid), can_read_ws(uuid), can_write_ws(uuid),
  find_profile_by_email(text), my_workspaces(), list_my_members() to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Novas políticas RLS — leitura para qualquer membro, escrita por papel
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'categories','companies','contacts','contact_emails','contact_phones',
    'contact_social_profiles','contact_companies','contact_categories','tags',
    'contact_tags','interactions','reminders','notes','relationships','events',
    'contact_events','attachments','import_jobs','import_rows','merge_history',
    'audit_logs','saved_filters','custom_fields','custom_field_values'
  ] loop
    execute format('drop policy if exists %I_owner on %I', t, t);
    execute format('drop policy if exists %I_select on %I', t, t);
    execute format('drop policy if exists %I_insert on %I', t, t);
    execute format('drop policy if exists %I_update on %I', t, t);
    execute format('drop policy if exists %I_delete on %I', t, t);
    execute format('create policy %I_select on %I for select using (can_read_ws(user_id))', t, t);
    execute format('create policy %I_insert on %I for insert with check (can_write_ws(user_id))', t, t);
    execute format('create policy %I_update on %I for update using (can_write_ws(user_id)) with check (can_write_ws(user_id))', t, t);
    execute format('create policy %I_delete on %I for delete using (can_write_ws(user_id))', t, t);
  end loop;
end $$;

-- Notas privadas: assistente e consulta não as leem (Seção 21 da especificação)
drop policy if exists notes_select on notes;
create policy notes_select on notes for select using (
  can_read_ws(user_id)
  and (
    not is_private
    or user_id = auth.uid()
    or member_role_in(user_id) in ('admin','executivo')
  )
);

-- ----------------------------------------------------------------------------
-- 5) Relationship Score calculado no banco — filtro e ordenação precisos
--    (mesmos pesos exibidos na interface)
-- ----------------------------------------------------------------------------
create or replace function contact_score(c contacts)
returns int language sql stable as $$
  select round(
    20 * (case when c.closeness  is not null then (7 - c.closeness) / 6.0 else 0.3 end)
  + 15 * (case when c.importance is not null then c.importance / 5.0 else 0.3 end)
  + 10 * (case when c.influence  is not null then c.influence  / 5.0 else 0.3 end)
  + 25 * (case
            when c.last_interaction_at is null then 0
            when now() - c.last_interaction_at <= interval '30 days' then 1
            when now() - c.last_interaction_at >= interval '365 days' then 0
            else 1 - (extract(epoch from now() - c.last_interaction_at) / 86400.0 - 30) / 335.0
          end)
  + 15 * least(1, coalesce(c.interactions_count, 0) / 10.0)
  +  5 * (case when c.business_potential is not null then c.business_potential / 5.0
               when c.opportunities is not null then 0.6 else 0 end)
  +  5 * ((
      (c.full_name is not null and c.full_name <> '')::int
    + (c.job_title    is not null)::int
    + (c.company_name is not null)::int
    + (c.city         is not null)::int
    + (c.email        is not null)::int
    + (c.phone        is not null)::int
    + (c.linkedin     is not null)::int
    + (c.photo_url    is not null)::int
    + (c.closeness    is not null)::int
    + (c.how_we_met   is not null)::int
    + (coalesce(c.birth_date::text, c.birth_day::text) is not null)::int
    + (c.interests    is not null)::int
    ) / 12.0)
  )::int
$$;

drop view if exists contacts_scored;
create view contacts_scored with (security_invoker = true) as
  select c.*, contact_score(c) as score from contacts c;

grant select on contacts_scored to authenticated;

-- ============================================================================
-- FIM do upgrade v1.1
-- ============================================================================
