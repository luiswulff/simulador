export interface Profile {
  id: string;
  full_name: string | null;
  role: 'admin' | 'executivo' | 'assistente' | 'consulta';
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  sort_order: number;
  is_system: boolean;
}

export interface Company {
  id: string;
  user_id: string;
  legal_name: string | null;
  trade_name: string;
  cnpj: string | null;
  segment: string | null;
  size: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  website: string | null;
  linkedin: string | null;
  phone: string | null;
  description: string | null;
  status: string;
  owner: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Contact {
  id: string;
  user_id: string;
  full_name: string;
  preferred_name: string | null;
  job_title: string | null;
  company_name: string | null;
  company_id: string | null;
  department: string | null;
  profession: string | null;
  segment: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  language: string | null;
  birth_date: string | null;
  birth_day: number | null;
  birth_month: number | null;
  gender: string | null;
  document: string | null;
  internal_code: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  linkedin: string | null;
  instagram: string | null;
  twitter: string | null;
  website: string | null;
  photo_url: string | null;
  photo_source: 'upload' | 'url' | 'search' | null;
  photo_source_url: string | null;
  photo_updated_at: string | null;
  photo_verified_by_user: boolean;
  closeness: number | null;
  influence: number | null;
  importance: number | null;
  business_potential: number | null;
  trust_level: number | null;
  relationship_status: string;
  how_we_met: string | null;
  introduced_by: string | null;
  origin_context: string | null;
  met_date: string | null;
  last_interaction_at: string | null;
  interactions_count: number;
  next_contact_date: string | null;
  contact_frequency: string | null;
  interests: string | null;
  preferences: string | null;
  observations: string | null;
  private_notes: string | null;
  opportunities: string | null;
  owner: string | null;
  spouse_name: string | null;
  children: string | null;
  relevant_dates: string | null;
  hobbies: string | null;
  personal_info: string | null;
  source: string;
  import_job_id: string | null;
  source_row: Record<string, unknown> | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ContactEmail {
  id: string;
  contact_id: string;
  email: string;
  label: string | null;
  is_primary: boolean;
}

export interface ContactPhone {
  id: string;
  contact_id: string;
  phone: string;
  phone_normalized: string | null;
  label: string | null;
  is_whatsapp: boolean;
  is_primary: boolean;
}

export interface ContactSocialProfile {
  id: string;
  contact_id: string;
  network: string;
  url: string;
}

export interface ContactCompany {
  id: string;
  contact_id: string;
  company_id: string;
  job_title: string | null;
  is_current: boolean;
  started_at: string | null;
  ended_at: string | null;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  group_name: string | null;
  color: string | null;
}

export interface Interaction {
  id: string;
  user_id: string;
  contact_id: string | null;
  company_id: string | null;
  kind: string;
  summary: string;
  description: string | null;
  occurred_at: string;
  participants: string | null;
  next_action: string | null;
  owner: string | null;
  created_at: string;
}

export interface Reminder {
  id: string;
  user_id: string;
  contact_id: string | null;
  company_id: string | null;
  title: string;
  reason: string | null;
  due_date: string;
  recurrence: string;
  recurrence_days: number | null;
  priority: string;
  channel: string | null;
  notes: string | null;
  owner: string | null;
  is_done: boolean;
  done_at: string | null;
  created_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  contact_id: string | null;
  company_id: string | null;
  title: string | null;
  body: string;
  is_private: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface Relationship {
  id: string;
  from_contact_id: string;
  to_contact_id: string;
  kind: string;
  notes: string | null;
}

export interface ImportJob {
  id: string;
  file_name: string;
  file_type: string;
  status: string;
  total_rows: number;
  created_count: number;
  updated_count: number;
  merged_count: number;
  skipped_count: number;
  error_count: number;
  column_mapping: Record<string, string> | null;
  report: Record<string, unknown> | null;
  created_at: string;
  finished_at: string | null;
}

export interface SavedFilter {
  id: string;
  name: string;
  description: string | null;
  filters: Record<string, unknown>;
  sort_order: number;
  created_at: string;
}

export interface AuditLog {
  id: string;
  entity: string;
  entity_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}
