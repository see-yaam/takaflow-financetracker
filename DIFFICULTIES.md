# TakaFlow — Technical Difficulties, Bugs & Forensic Audit

> **Prepared for Incoming Lead Engineer** · **Audit Date:** 2026-11-10 · **Severity Scale:** `CRITICAL` · `HIGH` · `MEDIUM` · `LOW`  
> **Scope:** Forensics across post-`5dcd55e` (`v1.0.7`) updates, React/TanStack offline outbox, Supabase schema/Edge Functions, Android native bridge, security hygiene, and tooling.

---

## P0 Status (branch `fix/p0-stabilization`, 2026-11-11)

| Item | Status | Proof |
| :--- | :--- | :--- |
| §3.2 Badge `clearOutbox()` / §3.4 silent drops / stuck "1 pending" | Fixed | `src/test/offlineSync.test.ts` (failed items kept + Sync Issues dialog) |
| §3.3 Sign-out wipes queue | Fixed (owner-scoped queue; explicit discard only) | `src/test/authSignOut.test.tsx` |
| §3.5 Offline reverse balance | Fixed | `offlineSync.test.ts` "reversing a synced transaction offline…" |
| §3.6 `useUpdateWallet` silent drop | Fixed (no fake success; queued wallets edited in place). Full offline queue = P1-03 | — |
| §3.1 Native queue cleared before JS commit + double logging | Fixed (two-phase ack, `PendingSmsStore`, dedupe) | `src/test/smsIngest.test.ts`, device checklist |
| §2.3 Notification anti-scam bypass | Fixed (+ `BROADCAST_SMS` on receiver) | `SenderShieldTest.java` (CI), `smsIngest.test.ts` |
| §2.1 Keystore in git | Removed from tracking; signing only from GitHub Secrets; key rotated (no lineage) | CI step summary cert |
| §2.2 `VITE_GEMINI_API_KEY` | Client path removed; Edge Function only (CORS now admits the APK) | `src/test/edgeCors.test.ts` |
| §2.4 Reset >50 users / CORS / sender | Fixed (paginated lookup, rate limit, atomic token claim, `RESEND_FROM`) | `src/test/findUserByEmail.test.ts` — verified domain still required for arbitrary recipients |
| §4.3–4.7 Rollover, reversed tx, recurring, drawer, reset | Fixed | `financeMath.test.ts`, `recurring.test.tsx`, `addTransactionDrawer.test.tsx` |
| §1.2–1.4 config.toml, schema.sql, lockfiles | Fixed (+ FK migration `20261111120000_user_fk_cascade.sql`) | — |

Corrections to the original audit: `npx tsc --noEmit` never type-checked anything (root `files: []`); the real check (`npm run typecheck`) found 9 errors, now fixed. The Vite timestamp file *was* committed (in `2a5a719`); it is now removed and ignored. There is no "Quick Demo Login" in `Login.tsx`.

---

## Executive Risk Summary

While **TakaFlow** has an impressive feature set (`101/101` Vitest unit tests pass and Vite builds cleanly), the repository has **critical structural, offline-sync, security, and transactional atomicity flaws** that explain real user-facing pain points—including transactions stuck `"1 pending"` while online, silent data loss during sync/sign-out/SMS ingest, and broken multi-step mutations.

| Severity | Count | Primary Theme |
| :--- | :---: | :--- |
| **CRITICAL** | 3 | Silent loss of captured SMS/notifications, destructive outbox wipe in `OfflineSyncBadge`, destructive `SignOut` clearing outbox |
| **HIGH** | 12 | Post-`5dcd55e` WIP bundled without version bump, tracked Android keystore + plaintext passwords, client-exposed Gemini key, `NotificationListener` Anti-Scam bypass, broken Edge Function `listUsers()` (>50 users), wrong `supabase/config.toml` project ID, broken offline reverse cache lookup, silent 3-retry outbox drops, non-atomic client writes, missing cross-currency transfer logic |
| **MEDIUM** | 9 | Month rollover balance math bug, `is_reversed` omitted in metrics, exact `day_of_month` recurring skip bug, `AddTransactionDrawer` form reset on `wallets` refetch, `schema.sql` & FK drift, Play Store blocked permissions, Gradle AAR bypass hack, hardcoded `v1.0.7` CI release, base64 avatars in JWT metadata |
| **LOW / DEBT** | 7 | 188 ESLint errors, TS strict mode disabled, 3 competing lockfiles, 0 Playwright specs, large main JS bundle (`786 kB`), missing PWA manifest/SW, unused `useStreaks` / `StreakBadge` |

