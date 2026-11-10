# 🗺️ TakaFlow — Product Roadmap & Feature Brainstorm

> **Document Version:** 1.1.0 (Synced 2026-11-10)  
> **Status:** Active Product Backlog  
> **Developer Execution Plan & Critical Fixes:** See [**`TARGETS.md`**](TARGETS.md) & [**`DIFFICULTIES.md`**](DIFFICULTIES.md) for prioritized bug fixes (`P0`/`P1`) before building new product features below. Full current-state technical specs live in [**`DOCUMENTATION.md`**](DOCUMENTATION.md).

---

## 🧭 Executive Summary

**TakaFlow** is designed to be the premier, high-aesthetic personal finance tracker tailored for the modern Bangladeshi and global user. It bridges the gap between complex spreadsheet accounting and effortless everyday financial discipline.

---

## 📊 Current System Audit (What Exists Today — Verified `v1.0.7+`)

| Module | Core Features Implemented | Current State & Caveats |
| :--- | :--- | :--- |
| **Authentication** | Email & Password, 6-digit OTP verification, custom token password reset (`Resend`), friendly error mapping | ⚠️ Functional — `send-reset-email` & `verify-reset-token` have a `>50` users `listUsers()` bug + sandbox sender ([`DIFFICULTIES.md`](DIFFICULTIES.md#24-password-reset-edge-functions-fail-above-50-users-lack-rate-limiting--use-sandbox-sender)) |
| **Profile & Security** | Display name, Facebook-style pan/zoom/rotate circular avatar cropper with iPhone HEIC conversion, OTP email change, password verify, Account Reset | ⚠️ Functional — Avatars stored as base64 in `user_metadata` JWT; Reset misses `custom_categories` |
| **Dashboard** | Hero Net Worth in ৳ (with `BDT`/`USD`/`EUR`/`GBP` live FX), **Spy Privacy Mode** (hold-to-peek + haptic), mobile horizontal wallet carousel, quick action grid, active month summary, recent 10 tx | ⚠️ Functional — Recent row formatting hardcodes `৳` on some displays |
| **Voice AI Assistant** | Press-and-hold Walkie-Talkie / Tap mic (`bn-BD`/`en-US`), Bengali/Banglish deterministic parser + Gemini AI fallback, auto wallet/category matching | ⚠️ Implemented — Client Gemini fallback exposes `VITE_GEMINI_API_KEY` if configured; move to server-only proxy |
| **BD SMS & Push Auto-Tracker** | Android `SmsReceiver` + `TakaFlowNotificationListener` + Anti-Scam personal number shield + `smsParser.ts` (bKash/Nagad/Rocket/Cellfin/Banks) | ⚠️ Partial / Fragile — Native queue clears before JS commit; NotificationListener bypasses personal number filter ([`DIFFICULTIES.md`](DIFFICULTIES.md#23-takaflownotificationlistener-bypasses-anti-scam-shield--defaults-unknown-senders-to-bkash)); no manual SMS paste box in Web UI yet |
| **Offline-First & Outbox** | Permanent TanStack Query cache (`TAKAPERSIST_CACHE_V1`) + Outbox queue (`TAKAPERSIST_OUTBOX_V1`) for Wallets/Transactions | 🚨 Needs P0 Repair — Outbox can silently discard unsynced items via `OfflineSyncBadge`, `SignOut`, or constraint drops; `updateWallet`/Debts/Goals/Transfers lack offline queue |
| **Wallets & Accounts** | Multi-wallet support (Cash, Bank, MFS), currencies (`BDT`, `USD`, `EUR`, `GBP`), inline `+ New` quick wallet in Add Drawer, balance rename/delete, inter-wallet transfers | ⚠️ Functional — Transfers are non-atomic and ignore cross-currency FX conversion |
| **Transaction Engine** | Income & Expense logging, custom emoji categories (`custom_categories` + reorder), inline category edit, one-click reversal, Shortage Rescue (`InsufficientBalanceModal`), recurring rules | ⚠️ Functional — Missing `day_of_month` catch-up if app wasn't opened on exact due date |
| **Budgeting & Goals** | Monthly budget (`BudgetTrafficLight`), savings goals with opening balance wizard, optional wallet debit contributions, surplus ETA projection, confetti | ⚠️ Functional — `useAddToGoal` is non-atomic; `GoalsPage` net savings includes reversed tx |
| **Debts & Loans** | Borrowed vs. Lent, `debt_payments` partial repayment history + overpayment handling, `debt_additions` top-up loans + trigger, settlement state | ⚠️ Functional — Client mutations across `debts` + `transactions` are non-atomic |
| **Analytics & AI** | Monthly snapshots (`useMonthRollover`), Recharts breakdown, `MoneyFlowChart`, `AIInsights` via Supabase Edge Function | ⚠️ Rollover math bug — `useMonthRollover` uses current balance & ignores `is_reversed` |
| **Calendar View** | Daily transaction overview, calendar heatmap, date-specific transaction drill-down | ✅ Functional |
| **Android APK Auto-Updater** | GitHub Releases checker modal with Bengali feature cards + `DownloadManager` + `FileProvider` self-installer | ⚠️ Works for Direct APK — Blocked on Google Play without flavors; CI tag `v1.0.7` is hardcoded |
| **Habit Streaks (`useStreaks`)** | `useStreaks` hook & `StreakBadge` component implemented in `src/` | 💤 Dead / Unwired — Not imported anywhere in UI yet |

---

## 🌟 Tier 1: "Killer" Features People Will Love (Bangladeshi & Modern Context)

These are the key differentiators that make TakaFlow uniquely valuable compared to generic trackers:

### 1. 📱 MFS SMS & Text Quick-Parser (bKash / Nagad / Rocket) — _Engine Built, Manual Paste Pending_
* **Status:** Core parser (`src/lib/smsParser.ts`) and Android background auto-capture (`SmsReceiver.java` + `TakaFlowNotificationListener.java`) are **already implemented**.
* **Remaining Scope (`TKF-01`):**
  - Add a collapsible **"Paste SMS / Trx Message"** field inside `AddTransactionDrawer.tsx` so Web, iOS, and manual users get the same 1-tap regex extraction (`Amount`, `bKash/Nagad/Bank`, `Income/Expense`, `TrxID`, `Counterparty`).

### 2. 🤝 Friendly Debt Reminders (WhatsApp & SMS Template Generator)
* **The Problem:** Asking friends or relatives for lent money (`"Taka ta kobe dibi?"`) is socially awkward and frequently forgotten.
* **The Solution:**
  - On the **Debts** page (`DebtsPage.tsx`), add a **"Send Friendly Reminder"** button next to lent records.
  - Automatically generates a polite, customizable message with a direct WhatsApp (`wa.me`) deep link:
    > *"Hey [Name]! Gentle reminder regarding the ৳[Amount] for [Reason]. Whenever convenient, you can bKash/Nagad me at [User Mobile Number]. Thanks!"*

### 3. 🕌 Zakat Calculator (যাকাত ক্যালকুলেটর)
* **The Problem:** Muslims in Bangladesh calculate Zakat every Ramadan, requiring complex manual calculation across cash, bank balances, gold, business stock, and debts.
* **The Solution:**
  - One-click Zakat tab/modal that aggregates liquid cash across wallets + recoverable active lent receivables minus immediate payable debts, compares against configurable Silver/Gold Nisab threshold, and calculates the exact 2.5% Zakat due.

### 4. ⚡ 1-Tap Quick Action Presets (Smart Micro-Expenses) + Cash-Out Fee Helper
* **The Problem:** Logging small repetitive expenses (Tea, Rickshaw, Lunch, Snacks) or bKash/Nagad cash-out charges (`+1.49%` / `+1.85%`) takes extra taps.
* **The Solution:**
  - Customizable quick-log pill buttons on the Dashboard (`[ ৳30 Rickshaw ]`, `[ ৳50 Chai & Snacks ]`, `[ ৳150 Lunch ]`) + 1-tap **Cash-Out Fee** toggle inside `AddTransactionDrawer.tsx`.

---

## ⚡ Tier 2: 10x User-Friendliness & Speed (UI/UX)

### 1. ⌨️ Global Command Palette (`Ctrl+K` / `Cmd+K`)
* Wire the already-installed `cmdk` package so desktop/power users can hit `Cmd+K` anywhere (`"Add 250 food"`, `"Go to Debts"`, search past transactions).

### 2. 🧠 Smart Category Autocomplete & Prediction
* Note-to-category keyword suggestion inside `AddTransactionDrawer.tsx` (Voice & SMS parsers already contain rich BD keyword dictionaries that can be shared with manual note input).

### 3. 📲 Full PWA (Progressive Web App) Shell + Hardened Offline Sync
* `localStorage` Outbox + TanStack Query permanence are already wired (`src/lib/offlineSync.ts`), **pending P0 stabilization** in [`TARGETS.md`](TARGETS.md).
* Next step (`TKF-06`): Add `vite-plugin-pwa`, Web App Manifest, and Service Worker so pure browser / iOS users can install and boot TakaFlow offline without native Android assets.

### 4. 🗂️ Full Transactions List with Advanced Filtering (`TKF-02`)
* Currently, Dashboard only displays the 10 most recent transactions of the active month.
* Add a dedicated **`/transactions`** route with instant text search, date range picker, wallet/category multi-select filters, bulk actions, and CSV export.

---

## 🎯 Tier 3: Gamification, Habit Retention & Delight

1. **🔥 Tracking Streaks & Habit Badges**: `useStreaks.ts` & `StreakBadge.tsx` already exist cleanly — wire them into `Dashboard` / `ProfilePage` after fixing `!is_reversed` filtering.
2. **🛡️ Vault Financial Health Score (0 - 100)**: Combines savings rate, budget adherence, debt ratio, and emergency fund runway.
3. **📉 Burn Rate & Runway Projection**: Live Dashboard daily safe-spend indicator (`remainingBudget / daysLeft`).

---

## 🛠️ Tier 4: Existing Feature Polish & Data Integrity Upgrades

| Feature | Current Limitation | Target Fix |
| :--- | :--- | :--- |
| **Offline Sync Badge & Queue** | Auto-clears on timeout/error, missing dead-letter recovery & several mutation types | **P0** fix in [`TARGETS.md`](TARGETS.md) |
| **Wallet Transfers / Debt / Goal Writes** | Non-atomic sequential client REST calls + no cross-currency FX conversion | **P1** Postgres RPCs (`transfer_wallet_funds`, `record_debt_payment`, `contribute_savings_goal`) |
| **Add Transaction Drawer** | Resets typed form if `wallets` refetches mid-edit; category picker requires opening modal | Fix `useEffect` deps (`P0`) + surface top 4 frequent categories |
| **Debts Page** | Already has partial payments (`debt_payments`) + additions (`debt_additions`) history | Make payment + debt update + wallet transaction atomic via RPC + add WhatsApp reminders |
| **Data Export** | No native CSV/PDF export mechanism | Add filtered CSV export in `/transactions` (`TKF-02`) and PDF statement export |
| **Receipts & Avatars** | Text notes only; avatars stored as base64 in Auth `user_metadata` JWT | Migrate avatars to Supabase Storage + add Gemini Vision receipt OCR |
| **Android Distribution** | Direct APK permissions (`RECEIVE_SMS`, `REQUEST_INSTALL_PACKAGES`) blocked on Google Play | Split Gradle build flavors (`directApk` vs `playStore`) |

---

## 💡 Quick Reference: Product Backlog (`TKF-*` IDs)

> For the full engineering order including **P0 Security & Sync fixes** before these features, see [**`TARGETS.md`**](TARGETS.md).

- `TKF-01`: **Manual SMS Paste Box** — Add collapsible SMS paste box in `AddTransactionDrawer.tsx` reusing existing [`src/lib/smsParser.ts`](src/lib/smsParser.ts).
- `TKF-02`: **Transactions Ledger View (`/transactions`)** — Full route with search, wallet/category/date filters, bulk actions, and CSV export.
- `TKF-03`: **WhatsApp Debt Reminder** — Polite reminder template + `wa.me` deep link in `src/pages/DebtsPage.tsx`.
- `TKF-04`: **Quick-Log Preset Bar** — Configurable micro-expense quick-tap pills on `src/pages/Dashboard.tsx` + MFS cash-out fee toggle.
- `TKF-05`: **Zakat Calculator** — Dedicated calculation modal/tab factoring liquid wallets + recoverable lent debts minus due liabilities.
- `TKF-06`: **PWA Service Worker & Manifest** — Configure `vite-plugin-pwa` for offline browser shell & iOS/desktop 1-tap install.
