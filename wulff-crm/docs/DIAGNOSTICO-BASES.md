# Fase 0 — Diagnóstico das 4 bases reais (Mesh1–Mesh4)

> Este documento contém **apenas estatísticas agregadas e formatos** — nenhum dado
> pessoal das bases foi copiado para o repositório, conforme a Seção 0 da especificação.

## Estrutura dos arquivos

Os 4 CSVs são **exports do aplicativo Mesh no formato Google Contacts CSV**
(`External ID 1 - Type = "Mesh"` em 100% dos registros):

- **Encoding:** UTF-8 (sem BOM) · **Separador:** vírgula · **Aspas:** padrão RFC 4180
- **1.649 colunas idênticas nos 4 arquivos:** 8 campos base (`Name`, `Given Name`,
  `Family Name`, `Birthday`, `Notes`, `Group Membership`, `Organization Name`,
  `Organization Title`), **800 pares** `Phone N - Type/Value`, 1 par de e-mail,
  3 blocos de endereço, 5 pares `Website N - Type/Value` e 1 `External ID`.
- Na prática, **apenas 24–37 colunas contêm dados** em cada arquivo — o assistente
  de importação oculta automaticamente as colunas vazias.

## Volume e preenchimento

| Base  | Registros | Com nome | Com e-mail | Com telefone | Aniversário |
|-------|-----------|----------|------------|--------------|-------------|
| Mesh1 | 5.412     | 100%     | 61%        | 23%          | 5%          |
| Mesh2 | 5.406     | 100%     | 29%        | 25%          | 3%          |
| Mesh3 | 5.403     | 100%     | 31%        | 22%          | 4%          |
| Mesh4 | 3.209     | 100%     | 63%        | 17%          | 3%          |
| **Total** | **19.430** | | | | |

Outros achados relevantes:

- `Organization Name/Title`: **0% preenchidos** — cargo/empresa não virão dessas bases.
- `Group Membership`: sempre `* myContacts` (grupo padrão do Google) — **não vira tag**.
- **Milhares de "nomes" são e-mails** (ex.: 2.446 no Mesh1) — o importador detecta,
  move o endereço para o campo de e-mail e deriva um nome legível do local-part.
- **Redes sociais** vêm nas colunas `Website N` com o `Type` indicando a rede:
  Instagram (6.033), Facebook (1.157), LinkedIn (267), X (1).
- **Telefones:** maioria já em E.164 (`+55…`), com variantes `55…`, `0XX…`, `00…`.
  Após normalização, 97–99% dos telefones resultam em E.164 válido.
- **Aniversários:** `AAAA-MM-DD` e o formato **sem ano** `--MM-DD` (90 casos no Mesh1) —
  o CRM guarda dia/mês separados para não perder esses aniversários.
- **Anomalia detectada:** 1 registro no Mesh2 com **800 telefones distintos** (linha
  corrompida na origem). O importador limita a 10 telefones por contato e registra aviso.

## Sobreposição entre as bases (dimensionamento da deduplicação)

Comparação por e-mail/telefone normalizados e nome exato (hash, sem exposição de dados):

- Mesh1 ∩ Mesh2: 0 identificadores comuns · 20 nomes exatos em comum
- Mesh1 ∩ Mesh3: 3 identificadores · 17 nomes
- Mesh1 ∩ Mesh4: 1 identificador · 11 nomes
- Mesh2 ∩ Mesh3: 0 identificadores · 26 nomes
- Mesh2 ∩ Mesh4: 0 identificadores · 13 nomes
- Mesh3 ∩ Mesh4: 1 identificador · 13 nomes
- Duplicados internos (mesmo nome no mesmo arquivo): 6–15 por arquivo

**Conclusão:** as 4 bases são **segmentos quase disjuntos** de uma mesma agenda
(~19.290 pessoas únicas em 19.430 registros). A deduplicação relevante acontece
principalmente **entre importações sucessivas** (por e-mail/telefone/nome), e não
dentro de cada arquivo. A estratégia padrão recomendada é **"Complementar dados"**.

## Calibração aplicada ao importador

1. Auto-mapeamento reconhece todos os cabeçalhos Google/Mesh acima (+ variantes em
   português e Outlook).
2. Colunas vazias são ocultadas do assistente (das 1.649, só as ~30 úteis aparecem).
3. Separador multivalor ` ::: ` tratado em e-mails e grupos.
4. `Website N - Value` é classificado pela coluna irmã `- Type` (LinkedIn/Instagram/
   Facebook/X) e gravado no campo certo.
5. Grupo `* myContacts` ignorado; demais grupos viram tags.
6. Telefones normalizados para E.164 (+55) com tratamento de `00`, `0XX` e DDDs.
7. Aniversários `--MM-DD` preservados como dia/mês.
8. Nome-que-é-e-mail: e-mail aproveitado + nome derivado.
9. Limite de 10 telefones/e-mails por contato (proteção contra a linha anômala).
10. Validação executada: **100% das 19.430 linhas** produzem contatos válidos.
