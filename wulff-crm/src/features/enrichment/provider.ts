import type { Contact } from '../../types/db';

// ---------------------------------------------------------------------------
// Enriquecimento de cadastro via LinkedIn — abordagem em duas camadas:
//
// 1) SEM credenciais (ativo no MVP): botões que abrem a pesquisa de pessoas do
//    LinkedIn (ou Google restrito a linkedin.com/in) já preenchida com nome +
//    empresa. O usuário confere o perfil e cola os dados no modal "Enriquecer
//    cadastro". O LinkedIn NÃO oferece API pública de busca/leitura de perfis
//    de terceiros, e raspagem viola os Termos de Uso — por isso o fluxo é
//    assistido, não automático.
//
// 2) COM provedor pago (V2, desacoplado): implemente EnrichmentProvider abaixo
//    usando um serviço de enriquecimento (ex.: Proxycurl, Apollo, Lusha),
//    SEMPRE por uma Netlify Function (nunca exponha a chave no front-end), e
//    exporte a implementação em `enrichmentProvider` no lugar de `null`.
//    O modal passa a exibir o botão "Enriquecer automaticamente".
// ---------------------------------------------------------------------------

export interface EnrichmentResult {
  linkedin?: string;
  job_title?: string;
  company_name?: string;
  city?: string;
  state?: string;
  country?: string;
  segment?: string;
  website?: string;
  photo_url?: string;
  sourceName: string; // ex.: "Proxycurl" — registrado na auditoria
}

export interface EnrichmentProvider {
  enrich(contact: Contact): Promise<EnrichmentResult | null>;
}

export const enrichmentProvider: EnrichmentProvider | null = null;

/** URL do perfil (se cadastrado) ou da pesquisa de pessoas no LinkedIn. */
export function linkedinUrlFor(c: Pick<Contact, 'linkedin' | 'full_name' | 'company_name'>): string {
  if (c.linkedin) {
    const v = c.linkedin.trim();
    return /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, '')}`;
  }
  return linkedinSearchUrl(c);
}

export function linkedinSearchUrl(c: Pick<Contact, 'full_name' | 'company_name'>): string {
  const kw = [`"${c.full_name}"`, c.company_name ? `"${c.company_name}"` : '']
    .filter(Boolean)
    .join(' ');
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(kw)}`;
}

export function googleLinkedinSearchUrl(c: Pick<Contact, 'full_name' | 'company_name' | 'city'>): string {
  const q = ['site:linkedin.com/in', `"${c.full_name}"`, c.company_name ?? '', c.city ?? '']
    .filter(Boolean)
    .join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
