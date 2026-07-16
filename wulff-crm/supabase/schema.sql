-- ============================================================================
-- WULFF RELATIONSHIP CRM — SCRIPT ÚNICO DE CRIAÇÃO DO BANCO
-- Execute este arquivo inteiro UMA VEZ no SQL Editor do Supabase.
-- (Painel do Supabase → SQL Editor → New query → cole tudo → Run)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensões
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";
create extension if not exists "unaccent";

-- ----------------------------------------------------------------------------
-- Tipos
-- ----------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('admin', 'executivo', 'assistente', 'consulta');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- profiles — perfil do usuário (single-tenant: normalmente 1 registro)
-- Roles Executivo/Assistente/Consulta são estrutura preparada para V2.
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role user_role not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cria o profile automaticamente no signup (primeiro usuário = admin)
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'admin');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ----------------------------------------------------------------------------
-- categories — perfis de relacionamento (editáveis)
-- ----------------------------------------------------------------------------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  sort_order int not null default 0,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ----------------------------------------------------------------------------
-- companies — empresas e organizações
-- ----------------------------------------------------------------------------
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  legal_name text,
  trade_name text not null,
  cnpj text,
  segment text,
  size text,
  city text,
  state text,
  country text,
  website text,
  linkedin text,
  phone text,
  description text,
  status text not null default 'ativa',
  owner text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ----------------------------------------------------------------------------
-- contacts — tabela principal
-- ----------------------------------------------------------------------------
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Identificação
  full_name text not null,
  preferred_name text,
  job_title text,
  company_name text,               -- denormalizado para busca/lista
  company_id uuid references companies(id) on delete set null,
  department text,
  profession text,
  segment text,
  city text,
  state text,
  country text,
  language text,
  birth_date date,                 -- data completa quando conhecida
  birth_day smallint,              -- suporta aniversário sem ano (--MM-DD)
  birth_month smallint,
  gender text,
  document text,                   -- CPF/documento (opcional)
  internal_code text,

  -- Contato principal (denormalizado; adicionais em contact_emails/phones)
  email text,
  phone text,
  whatsapp text,
  linkedin text,
  instagram text,
  twitter text,
  website text,

  -- Foto (Seção 8)
  photo_url text,
  photo_source text,               -- 'upload' | 'url' | 'search'
  photo_source_url text,
  photo_updated_at timestamptz,
  photo_verified_by_user boolean not null default false,

  -- Relacionamento
  closeness smallint,              -- grau 1..7 (1=Estratégico … 7=Sem relacionamento recente)
  influence smallint,              -- 1..5
  importance smallint,             -- 1..5
  business_potential smallint,     -- 1..5
  trust_level smallint,            -- 1..5
  relationship_status text not null default 'ativo',
  how_we_met text,
  introduced_by text,
  origin_context text,
  met_date date,
  last_interaction_at timestamptz, -- mantido por trigger de interactions
  interactions_count int not null default 0,
  next_contact_date date,
  contact_frequency text,          -- mensal | bimestral | trimestral | semestral | anual | personalizada
  interests text,
  preferences text,
  observations text,
  private_notes text,
  opportunities text,
  owner text,

  -- Pessoais (Seção 6)
  spouse_name text,
  children text,
  relevant_dates text,
  hobbies text,
  personal_info text,

  -- Origem / auditoria de importação (Seção 24)
  source text not null default 'manual',   -- manual | import | demo
  import_job_id uuid,
  source_row jsonb,                -- linha original importada, para auditoria

  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists contacts_user_idx on contacts (user_id) where deleted_at is null;
create index if not exists contacts_name_trgm_idx on contacts using gin (full_name gin_trgm_ops);
create index if not exists contacts_email_idx on contacts (user_id, lower(email));
create index if not exists contacts_company_idx on contacts (company_id);
create index if not exists contacts_next_contact_idx on contacts (user_id, next_contact_date);
create index if not exists contacts_last_interaction_idx on contacts (user_id, last_interaction_at);

-- ----------------------------------------------------------------------------
-- E-mails, telefones e redes sociais adicionais
-- ----------------------------------------------------------------------------
create table if not exists contact_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  email text not null,
  label text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists contact_emails_contact_idx on contact_emails (contact_id);
create index if not exists contact_emails_email_idx on contact_emails (user_id, lower(email));

create table if not exists contact_phones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  phone text not null,             -- original
  phone_normalized text,           -- E.164 (+55…)
  label text,
  is_whatsapp boolean not null default false,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists contact_phones_contact_idx on contact_phones (contact_id);
