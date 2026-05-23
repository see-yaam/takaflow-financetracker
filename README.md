# TakaFlow — Personal Finance Tracker

A React + Supabase app for tracking wallets, transactions, budgets, savings goals, and debts.

## Tech stack

- Vite, React, TypeScript
- Tailwind CSS, shadcn/ui
- Supabase (Auth, Postgres, Edge Functions)
- TanStack Query

## Local development

```sh
npm install
cp .env.example .env
# Fill in values in .env (see Environment variables below)
npm run dev
```

## Environment variables

Copy `.env.example` to `.env` and set the following.

### Frontend (required)

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL (`https://<project-ref>.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase **anon** public key (safe for browser) |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project reference ID |

### Optional local / CLI

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Same as `VITE_SUPABASE_URL` (for CLI tooling) |
| `SUPABASE_PUBLISHABLE_KEY` | Same as anon key (for CLI tooling) |

### Supabase Edge Functions (set in Supabase Dashboard → Edge Functions → Secrets)

| Variable | Description |
|----------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — **never** expose in frontend |
| `LOVABLE_API_KEY` | API key for AI insights edge function |
| `RESEND_API_KEY` | API key for password reset emails |
| `ALLOWED_ORIGIN` | Production app URL for CORS (default: `https://takaflow-financetracker.vercel.app`) |

> **Security:** Never commit `.env` to git. Use `.env.example` as a template only.

## Database migrations

Apply migrations with the Supabase CLI:

```sh
supabase db push
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run tests |

## Deployment

Build with `npm run build` and deploy the `dist` folder (e.g. Vercel). Set all `VITE_*` variables in your hosting provider. Configure edge function secrets in Supabase.
