# Plaid pipeline plan (not built)

Status: plan only. Nothing is built, signed up for, or paid for. This doc contains no account numbers, balances or personal data.

## Goal
Make finance ingestion deterministic and server-side. Alpha's Convex backend pulls Plaid data once a day and reconciles it with plain code. No AI agent is involved unless John asks.

## Scope
- **Secrets (Convex env):** `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `PLAID_TOKEN_KEY` (AES-256-GCM via WebCrypto), `PLAID_SYNC_ENABLED` (kill switch). Access tokens are encrypted at rest and never sent to the client, logs or Sentry.
- **Tables:** `plaid_items` (encrypted token, sync cursor, status, live flag), `plaid_account_map` (Plaid account id to existing canonical id), `plaid_sync_runs`, `finance_proposed_deletions`.
- **Link actions (Clerk auth, `ALLOWED_USER_IDS` only):** `createLinkToken` (transactions + investments, maximum history requested at link time), `exchangePublicToken` (blocks duplicate institutions), `createUpdateLinkToken` (relink in update mode, no new item).
- **App:** Connections screen (status, Link, Relink) using `react-native-plaid-link-sdk`, a `/plaid-oauth` universal link, and Home banners for "needs relink" and "N deletions to review". It's a native module, so it needs a new TestFlight build with a runtime bump, not an OTA.

## Daily sync
- One Convex cron a day at 11:30 UTC (4:30 AM PT in daylight time). It never reschedules itself.
- Items run one at a time: `/transactions/sync` (at most 3 pages of 500, cursor saved after each page), `/investments/holdings/get`, `/accounts/get` (cached balances).
- Not used: real-time balance (paid per call) and `/transactions/refresh`.
- Writes reuse the existing `finance.ingest` upserts: accounts, today's observed snapshot, gap fill, transactions with pending-to-posted linking, and holdings.
- Dedupe by content (account, date, amount, payee) as well as by id, because relinking gives new Plaid ids for rows Alpha already has.
- Ported from Finance's reference logic: a looser pending fallback (same account and amount within 4 days) and transfer-adjusted interpolation for gaps over 7 days.

## Safeguards and Convex usage limits
- Hard caps per run: 12 items, 60 Plaid calls, 200 Convex mutations. A run aborts at a cap.
- Stop on no progress (empty page or unchanged cursor). `ITEM_LOGIN_REQUIRED` marks the item `needs_relink` with no retry. Three consecutive failures pause the item.
- A lock row blocks overlapping runs, with at least 20 hours between scheduled runs.
- No automatic rollup rebuilds or recompute loops. One report-only consistency check per run.
- Estimated usage: about 100–150 function calls a day (3–5K a month) and well under 1 MB of data a day. That's under 1% of Convex's included usage, far inside the roughly $20 cap.

## Deletions
Never automatic. Plaid "removed" ids and stale pendings become proposals in `finance_proposed_deletions`. A proposal closes itself if the row is already gone. Only John's explicit approval runs the existing audited delete.

## Reconciliation (report only)
- Today's stored snapshot vs Plaid's reported balance.
- Balance change vs the sum of new transactions.
- Pendings older than 14 days with no posted match.
- Alerts when an item isn't healthy, an account count drops, or an institution disappears.

## Cost
- **Plaid Trial plan:** free, real production data, up to 10 items. About 8 institutions fit with 2 to spare. Removing an item doesn't free its slot. Terms get re-confirmed at sign-up.
- **Pay-as-you-go, if upgraded later:** roughly $2–7 a month. This is an unconfirmed third-party estimate, since Plaid doesn't publish prices. Avoid real-time balance (about $0.10 per call).
- **Convex:** effectively $0 extra.

## John's setup steps
1. Sign up on Plaid's dashboard and apply for the Trial plan, which is only open to accounts that never had Production access. About 30 minutes.
2. Add the redirect URI `https://alpha-theta-silk.vercel.app/plaid-oauth` and the Android package name.
3. Hand over the client id and production secret through a secret request, never in chat or the repo. Don't upgrade the plan.
4. Install the new TestFlight build and re-link each bank. **About 25–40 minutes in total for all banks** (roughly 2–5 minutes each), not 30 minutes per bank.

## Cutover with Finance
Today the Finance assistant is the only writer of finance data, so this needs John's explicit approval.
1. Shadow mode for about a week: the cron fetches and records diff counts only, with no finance writes.
2. Compare against Finance's data.
3. Switch on one institution at a time. Finance stops pushing that institution's accounts at the same moment, so there are never two writers.

## Risks
- Trial-plan OAuth coverage for some brokerages isn't confirmed until link time.
- Chase consent may expire and need periodic relinks.
- History depth is fixed at link time (90 days by default, up to 730 if requested).
- The token key lives in the same Convex deployment, so encryption protects backups and exports, not deployment admins.

## Estimated effort
About 6 working days of agent work: schema and Link, sync and dedupe, app screens, native build, then shadow run and cutover.
