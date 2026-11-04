# Planejamento Estratégico 2027–2030

Aplicação web para tornar o planejamento estratégico da firma **vivo e navegável**: missão,
visão, valores e cultura → ambição 2030 (Big Five brasileira) → pilares → objetivos →
iniciativas → planos de ação 5W2H → check-ins; também áreas → pessoas, plano de cargos e
salários, carreira societária e valuation.

**Stack:** React + TypeScript + Vite · Tailwind · TanStack Query · Supabase (Postgres, Auth, RLS) · Netlify
— a mesma do Wulff CRM, para que os apps compartilhem login, cadastro de pessoas e hospedagem.

📊 **Scorecard 2026–2030 (quadro da diretoria, fórmulas e pendências):** [`docs/SCORECARD.md`](docs/SCORECARD.md)

📐 **Estrutura completa, modelo de dados, perfis, integração e roadmap:** [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)

---

## Ver rodando em 1 minuto (modo demonstração)

Sem configurar nada, o app abre em **modo demonstração**, com dados ilustrativos salvos só no
navegador. Uma faixa amarela no topo deixa isso visível e permite simular os perfis
Diretoria / Líder / Colaborador.

```bash
cd planejamento-estrategico
npm install
npm run dev          # http://localhost:5173
```

---

## Colocar online de verdade (~15 min)

### 1. Supabase (banco + login)

1. Use o **mesmo projeto Supabase** do CRM (recomendado, para compartilhar o cadastro) ou crie
   um novo em [supabase.com](https://supabase.com) (região São Paulo).
2. **SQL Editor → New query** → cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   O script é idempotente: pode ser rodado de novo sempre que o schema for atualizado.
   Em seguida, rode [`supabase/carga-scorecard-2026.sql`](supabase/carga-scorecard-2026.sql): ele cria o ciclo
   2027–2030 e o scorecard do quadro da diretoria (ano-base 2026). Também é idempotente e nunca apaga metas lançadas.
3. **Project Settings → API**: copie a *Project URL* e a chave *anon public*.
   ⚠️ Nunca use a chave `service_role` no front-end.

### 2. Netlify (hospedagem)

1. **Add new site → Import an existing project → GitHub** → escolha este repositório.
2. **Base directory:** `planejamento-estrategico` (o `netlify.toml` já define build e publish).
3. Variáveis de ambiente:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public
   - `VITE_EMPRESA_NOME` = nome exibido no app (padrão: `TaxCo`)
4. **Deploy.**

### 3. Primeiro acesso

1. Abra o site → **Criar conta**. O **primeiro usuário vira Diretoria**.
2. **Configurações → Criar ciclo 2027–2030.**
3. Cadastre **Áreas** e **Pessoas** (use o e-mail corporativo, porque é ele que liga o login à pessoa).
4. Convide os demais. Eles entram como Colaborador; em **Configurações → Usuários e perfis**,
   promova os líderes a *Líder de área* (e marque-os como líder na área correspondente).
5. Recomendado: em *Authentication → Settings* do Supabase, restrinja o cadastro (convites)
   para que só gente da firma consiga criar conta.

---

## Desenvolvimento

```bash
cp .env.example .env    # preencha para usar o Supabase; deixe vazio para modo demo
npm run dev
npm run build           # checagem de tipos + build de produção em dist/
```

Para **adicionar um campo** a qualquer entidade: coluna em `supabase/schema.sql` → tipo em
`src/data/types.ts` → linha em `src/data/campos.ts`. O formulário e a gravação são genéricos.

## Segurança e confidencialidade

- As permissões ficam no banco (**Row Level Security**), não só na interface.
- *Cargos e salários*, *Valuation* e o *histórico de alterações* são visíveis **apenas para a Diretoria**.
- Toda alteração no plano fica registrada em `pe_historico` (quem, quando, o quê).
