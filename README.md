# TakaFlow — Personal Finance Tracker Vault

A offline-capable **React + Supabase + Capacitor Android** personal finance tracker tailored for Bangladesh workflows (bKash, Nagad, Rocket, Cellfin, local banks, and Cash) alongside multi-currency (`BDT`, `USD`, `EUR`, `GBP`) wealth tracking.

---

## 📚 Developer Handover Pack

If you are onboarding to maintain or extend this codebase, start with these documents in order:

| Document | Purpose |
| :--- | :--- |
| [**`DOCUMENTATION.md`**](DOCUMENTATION.md) | Complete technical documentation: architecture, routes, DB schema (11 tables, RLS, PL/pgSQL triggers, 15 migrations), 4 Edge Functions, offline sync engine, Voice NLP + Gemini, Android native plugins, design system, and CI/CD. |
| [**`DIFFICULTIES.md`**](DIFFICULTIES.md) | Forensic & code-review audit of all current bugs, security risks (keystore, Gemini key, NotificationListener anti-scam gap), offline outbox data-loss bugs, non-atomic RPC gaps, schema drift, and ESLint/TS debt. |
| [**`TARGETS.md`**](TARGETS.md) | Day-1 onboarding checklist + prioritized `P0` → `P3` engineering targets with exact file scopes and Definition of Done. |
| [**`ROADMAP.md`**](ROADMAP.md) | Product backlog (`TKF-01` – `TKF-06`) & feature ideas. |
| [**`research.md`**](research.md) | Competitive analysis (BD & global market) and UX retention strategy. |

---

## Tech Stack

- **Web App**: Vite 5.4, React 18.3, TypeScript 5.8, Tailwind CSS, shadcn/ui (Radix), Framer Motion, Recharts
- **State & Offline Persistence**: TanStack Query v5 (`networkMode: "offlineFirst"`) + `localStorage` cache (`TAKAPERSIST_CACHE_V1`) & outbox queue (`TAKAPERSIST_OUTBOX_V1`)
- **Backend**: Supabase (Auth with 6-digit OTP, Postgres + RLS + Balance Triggers, 4 Deno Edge Functions)
- **Voice & SMS Intelligence**: Web Speech API (`bn-BD` / `en-US`), Bengali/Banglish deterministic parsers, Google Gemini fallback, BTRC Anti-Scam Sender Shield
- **Android Native**: Capacitor 8.5.3 with custom Java bridges ([`SmsReceiver`](android/app/src/main/java/com/takaflow/financetracker/SmsReceiver.java), [`TakaFlowNotificationListener`](android/app/src/main/java/com/takaflow/financetracker/TakaFlowNotificationListener.java), [`SmsReaderPlugin`](android/app/src/main/java/com/takaflow/financetracker/SmsReaderPlugin.java), [`AppUpdaterPlugin`](android/app/src/main/java/com/takaflow/financetracker/AppUpdaterPlugin.java))

---

## Local Development

> **Package Manager Note:** The repository currently contains `package-lock.json`, `bun.lock`, and `bun.lockb`. GitHub Actions CI uses `npm ci`. Use `npm` for consistency until extra lockfiles are removed.

```sh
npm install
cp .env.example .env
# Fill in values in .env (see Environment variables below)
npm run dev
```

Dev server runs on port `8080` (`http://localhost:8080`).

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

### Frontend (required in `.env` and Vercel)

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL (`https://rnzofkinmetxedimdbdv.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase **anon / publishable** public key |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project reference ID (`rnzofkinmetxedimdbdv`) |
| `VITE_GEMINI_API_KEY` | *(Optional — DEV ONLY)* Direct client Gemini key for voice fallback. **Warning:** Exposes key in Vite JS bundles; omit in production and use `GEMINI_API_KEY` inside Edge Functions instead. |

### Optional local / CLI

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Same as `VITE_SUPABASE_URL` (for CLI tooling) |
| `SUPABASE_PUBLISHABLE_KEY` | Same as anon key (for CLI tooling) |

### Supabase Edge Functions (Supabase Dashboard → Edge Functions → Secrets)

| Variable | Description |
|----------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — **never** expose in frontend |
| `LOVABLE_API_KEY` | API key for `ai-insights` & primary `ai-parse-voice` gateway |
| `GEMINI_API_KEY` | Server-side fallback key for `ai-parse-voice` |
| `RESEND_API_KEY` | API key for `send-reset-email` custom password reset emails |
| `ALLOWED_ORIGIN` | Production app URL for CORS (default: `https://takaflow-financetracker.vercel.app`) |

> **Security:** Never commit `.env` to git. See [`DIFFICULTIES.md`](DIFFICULTIES.md#2-security--secrets-vulnerabilities) regarding current keystore and client-side key findings before public release.

---

## Database Migrations

The authoritative schema lives across the **15 SQL files in `supabase/migrations/`** (note: [`supabase/schema.sql`](supabase/schema.sql) is missing `custom_categories` and `savings_goals` opening-balance columns; see [`DIFFICULTIES.md`](DIFFICULTIES.md#13-supabaseschemasql-is-out-of-sync-with-production-migrations)).

> **CLI Warning:** [`supabase/config.toml`](supabase/config.toml) currently sets a stale `project_id = "cpngaqkjvimrismpxoeg"` instead of `"rnzofkinmetxedimdbdv"`. Update `config.toml` or pass `--project-ref rnzofkinmetxedimdbdv` explicitly before pushing:

```sh
supabase db push
```

---

## Scripts & Verification Status

| Command | Description | Baseline Status (2026-11-10) |
|---------|-------------|------------------------------|
| `npm run dev` | Start Vite dev server (port `8080`) | Working |
| `npm run build` | Build production web bundle (`dist/`) | Passing (`3343` modules) |
| `npm run preview` | Preview production build | Working |
| `npm test` | Run Vitest unit suite (`vitest run`) | Passing (`101/101` across 8 test files) |
| `npm run test:watch` | Run Vitest in watch mode | Working |
| `npm run typecheck` | TypeScript typecheck of app + tooling configs (`strict: false`) | Passing (`0` errors) |
| `npm run lint` | Run ESLint across workspace | **Failing (`188` issues: `178` errors, `10` warnings)** — see [`DIFFICULTIES.md`](DIFFICULTIES.md#61-npm-run-lint-fails-with-188-issues-178-errors-10-warnings) |

---

## Android APK & CI/CD

### Build Android Locally
```sh
npm run build
npx cap sync android
cd android && ./gradlew assembleRelease
```

### Automated Pipelines
- **Web (Vercel)**: Uses [`vercel.json`](vercel.json) SPA rewrite (`/(.*) -> /index.html`). Set all `VITE_*` variables (except `VITE_GEMINI_API_KEY`) in Vercel Project Settings.
- **Android APK ([`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml))**: Runs on pushes/PRs to `main`. Executes `npm ci`, `npm test`, `npm run build`, copies `dist/` to Android assets, builds with Java 21 / SDK 35, signs `TakaFlow.apk` via `apksigner`, uploads CI artifact, and publishes a GitHub Release. *(See [`TARGETS.md`](TARGETS.md) `P0`/`P2` for CI dynamic versioning and keystore rotation steps.)*