create index if not exists contact_phones_norm_idx on contact_phones (user_id, phone_normalized);

create table if not exists contact_social_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  network text not null,           -- linkedin | instagram | facebook | x | site | outro
  url text not null,
  created_at timestamptz not null default now()
);
create index if not exists contact_social_contact_idx on contact_social_profiles (contact_id);

-- ----------------------------------------------------------------------------
-- Vínculo pessoa ↔ empresa com histórico de cargos
-- ----------------------------------------------------------------------------
create table if not exists contact_companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  job_title text,
  is_current boolean not null default true,
  started_at date,
  ended_at date,
  created_at timestamptz not null default now()
);
create index if not exists contact_companies_contact_idx on contact_companies (contact_id);
create index if not exists contact_companies_company_idx on contact_companies (company_id);

-- ----------------------------------------------------------------------------
-- Categorias do contato (N:N)
-- ----------------------------------------------------------------------------
create table if not exists contact_categories (
  contact_id uuid not null references contacts(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (contact_id, category_id)
);
create index if not exists contact_categories_cat_idx on contact_categories (category_id);

-- ----------------------------------------------------------------------------
-- Tags
-- ----------------------------------------------------------------------------
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  group_name text,
  color text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists contact_tags (
  contact_id uuid not null references contacts(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (contact_id, tag_id)
);
create index if not exists contact_tags_tag_idx on contact_tags (tag_id);

-- ----------------------------------------------------------------------------
-- interactions — linha do tempo do relacionamento
-- ----------------------------------------------------------------------------
create table if not exists interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  kind text not null,              -- reuniao | ligacao | mensagem | email | almoco | jantar | viagem | presente | proposta | contrato | evento | outro
  summary text not null,
  description text,
  occurred_at timestamptz not null default now(),
  participants text,
  next_action text,
  owner text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists interactions_contact_idx on interactions (contact_id, occurred_at desc);
create index if not exists interactions_user_idx on interactions (user_id, occurred_at desc);

-- Mantém contacts.last_interaction_at / interactions_count
create or replace function refresh_contact_interaction_stats()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  cid := coalesce(new.contact_id, old.contact_id);
  if cid is not null then
    update contacts c set
      last_interaction_at = (select max(occurred_at) from interactions i where i.contact_id = cid),
      interactions_count  = (select count(*) from interactions i where i.contact_id = cid)
    where c.id = cid;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists interactions_stats_trigger on interactions;
create trigger interactions_stats_trigger
  after insert or update or delete on interactions
  for each row execute function refresh_contact_interaction_stats();

-- ----------------------------------------------------------------------------
-- reminders — lembretes e cadência
-- ----------------------------------------------------------------------------
create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  title text not null,
  reason text,
  due_date date not null,
  recurrence text not null default 'nenhuma', -- nenhuma | mensal | bimestral | trimestral | semestral | anual | personalizada
  recurrence_days int,
  priority text not null default 'media',     -- alta | media | baixa
  channel text,                                -- canal sugerido
  notes text,
  owner text,
  is_done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reminders_due_idx on reminders (user_id, is_done, due_date);
create index if not exists reminders_contact_idx on reminders (contact_id);

-- ----------------------------------------------------------------------------
-- notes — anotações
-- ----------------------------------------------------------------------------
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  title text,
  body text not null,
  is_private boolean not null default false,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_contact_idx on notes (contact_id, is_pinned desc, created_at desc);

-- ----------------------------------------------------------------------------
-- relationships — grafo de conexões (V2: mapa visual; MVP: quem apresentou)
-- ----------------------------------------------------------------------------
create table if not exists relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_contact_id uuid not null references contacts(id) on delete cascade,
  to_contact_id uuid not null references contacts(id) on delete cascade,
  kind text not null default 'conhece',  -- conhece | apresentou | trabalha_com | familia | socio | outro
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists relationships_from_idx on relationships (from_contact_id);
create index if not exists relationships_to_idx on relationships (to_contact_id);

-- ----------------------------------------------------------------------------
-- events — eventos, viagens, encontros de origem
-- ----------------------------------------------------------------------------
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  event_date date,
  city text,
  country text,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists contact_events (
  contact_id uuid not null references contacts(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (contact_id, event_id)
);

-- ----------------------------------------------------------------------------
-- attachments — documentos vinculados (metadados; arquivo no Storage)
-- ----------------------------------------------------------------------------
create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  note_id uuid references notes(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index if not exists attachments_contact_idx on attachments (contact_id);

-- ----------------------------------------------------------------------------
-- Importações (Seção 9 / 24)
-- ----------------------------------------------------------------------------
create table if not exists import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_type text not null,          -- csv | xlsx | json | vcf
  status text not null default 'pendente', -- pendente | concluida | cancelada | erro
  total_rows int not null default 0,
  created_count int not null default 0,
  updated_count int not null default 0,
  merged_count int not null default 0,
  skipped_count int not null default 0,
  error_count int not null default 0,
  column_mapping jsonb,
  report jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists import_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_job_id uuid not null references import_jobs(id) on delete cascade,
  row_number int not null,
  raw_data jsonb not null,
  outcome text not null,            -- criado | atualizado | mesclado | ignorado | erro
  error_message text,
  contact_id uuid references contacts(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists import_rows_job_idx on import_rows (import_job_id);

-- ----------------------------------------------------------------------------
-- merge_history — histórico de mesclagens
-- ----------------------------------------------------------------------------
create table if not exists merge_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kept_contact_id uuid references contacts(id) on delete set null,
  removed_contact_snapshot jsonb not null,
  merged_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- audit_logs
-- ----------------------------------------------------------------------------
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity text not null,
  entity_id uuid,
  action text not null,             -- criar | editar | arquivar | excluir | restaurar | mesclar | importar | foto
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_entity_idx on audit_logs (entity, entity_id);

-- ----------------------------------------------------------------------------
-- saved_filters — listas inteligentes
-- ----------------------------------------------------------------------------
create table if not exists saved_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  filters jsonb not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- custom_fields — V2 (apenas estrutura; sem interface no MVP)
-- ----------------------------------------------------------------------------
create table if not exists custom_fields (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity text not null default 'contact',
  name text not null,
  field_type text not null,         -- texto | texto_longo | numero | moeda | data | selecao_unica | selecao_multipla | sim_nao | url | email | telefone
  options jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists custom_field_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  custom_field_id uuid not null references custom_fields(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  value jsonb,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- updated_at automático
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','companies','contacts','interactions','reminders','notes'] loop
    execute format('drop trigger if exists %I_updated_at on %I', t, t);
    execute format('create trigger %I_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY — single-tenant por user_id
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
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_owner on %I', t, t);
    execute format(
      'create policy %I_owner on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t, t
    );
  end loop;
end $$;

alter table profiles enable row level security;
drop policy if exists profiles_own on profiles;
create policy profiles_own on profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

-- ----------------------------------------------------------------------------
-- STORAGE — bucket de fotos de contatos
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('contact-photos', 'contact-photos', true)
on conflict (id) do nothing;

drop policy if exists "contact photos read" on storage.objects;
create policy "contact photos read" on storage.objects
  for select using (bucket_id = 'contact-photos');

drop policy if exists "contact photos insert" on storage.objects;
create policy "contact photos insert" on storage.objects
  for insert with check (
    bucket_id = 'contact-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "contact photos update" on storage.objects;
create policy "contact photos update" on storage.objects
  for update using (
    bucket_id = 'contact-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "contact photos delete" on storage.objects;
create policy "contact photos delete" on storage.objects
  for delete using (
    bucket_id = 'contact-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------------------------
-- Seed de categorias padrão para novos usuários (editáveis depois)
-- ----------------------------------------------------------------------------
create or replace function seed_default_categories()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.categories (user_id, name, sort_order, is_system)
  select new.id, c.name, c.ord, true
  from (values
    ('Cliente',1),('Ex-cliente',2),('Prospect',3),('Parceiro',4),('Canal',5),
    ('Fornecedor',6),('Colaborador',7),('Ex-colaborador',8),('Sócio',9),
    ('Investidor',10),('Empresário',11),('Executivo',12),('Advogado',13),
    ('Contador',14),('Consultor',15),('Professor',16),('Palestrante',17),
    ('Autoridade pública',18),('Imprensa',19),('Influenciador',20),('Amigo',21),
    ('Família',22),('Conhecido',23),('Contato de evento',24),
    ('Contato internacional',25),('Outro',26)
  ) as c(name, ord)
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_profile_created_seed on profiles;
create trigger on_profile_created_seed
  after insert on profiles
  for each row execute function seed_default_categories();

-- ============================================================================
-- FIM — banco pronto. Próximo passo: copiar URL e anon key para o Netlify/.env
-- ============================================================================
