import type { Contact } from '../../types/db';

// ---------------------------------------------------------------------------
// Busca assistida de foto na internet (Seção 8.2) — PROVEDOR DESACOPLADO (V2)
//
// A interface abaixo define o contrato. O MVP entrega a tela pronta, mas SEM
// provedor ativo (searchProvider = null): ao clicar em "Buscar foto na
// internet", o usuário é informado de que o provedor precisa ser configurado.
//
// Para ativar (documentado no README):
//  1. Contrate uma API de busca de imagens (ex.: Google Programmable Search /
//     Bing Image Search) — respeitando os termos de uso de cada serviço.
//  2. Implemente a interface PhotoSearchProvider chamando a API por uma
//     Netlify Function (nunca exponha a chave da API no front-end).
//  3. Exporte a implementação em `searchProvider` no lugar de `null`.
//
// Regras obrigatórias já garantidas pela interface/tela:
//  - a foto NUNCA é vinculada automaticamente — exige confirmação expressa;
//  - cada resultado exibe página de origem, domínio e link "Ver fonte";
//  - após confirmar, são registrados: URL da imagem, página de origem, data,
//    e indicação de verificação manual (photo_verified_by_user).
// ---------------------------------------------------------------------------

export interface PhotoSearchResult {
  thumbnailUrl: string;
  imageUrl: string;
  pageUrl: string;
  pageTitle: string;
  domain: string;
}

export interface PhotoSearchProvider {
  search(input: { query: string; contact: Contact }): Promise<PhotoSearchResult[]>;
}

export const searchProvider: PhotoSearchProvider | null = null;