---

## 1. Immediate Handover Blockers & Config Mismatches

### `[HIGH]` 1.1 Bundled Post-`v1.0.7` Fixes Pushed Without Version Bump / Full Isolation Review
- **Evidence**: Ahead of baseline tag commit `5dcd55e` (`v1.0.7`), 27 files across `android/` (3), `src/` (21), and `src/test/` (3) were bundled onto `main` during handover without bumping `versionName`/`versionCode` in [`android/app/build.gradle`](android/app/build.gradle#L10-L11) or `.github/workflows/build-apk.yml`. Locally, an ignored temp file `vite.config.ts.timestamp-*.mjs` also existed (excluded from git commits).
- **Impact**: `main` now triggers `.github/workflows/build-apk.yml` reusing `tag_name: v1.0.7` while containing changed offline sync, `select.tsx` z-index, drawer quick-add wallet, `MainActivity.java`, and `TakaFlowNotificationListener.java` code that still needs full code review per Section 2–4 below.
- **Resolution**: Review the handover commit diff line-by-line, separate future fixes into scoped PRs/commits, bump `versionCode`/`versionName` (`1.0.8+`), and ignore `vite.config.ts.timestamp-*.mjs` in `.gitignore`.

### `[HIGH]` 1.2 `supabase/config.toml` Targets Wrong Supabase Project ID & Omits `ai-parse-voice`
- **Evidence**: [`supabase/config.toml:1`](supabase/config.toml#L1) sets `project_id = "cpngaqkjvimrismpxoeg"` (legacy project ref), whereas `.env`, [`src/integrations/supabase/client.ts:13`](src/integrations/supabase/client.ts#L13), and [`.github/workflows/build-apk.yml:18-20`](.github/workflows/build-apk.yml#L18-L20) all point to `rnzofkinmetxedimdbdv`. Furthermore, `config.toml` has no `[functions.ai-parse-voice]` block.
- **Impact**: Running `supabase db push`, `supabase functions deploy`, or `supabase gen types` links against the wrong/stale project ID unless overridden manually.

### `[MEDIUM]` 1.3 `supabase/schema.sql` Is Out of Sync with Production Migrations
- **Evidence**:
  - `custom_categories` exists in [`supabase/migrations/20260716164353_aff8c202-809e-45ee-b88b-beadd2fc9f62.sql`](supabase/migrations/20260716164353_aff8c202-809e-45ee-b88b-beadd2fc9f62.sql) and is actively queried by [`src/hooks/useCustomCategories.ts:29`](src/hooks/useCustomCategories.ts#L29), yet is **absent from [`supabase/schema.sql`](supabase/schema.sql)**.
  - `savings_goals.opening_balance` and `savings_goals.has_opening_balance` were added in [`20260702111607...sql`](supabase/migrations/20260702111607_75427c3b-9b00-441d-a74d-774a0617d2d2.sql) and are missing from [`supabase/schema.sql:89-99`](supabase/schema.sql#L89-L99).
  - 7 tables (`monthly_snapshots`, `savings_goals`, `recurring_transactions`, `debts`, `debt_payments`, `debt_additions`, `custom_categories`) define `user_id UUID NOT NULL` **without** `REFERENCES auth.users(id) ON DELETE CASCADE`.
- **Impact**: Recreating a clean staging database from `schema.sql` breaks Categories & Goals immediately, and deleting an auth user leaves orphaned financial rows in those 7 tables.

### `[LOW]` 1.4 Three Competing Package Lockfiles in Repo Root
- **Evidence**: Root simultaneously contains `package-lock.json` (~346 KB), `bun.lock` (~166 KB), and `bun.lockb` (~247 KB). CI uses `npm ci` ([`.github/workflows/build-apk.yml:35`](.github/workflows/build-apk.yml#L35)).
- **Impact**: Dependency upgrades performed with `bun` or `npm` drift out of sync between developer machines and CI.

---

## 2. Security & Secrets Vulnerabilities

### `[HIGH]` 2.1 Android Signing Keystore Committed to Git with Hardcoded Passwords
- **Evidence**:
  - `android/app/release.keystore` is tracked by Git (`git ls-files android/app/`).
  - [`android/app/build.gradle:20-27`](android/app/build.gradle#L20-L27) and [`.github/workflows/build-apk.yml:104`](.github/workflows/build-apk.yml#L104) hardcode `storePassword`, `keyPassword`, and `keyAlias` in plaintext.
  - [`android/app/build.gradle:30-32`](android/app/build.gradle#L30-L32) also assigns `signingConfigs.release` to `buildTypes.debug`.
- **Impact**: Anyone with read access to the GitHub repository can extract the private signing key, sign trojanized APKs as `com.takaflow.financetracker`, and even trigger TakaFlow's updater or replace upgrades on user devices.

### `[HIGH]` 2.2 Client-Side Exposure of Google Gemini API Key (`VITE_GEMINI_API_KEY`)
- **Evidence**: [`src/lib/aiVoiceParser.ts:30-38, 105-125`](src/lib/aiVoiceParser.ts#L30-L125) reads `import.meta.env.VITE_GEMINI_API_KEY` and calls `https://generativelanguage.googleapis.com/v1beta/models/...` directly from the browser/APK *before* falling back to the authenticated Edge Function `ai-parse-voice`. Local `.env` defines `VITE_GEMINI_API_KEY`.
- **Impact**: Any `VITE_*` variable is compiled verbatim into Vite's public JS bundle (`dist/assets/*.js`) and embedded inside every distributed APK, exposing the quota/billing key to extraction and abuse.

### `[HIGH]` 2.3 `TakaFlowNotificationListener` Bypasses Anti-Scam Shield & Defaults Unknown Senders to `"bKash"`
- **Evidence**:
  - [`SmsReceiver.java:74-86`](android/app/src/main/java/com/takaflow/financetracker/SmsReceiver.java#L74-L86) strictly blocks `PERSONAL_PHONE_PATTERN` (`01[3-9]...`) and requires `OFFICIAL_BANK_PATTERN`.
  - Conversely, [`TakaFlowNotificationListener.java:109-124, 136-160`](android/app/src/main/java/com/takaflow/financetracker/TakaFlowNotificationListener.java#L109-L160) monitors generic SMS messaging apps (`com.google.android.apps.messaging`, `com.samsung.android.messaging`, `com.miui.mms`, etc.) and **never checks `PERSONAL_PHONE_PATTERN` or official bank masks**.
  - Even worse, if the SMS sender/title isn't recognized (e.g., notification title is `"Unknown"` or formatted unexpectedly), [`resolveSender()` line 159](android/app/src/main/java/com/takaflow/financetracker/TakaFlowNotificationListener.java#L159) returns `"bKash"` as fallback. That synthetic `"bKash"` header then satisfies [`isOfficialFinancialSender("bKash")`](src/lib/smsParser.ts#L157) inside [`useAutoSmsSync.ts:67`](src/hooks/useAutoSmsSync.ts#L67).
- **Impact**: A scammer texting from an ordinary `+88017...` SIM via Google/Samsung Messages (or even a WhatsApp message mentioning "Tk 5000 received" if not filtered carefully) triggers a notification that bypasses TakaFlow's Anti-Scam Shield and auto-logs fraudulent income/expense rows into the user's ledger.

### `[HIGH]` 2.4 Password Reset Edge Functions Fail Above 50 Users, Lack Rate Limiting & Use Sandbox Sender
- **Evidence**:
  - [`send-reset-email/index.ts:118`](supabase/functions/send-reset-email/index.ts#L118) and [`verify-reset-token/index.ts:65`](supabase/functions/verify-reset-token/index.ts#L65) call `supabase.auth.admin.listUsers()` with default pagination (`perPage = 50`). Once the auth table exceeds 50 registered users, user #51+ silently fails to receive reset links or gets `"User not found"` even with a valid token.
  - [`send-reset-email/index.ts:165`](supabase/functions/send-reset-email/index.ts#L165) sends from `"TakaFlow <onboarding@resend.dev>"` (Resend sandbox sender, which Resend restricts to the account owner's verified email unless a custom domain is verified) and hardcodes [`https://takaflow-financetracker.vercel.app`](supabase/functions/send-reset-email/index.ts#L156).
  - Both functions disable JWT verification (`verify_jwt = false` in `config.toml`), set `Access-Control-Allow-Origin: *`, and implement zero IP/email rate limiting or expired-token cleanup.

### `[MEDIUM]` 2.5 Base64 Avatars Stored Inside Supabase Auth `user_metadata`
- **Evidence**: [`ProfilePhotoCropperModal.tsx:110-141`](src/components/ProfilePhotoCropperModal.tsx#L110-L141) exports a `360x360` JPEG data URL and [`ProfilePage.tsx:148-153`](src/pages/ProfilePage.tsx#L148-L153) writes the raw base64 string into `supabase.auth.updateUser({ data: { avatar_url } })`.
- **Impact**: `user_metadata` is embedded directly inside Supabase JWT access tokens and `localStorage` session payloads (adding ~15–60 KB per request header), increasing latency, mobile battery usage, and session storage bloat instead of storing images in a Supabase Storage bucket.

---

## 3. Critical Offline Sync, Native Bridge & State Corruption Bugs

### `[CRITICAL]` 3.1 `SmsReaderPlugin.getPendingSms()` Destructively Clears Native Queue Before Processing
- **Evidence**:
  - [`SmsReaderPlugin.java:38-39`](android/app/src/main/java/com/takaflow/financetracker/SmsReaderPlugin.java#L38-L39) immediately overwrites `pending_transactions` in `SharedPreferences` to `"[]"` when returning messages to JS.
  - Meanwhile in JS, [`useAutoSmsSync.ts:59-63`](src/hooks/useAutoSmsSync.ts#L59-L63) calls `getPendingSms()` **before** checking `if (!wallets || wallets.length === 0) return;` and before `await createTx.mutateAsync(...)` (lines 82–89).
- **Impact**: If `getPendingSms()` fires on mount/focus while `useWallets()` is still loading (or if `createTx` throws a validation/session error), JS exits early while native Android has **already erased** the captured SMS/notification events. Those financial alerts are permanently lost.

### `[CRITICAL]` 3.2 Clicking `OfflineSyncBadge` Silently Deletes Unsynced Transactions (`clearOutbox()`)
- **Evidence**: [`OfflineSyncBadge.tsx:50-61`](src/components/OfflineSyncBadge.tsx#L50-L61):
  ```ts
  const synced = await processOutboxSync(qc, true);
  const remaining = getOutbox().length;
  if (synced > 0) { ... }
  else if (remaining > 0) {
    // If cloud already received it or item was un-syncable, auto-clear to prevent stuck badge
    clearOutbox();
    toast.success("Pending queue cleared & synced! ☁️✨");
  }
  ```
- **Impact**: If the user taps `"1 pending"` while experiencing a momentary network timeout, expired/refreshing JWT, or backend rejection, `processOutboxSync` returns `0` while items still remain in the queue. The badge assumes they were "already synced", calls `clearOutbox()`, falsely shows `"Pending queue cleared & synced!"`, and **permanently destroys unsynced financial entries** from `localStorage`.

### `[CRITICAL]` 3.3 Regular "Sign Out" Wipes Pending Offline Outbox Despite Warning UI
- **Evidence**: [`SignOutConfirmDialog.tsx:67-75`](src/components/SignOutConfirmDialog.tsx#L67-L75) presents both a standard `"Sign Out"` button (`handleConfirmSignOut`) and an explicit `"Discard offline changes & Sign Out anyway"` action (`handleDiscardAndSignOut`). Yet both invoke `onConfirm()` -> [`AuthContext.signOut()`](src/contexts/AuthContext.tsx#L89-L115), which **unconditionally executes `clearOfflineCache()`** (deleting `TAKAPERSIST_OUTBOX_V1` & `TAKAPERSIST_CACHE_V1`) and removes all `TAKAPERSIST_*` localStorage keys!
- **Impact**: Clicking normal `"Sign Out"` (expecting local outbox changes to be preserved until next sign-in) silently deletes unsynced transactions.

### `[HIGH]` 3.4 Why `"1 pending"` Stays Stuck Even With Internet (Root Cause Investigation)
Users reported seeing the amber `"1 pending"` badge persistently in the sidebar/header even while online (observed directly in user screenshots). Audit reveals four distinct failure loops in [`offlineSync.ts`](src/lib/offlineSync.ts) + [`useTransactions.ts`](src/hooks/useTransactions.ts):
1. **Incomplete Auto-Cleanup on Fetch**: [`useTransactions.ts:56-65`](src/hooks/useTransactions.ts#L56-L65) and [`useWallets.ts:37-47`](src/hooks/useWallets.ts#L37-L47) only auto-prune `CREATE_TRANSACTION` and `CREATE_WALLET` outbox items already present in Supabase. If a `DELETE_TRANSACTION`, `REVERSE_TRANSACTION`, or `DELETE_WALLET` item gets queued (or if `CREATE_TRANSACTION` had a transient timeout after server receipt without matching client UUID), it remains in `TAKAPERSIST_OUTBOX_V1`.
2. **Missing Background Triggers on Delete/Reverse**: Unlike `handleOfflineCreateTransaction` and `handleOfflineCreateWallet`, [`handleOfflineDeleteTransaction`](src/lib/offlineSync.ts#L230-L277) and [`handleOfflineReverseTransaction`](src/lib/offlineSync.ts#L279-L302) **do not call `processOutboxSync(qc)`** even when `navigator.onLine` is `true`, leaving `"1 pending"` sitting until the 10s interval ticks or focus changes.
3. **Aggressive `withTimeout` Races & Session Recovery Edge Cases**: `supabase.auth.getSession()` is capped at `6000ms` and inserts at `4000–10000ms` ([`offlineSync.ts:428, 522, 592, 609`](src/lib/offlineSync.ts#L379-L610)). On slow mobile networks or cold edge/TLS wakeups, the client rejects with `"Operation timed out"`, keeps the item pending for another cycle, or runs out of retries. Meanwhile `localStorage` fallback searches `sb-*-auth-token` without checking expiry—if JWT refresh fails offline/flaky, PostgREST returns `42501` RLS violation or `401`.
4. **Silent Discard Without Dead-Letter Recovery**: On the opposite extreme, when a PostgREST constraint/RLS error (`42501`, `23503`, `23505`, `PGRST*`), any non-network error, or `attempts >= 3` occurs ([`offlineSync.ts:550, 613-632, 650, 671, 692, 703`](src/lib/offlineSync.ts#L550-L706)), `processOutboxSync` executes `console.warn(...); continue;`, permanently dropping the user's queued mutation with **zero toast or UI error**.

### `[HIGH]` 3.5 `handleOfflineReverseTransaction` Fails to Restore Wallet Balance
- **Evidence**: [`src/lib/offlineSync.ts:282`](src/lib/offlineSync.ts#L282):
  ```ts
  const allTx = qc.getQueryData<any[]>(["transactions"]);
  ```
  However, [`useTransactions.ts:21`](src/hooks/useTransactions.ts#L21) caches queries under keyed arrays `["transactions", user?.id, filters]` (unlike [`handleOfflineDeleteTransaction`](src/lib/offlineSync.ts#L247), which correctly uses `qc.getQueriesData({ queryKey: ["transactions"] })`).
- **Impact**: `allTx` is always `undefined`, so reversing a transaction offline marks `is_reversed: true` visually while **never restoring the optimistic wallet balance** until online refetch occurs.

### `[HIGH]` 3.6 Partial Offline Coverage Across App Features
- [`OutboxActionType`](src/lib/offlineSync.ts#L8-L13) only covers 5 actions (`CREATE/DELETE/REVERSE_TRANSACTION`, `CREATE/DELETE_WALLET`).
- [`useUpdateWallet`](src/hooks/useWallets.ts#L200-L209): Updates cache optimistically offline, checks `if (!navigator.onLine) return;`, and **swallows network errors** without ever adding an `UPDATE_WALLET` action to the outbox — renames/balance edits made offline silently disappear on next sync!
- Modules with **zero offline queue support** (fail immediately or throw when offline): `Debts` (`useDebts.ts`), `Goals` (`useSavingsGoals.ts`), `Monthly Budget` (`useBudgetGoals.ts`), `Recurring Rules` (`useRecurringTransactions.ts`, including toggling "Repeat every month?" in `AddTransactionDrawer.tsx:133-143`), `Custom Categories` (`useCustomCategories.ts`), `EditCategoryDialog` (`useUpdateTransactionCategory`), and `Wallet Transfers` (`SettingsTransferSection.tsx`, `InsufficientBalanceModal.tsx`).
- Furthermore, [`useTransactions.ts:152-158`](src/hooks/useTransactions.ts#L152-L158) has a `toast.info("Saved offline...")`, yet `processOutboxSync` or `handleOfflineCreateTransaction` sets `_isOfflinePending: true`; mixed paths in `useWallets` / `useTransactions` inconsistently invalidate `["wallets"]` and `["transactions"]` right after offline writes (sometimes causing transient refetch failures in devtools).

---

## 4. Backend Atomicity, Financial Math & UI Logic Flaws

### `[HIGH]` 4.1 Non-Atomic Multi-Step Client Writes Risk Ledger Corruption
Multiple workflows issue 2–4 sequential REST calls from the browser instead of a single PostgreSQL transaction (RPC):
- **Wallet Transfers** ([`SettingsTransferSection.tsx:41-52`](src/components/settings/SettingsTransferSection.tsx#L41-L52) and [`InsufficientBalanceModal.tsx:121-140`](src/components/InsufficientBalanceModal.tsx#L121-L140)): Debits source wallet with `UPDATE wallets`, then credits target wallet with a second `UPDATE wallets`. If call #2 (or the subsequent expense insert) fails due to network drop or RLS, money vanishes from the source wallet with no rollback and zero transfer audit trail in `transactions`.
- **Debt Payments** ([`useDebts.ts:140-171`](src/hooks/useDebts.ts#L140-L171)): Executes 3 sequential writes (`debt_payments` insert -> `debts` update -> `transactions` insert). Failure mid-way leaves `debt_payments` recorded without adjusting wallet balance or `debts.remaining_amount`.
- **Debt Creation & Additions** ([`useDebts.ts:71-94, 230-255`](src/hooks/useDebts.ts#L71-L255)): Inserts `debts`/`debt_additions`, then `transactions`. Also uses absolute `remaining_amount` client calculations rather than SQL atomic increments (risking stale-cache overwrite under concurrent edits).
- **Savings Goal Deposit** ([`useSavingsGoals.ts:81-107`](src/hooks/useSavingsGoals.ts#L81-L107)): Inserts expense transaction -> fetches `savings_goals.saved_amount` -> computes `newSaved` in JS -> updates `savings_goals` (read-modify-write race condition + partial failure leaves wallet debited without goal credit).

### `[HIGH]` 4.2 Cross-Currency Transfer Corruption & Hardcoded `৳` Formatting
- **Broken Multi-Currency Transfer**: Neither [`SettingsTransferSection.tsx:38-39`](src/components/settings/SettingsTransferSection.tsx#L38-L39) nor [`InsufficientBalanceModal.tsx:118-119`](src/components/InsufficientBalanceModal.tsx#L118-L119) checks wallet `currency` (`USD`, `EUR`, `GBP`, `BDT`)! Transferring `100` from a `USD` wallet into a `BDT` wallet subtracts `$100` and adds `৳100` instead of converting via FX rates.
- **Hardcoded Currency Symbols**: [`SettingsWalletsSection.tsx:89`](src/components/settings/SettingsWalletsSection.tsx#L89) renders `৳{Number(w.balance)...}` even when the wallet's currency badge says `USD`/`EUR`/`GBP`. [`Dashboard.tsx:442`](src/pages/Dashboard.tsx#L442) similarly hardcodes `৳` on every recent transaction row regardless of its wallet's currency.

### `[MEDIUM]` 4.3 `useMonthRollover` Computes Wrong `opening_balance` & Counts Reversed Transactions
- **Evidence**: [`src/hooks/useMonthRollover.ts:45-50`](src/hooks/useMonthRollover.ts#L45-L50):
  ```ts
  const totalIncome = walletTxs.filter((t) => t.type === "income").reduce(...);
  const totalExpense = walletTxs.filter((t) => t.type === "expense").reduce(...);
  const openingBalance = Number(w.balance) - totalIncome + totalExpense;
  ```
- **Two Bugs**:
  1. `w.balance` is the **current live balance today** (which already includes all transactions in the *current* month, not the balance at the end of `prevMonth`!). Unless rollover runs at `00:00` on day 1 before any current-month activity, subtracting only `prevMonth` net delta yields an inaccurate `opening_balance`.
  2. Unlike `Dashboard.tsx:131`, lines 46–48 fail to exclude `t.is_reversed === true`, inflating both `total_income` and `total_expense` snapshots in `Reports`.

### `[MEDIUM]` 4.4 `is_reversed` Also Omitted in `GoalsPage` & `useStreaks`
- **Evidence**: [`GoalsPage.tsx:32-33`](src/pages/GoalsPage.tsx#L32-L33) sums `monthIncome` and `monthExpense` across `monthTx` without `.filter((t) => !t.is_reversed)` (skewing `avgMonthlySavings` & goal completion projections). [`useStreaks.ts:46-48`](src/hooks/useStreaks.ts#L46-L48) has the same omission.

### `[MEDIUM]` 4.5 `useApplyRecurring` Permanently Skips Missed Days / Short Months / Offline Days
- **Evidence**: [`useRecurringTransactions.ts:61-68`](src/hooks/useRecurringTransactions.ts#L61-L68) queries `.eq("day_of_month", dayOfMonth)` only when `Dashboard` mounts.
- **Impact**: If a user has a recurring salary/rent rule on the `5th` and opens the app on the `6th` (or was offline on the `5th`, or set day `31` in a 30-day month / February), that month's recurring transaction is **never created**.

### `[MEDIUM]` 4.6 `AddTransactionDrawer` Form Resets Mid-Typing on `wallets` Background Refetch
- **Evidence**: [`AddTransactionDrawer.tsx:58-70`](src/components/AddTransactionDrawer.tsx#L58-L70) includes `wallets` in its `useEffect` reset dependency array (`[open, defaultType, defaultDate, wallets]`).
- **Impact**: If `useWallets()` refreshes in the background (on window focus, 10s sync completion, or inline `+ New` quick-add wallet creation) while the drawer is open, all unsaved inputs (`amount`, `category`, `note`, `recurring`, `walletId`) abruptly reset to blank/`wallets[0]`. _(Note: uncommitted local changes already added `z-[100]` to [`select.tsx:69`](src/components/ui/select.tsx#L69) and [`AddTransactionDrawer.tsx:286`](src/components/AddTransactionDrawer.tsx#L286) to fix an earlier dropdown overlap bug inside Dialogs.)_

### `[MEDIUM]` 4.7 Danger Zone "Reset Account" Leaves `custom_categories` Behind
- **Evidence**: [`ProfilePage.tsx:341-351`](src/pages/ProfilePage.tsx#L341-L351) deletes 9 tables during `handleResetAccount`, omitting `"custom_categories"`. And after deletion + sign-out, `useCustomCategories` will re-seed 3 defaults (`Food`, `Home Rent`, `Transport`) only if the array is empty.

---

## 5. Android Native Build & Play Store Hurdles

### `[MEDIUM]` 5.1 Google Play Store Policy Conflicts in `AndroidManifest.xml`
- **Evidence**: [`AndroidManifest.xml:8-10`](android/app/src/main/AndroidManifest.xml#L8-L10) declares:
  - `RECEIVE_SMS` & `READ_SMS` (restricted by Google Play unless the app is the user's default SMS handler or meets narrow exemptions — consumer finance trackers are routinely rejected).
  - `REQUEST_INSTALL_PACKAGES` (required by [`AppUpdaterPlugin.java`](android/app/src/main/java/com/takaflow/financetracker/AppUpdaterPlugin.java), strictly prohibited on Google Play in favor of Play In-App Updates).
- **Impact**: Current APK works for GitHub Releases sideloading, **not Google Play Store submission** unless split into two Gradle product flavors (`direct` vs `playStore`).

### `[MEDIUM]` 5.2 Gradle `aarmetadata` Task Workaround & Manual Asset Copy in CI
- **Evidence**:
  - [`android/app/build.gradle:62-66`](android/app/build.gradle#L62-L66) disables every Gradle task matching `"aarmetadata"` (`task.enabled = false`) to silence Capacitor 8 / `androidx.core:1.17.0` metadata version mismatches against `compileSdk 35` / `targetSdk 34`.
  - [`.github/workflows/build-apk.yml:57-58`](.github/workflows/build-apk.yml#L57-L58) runs `cp -r dist/* android/app/src/main/assets/public/` instead of `npx cap sync android`, meaning native plugin registrations or `capacitor.config.ts` updates are skipped in CI unless pre-synced and committed locally.
  - [`.github/workflows/build-apk.yml:137`](.github/workflows/build-apk.yml#L137) hardcodes `tag_name: v1.0.7` and static release title/body on every push to `main`, overwriting the `v1.0.7` release instead of reading `versionName` or git tags, while [`UpdateCheckerModal.tsx:55,69`](src/components/UpdateCheckerModal.tsx#L55-L69) still falls back to `"1.0.6"`.

### `[MEDIUM]` 5.3 Android OEM Battery Optimizations & WebView Speech API Dependency
- **OEM Kill Risk**: Xiaomi (MIUI/HyperOS), Oppo/Realme (ColorOS), Vivo, Samsung, and Tecno/Infinix kill background `NotificationListenerService` processes aggressively unless Battery Optimization exclusion is requested and guidance is surfaced to users.
- **Voice Fragility**: [`useSpeechRecognition.ts`](src/hooks/useSpeechRecognition.ts) depends on Chromium WebView's `SpeechRecognition` backed by Google App Speech Services. On Huawei/de-Googled devices, offline states, or older Android WebViews, voice recognition fails or stalls at the 1.6s silence cutoff.

---

## 6. Code Quality, Tooling & Product Debt

### `[LOW]` 6.1 `npm run lint` Fails with 188 Issues (178 Errors, 10 Warnings)
Verified on 2026-11-10: `eslint .` exits with code `1`:
- **Dominant error (~165+)**: `@typescript-eslint/no-explicit-any` across `src/hooks/*`, `src/pages/*`, `src/components/*`, `src/lib/*`, `src/test/*`, and `supabase/functions/ai-parse-voice/index.ts`.
- **`no-empty` block errors**: `OfflineSyncBadge.tsx:33`, `ProtectedRoute.tsx:31`, `SignOutConfirmDialog.tsx:61, 71`, `Onboarding.tsx:79` (plus similar empty `catch {}` blocks flagged elsewhere).
- **Other**: `@typescript-eslint/no-empty-object-type` in [`src/components/ui/command.tsx:24`](src/components/ui/command.tsx#L24), `react-hooks/exhaustive-deps` warning in [`SettingsAutoTrackingSection.tsx:22`](src/components/settings/SettingsAutoTrackingSection.tsx#L22), and `react-refresh/only-export-components` warnings in shadcn UI wrappers.

### `[LOW]` 6.2 Loose TypeScript Configuration & Unsafe `as any` Casts
[`tsconfig.json`](tsconfig.json) & [`tsconfig.app.json`](tsconfig.app.json) set `strict: false`, `noImplicitAny: false`, `strictNullChecks: false`. Hooks like `useDebts.ts` cast `.from("debts" as any)` bypassing generated Supabase types.

### `[LOW]` 6.3 Missing Dedicated `/transactions` Ledger Page, Export & Onboarding Cleanup
- [`Dashboard.tsx:424`](src/pages/Dashboard.tsx#L424) only displays `transactions.slice(0, 10)` for the current month; there is **no dedicated searchable/filterable `/transactions` route** or CSV/PDF export (`TKF-02` in `ROADMAP.md`).
- ~~[`Login.tsx`](src/pages/Login.tsx) still contains a `"Quick Demo Login"` UX check/flow~~ — verified 2026-11-11: no demo login or auth bypass exists anywhere in `src/` or `supabase/` (the static "Interactive Demo" preview on `LandingPage.tsx` is intentional).
- **No PWA Service Worker / Web Manifest** (`vite-plugin-pwa`): Web users lose offline HTML/JS shell loading (unlike the Capacitor APK which bundles `dist/`).
- **Large Main Bundle**: `dist/assets/index-*.js` is **786.27 kB** (`232.55 kB` gzip) because vendor libraries (React, Supabase, Framer Motion, Zod, Radix) aren't split via Vite `manualChunks`.
- **Unused / Dead Code**: [`src/hooks/useStreaks.ts`](src/hooks/useStreaks.ts) and [`src/components/StreakBadge.tsx`](src/components/StreakBadge.tsx) exist in the repo alongside [`src/components/settings/SettingsAccountSection.tsx`](src/components/settings/SettingsAccountSection.tsx) & `SettingsDangerZone.tsx`, which were largely superseded by [`ProfilePage.tsx`](src/pages/ProfilePage.tsx).
- **Zero E2E Test Specs**: `playwright.config.ts` exists (`@playwright/test@^1.57.0`), yet zero `.spec.ts` files are implemented.
- **Auth Rate Limits**: Supabase default free-tier SMTP caps signup OTPs at **3 emails/hour**, blocking multi-user onboarding demos unless Resend/Brevo/SendGrid custom SMTP is attached in Supabase Auth settings.

