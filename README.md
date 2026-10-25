# John's App

Personal NX + pnpm monorepo. **iOS (Expo / React Native) is the main platform**, distributed **only through TestFlight** to about five family testers. There is no public App Store listing. The web build is a secondary Expo static export that Vercel deploys at **https://alpha-theta-silk.vercel.app**. Ship JS and asset changes to those TestFlight binaries with **EAS Update**. Native changes still need a new TestFlight build.

```
/
├── vercel.json                 — Vercel import config, cleanUrls, SPA fallback (web only)
├── .github/workflows/eas-update.yml — OTA to EAS Update (not web)
├── packages/
│   ├── reactnative/            — Expo Router app (iOS primary, web secondary)
│   │   ├── app.config.js       — bundle id, runtimeVersion, updates.url
│   │   ├── eas.json            — Build/Submit profiles + OTA channels
│   │   └── app/                — sign-in, sign-up, signed-in home + chat
│   └── server/                 — Convex schema and functions
```

## Why Clerk + Convex

This repo uses **one Clerk application** for login on **both iOS and web**, and **Convex** for data. The same `@clerk/expo` screens and `ConvexProviderWithClerk` wrap native and web. Do not add a second auth stack for web.

| Option | Why not (for this app) |
| --- | --- |
| Convex Auth | Great when auth lives only in Convex, but email verification, native token storage, and the same UI on iOS + web are more work. |
| Clerk + Convex | **Chosen.** `@clerk/expo` (current SDK generation, v4) works on native iOS and Expo web. Convex validates Clerk JWTs (`auth.config.ts` + `ConvexProviderWithClerk`). |

**John's Clerk app (already created, Expo selected): `app_3L3Yo0NESQ48He3AynMeLsx1HTA`.** Do **not** run `clerk init` and do **not** create another Clerk application. Link this repo and pull keys:

```sh
npx -y clerk@latest auth login
clerk link --app app_3L3Yo0NESQ48He3AynMeLsx1HTA
clerk env pull
```

If `clerk` is not on your PATH after login, prefix the last two commands with `npx -y clerk@latest`. That writes the publishable key into the env file Clerk detects (copy `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` into `packages/reactnative/.env.local` if it landed at the repo root).

Also in the Clerk Dashboard: enable **email + password**, the **Native API**, and the **Convex** integration (John already turned this on). **Do not create a JWT template named `convex`.** Today's Clerk–Convex integration puts `aud: "convex"` on the **default session token** (Dashboard → Sessions → Claims). That audience is what `auth.config.ts` `applicationID: "convex"` matches. No template will show up under JWT templates — that is expected. The Frontend API URL / issuer for this app is `https://awaited-jennet-2760.clerk.accounts.dev`.

Users can only read or write their own `messages`. Chat and Whisper HTTP routes reject unauthenticated requests.

## Google sign-in (Clerk SSO)

Sign-in and sign-up show **Continue with Google** on iOS and web, next to the existing email/password flow.

- **iOS** uses Clerk's Expo helper (`useSSO` from `@clerk/expo/experimental`) with strategy `oauth_google` and redirect `johnsapp://sso-callback`.
- **Web** does **not** use that popup/`AuthSession` flow. After Google, a static Vercel export has no JS caller left to resume `openAuthSessionAsync`, so the old spinner never finished. Web uses Clerk's redirect API: `signIn.authenticateWithRedirect({ strategy: 'oauth_google', redirectUrl: '/sso-callback', redirectUrlComplete: '/' })`. `/sso-callback` calls `clerk.handleRedirectCallback` (the same thing `<AuthenticateWithRedirectCallback />` wraps in `@clerk/react`; `@clerk/expo` v4 does not re-export that component). If the callback does not finish in about 10 seconds, the page shows the Clerk state and a **Back to sign-in** link instead of spinning forever.

This Clerk instance is in **restricted sign-up** mode. John's account (`john.twigg@gmail.com`) already exists. If Google returns a sign-in that must **transfer to sign-up** (OAuth identity not linked yet), the app shows that message instead of hanging. It does **not** create accounts or weaken the email allowlist.

On **development** Clerk instances, Google uses Clerk's **shared OAuth credentials**. No Google Cloud project is required for this app's current `pk_test_` instance.

### What John must toggle in the Clerk dashboard

1. **Enable Google for all users** (if the connection is not already on — this instance already returned `oauth_google.enabled: true` from Clerk's environment API):
   - [SSO connections](https://dashboard.clerk.com/apps/app_3L3Yo0NESQ48He3AynMeLsx1HTA/user-authentication/sso-connections) (or [last-active SSO connections](https://dashboard.clerk.com/last-active?path=/user-authentication/sso-connections))
   - **Add connection** → **For all users** → **Google**
   - Leave **Use custom credentials** **off** on the development instance
   - Keep **Enable for sign-up and sign-in** on
2. **Allow the app redirect URLs** so Clerk can attach `rotating_token_nonce` after Google:
   - [Redirect URLs / Paths](https://dashboard.clerk.com/last-active?path=/configure/paths)
   - Add:
     - `johnsapp://sso-callback`
     - `http://localhost:8081/sso-callback`
     - `https://alpha-theta-silk.vercel.app/sso-callback`
3. **Native applications** (already needed for iOS):
   - [Native applications](https://dashboard.clerk.com/last-active?path=/native-applications)
   - Confirm the Expo app / scheme `johnsapp` is allowed

A production Clerk instance (`pk_live_`) **does** need a Google Cloud OAuth client. Do not do that until you move off the development instance.

### OTA vs new TestFlight

| Change | Ship how |
| --- | --- |
| Continue with Google button, native `useSSO`, web redirect `/sso-callback` | **OTA** (`pnpm update:preview` / `update:production`) — JS only. `expo-auth-session` is a JS helper. The existing foundation binary already has `scheme: johnsapp` and `expo-web-browser`. |
| First ever TestFlight binary, or a binary built **before** the auth-foundation scheme/`expo-web-browser` | **New TestFlight** (`pnpm ios:testflight`) |
| Switching to *native* Google (`useSignInWithGoogle` + `EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME` / Google Cloud iOS client) | **New TestFlight** — not used in this PR |

## Accounts John has to create (manual)

Nothing in this PR can finish these for you. Do them in this order:

1. **Clerk** — app `app_3L3Yo0NESQ48He3AynMeLsx1HTA` already exists. Link it (commands above). Do not create a second app. The **Convex** integration is on; that is enough. Confirm Sessions → Claims includes `aud` = `convex`. Do **not** add a JWT template.
2. **Convex** — project **alpha** on team `john-twigg` already exists. Dev deployment is `CONVEX_DEPLOYMENT=dev:posh-mink-581` (`https://posh-mink-581.convex.cloud`). On that deployment (Dashboard → Settings → Environment Variables) set `CLERK_JWT_ISSUER_DOMAIN=https://awaited-jennet-2760.clerk.accounts.dev`. Create a **deploy key** if CI should push functions.
3. **Expo / EAS** — [expo.dev](https://expo.dev) account. From `packages/reactnative`:
   ```sh
   npx eas-cli login
   npx eas-cli init
   npx eas-cli update:configure
   ```
   `update:configure` writes `runtimeVersion` / `updates.url` / `extra.eas.projectId` if they are still placeholders. Paste the project ID into `EAS_PROJECT_ID` (or `app.config.js`) so `updates.url` is `https://u.expo.dev/<project-id>`.
4. **Apple Developer Program** — paid membership is required for TestFlight. In App Store Connect, create an **app record** (needed so TestFlight has a place to land; do not fill a public store listing or submit for App Store review). Paste the numeric Apple ID into `eas.json` → `submit.production.ios.ascAppId`.
5. **Vercel** — [vercel.com](https://vercel.com). Import **this GitHub repo**. Root Directory = repo root. Vercel reads `vercel.json` and deploys **web only**. Public URL: **https://alpha-theta-silk.vercel.app**.
6. **GitHub Actions** — create an Expo access token at [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens). In the GitHub repo: Settings → Secrets and variables → Actions → **EXPO_TOKEN**. That is the only required secret: the workflow takes `EXPO_PUBLIC_CONVEX_URL` and `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` from the channel's build profile `env` in `eas.json`, and `EAS_PROJECT_ID` defaults to the project in `app.config.js`. A repository secret with the same name overrides each default.
7. **OpenAI** (only if you use Chat / Whisper) — set `OPENAI_API_KEY` on the Convex dashboard.

Replace placeholder branding before the first TestFlight build: `com.example.johnsapp`, `assets/images/icon.png`, `splash-icon.png`, and `favicon.png`.

## Local setup

### 1. Install

```sh
pnpm install
```

### 2. Convex backend

```sh
cd packages/server
# CONVEX_DEPLOYMENT=dev:posh-mink-581  (team john-twigg, project alpha)
pnpm convex login          # once
pnpm convex dev            # syncs schema, auth.config.ts, and functions
```

`packages/server/.env.example` already has `CONVEX_DEPLOYMENT=dev:posh-mink-581`. Copy it to `packages/server/.env.local` if the CLI has not written that file yet.

| Convex env var | Value |
| --- | --- |
| `CLERK_JWT_ISSUER_DOMAIN` | `https://awaited-jennet-2760.clerk.accounts.dev` (**no trailing slash**). Set this on **dev:posh-mink-581** (and on production later). |
| `ALLOWED_EMAILS` | `john.twigg@gmail.com` (comma-separated later). Case-insensitive. **Default-deny if unset.** Also gates finance reads. |
| `ALLOWED_USER_IDS` | optional Clerk `user_…` ids if the session JWT has no `email` claim |
| `OPENAI_API_KEY` | optional, chat + Whisper |
| `FINANCE_SERVER_SECRET` | server-to-server secret for `POST /finance/server` (same value on Vercel). **Not** a Convex deploy/admin key. |

`packages/server/convex/auth.config.ts` defaults to that issuer (`applicationID: "convex"` matches the session token `aud`) and still honors `CLERK_JWT_ISSUER_DOMAIN` / `CLERK_FRONTEND_API_URL` if you override it. Production Clerk uses `pk_live_` / the production Frontend API URL.

### 3. Expo env

Copy `packages/reactnative/.env.example` to `packages/reactnative/.env.local` (or use `clerk env pull` as above). The committed example already has John's public Convex **dev** URL and Clerk **dev** publishable key:

```
EXPO_PUBLIC_CONVEX_URL=https://posh-mink-581.convex.cloud
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_YXdhaXRlZC1qZW5uZXQtMjc2MC5jbGVyay5hY2NvdW50cy5kZXYk
```

The same values are inlined on the EAS `development` and `preview` profiles in `eas.json`. Production / TestFlight builds should override via EAS secrets if you later use a prod Convex deployment or `pk_live_` Clerk keys.

### 4. Run

```sh
nx run server:dev              # Convex
nx run reactnative:start       # Expo: press i (iOS) or w (web)
```

Sign up with email/password, enter the Clerk verification code, and you land on the signed-in home screen. Sign-out is on that screen. The same Clerk session code path runs on iOS and web.

### NX / pnpm commands

```sh
pnpm typecheck                 # tsc for server + app
pnpm export:web                # Expo static web → packages/reactnative/dist
pnpm ios:testflight            # EAS production build + submit to TestFlight
pnpm update:preview            # eas update --channel preview
pnpm update:production         # eas update --channel production (TestFlight binaries)
nx run reactnative:start
nx run server:deploy           # production Convex
```

Pass a custom OTA message: `pnpm --filter @rn-monorepo/reactnative update:preview -- "fix home layout"`.

## Over-the-air updates (iOS)

iOS binaries install **expo-updates**. On launch they ask EAS for a JS bundle on their **channel**. Web does **not** use OTA; Vercel rebuilds the static export on git push.

### runtimeVersion: `appVersion`

`app.config.js` sets `"runtimeVersion": { "policy": "appVersion" }`. The native binary and every OTA update must share `expo.version` (currently `1.0.0`).

**Why not fingerprint:** fingerprint hashes native files at build time. GitHub Actions runs on Linux; EAS iOS builds run on macOS. Those hashes can disagree, so a perfectly compatible JS update would never install. `appVersion` is the same string everywhere. When you change native code, bump `version` in `app.config.js` and cut a new iOS build.

### Channels (mapped to `eas.json` profiles)

| Build profile | `channel` | Who gets OTA |
| --- | --- | --- |
| `development` | `development` | Dev-client / simulator builds (your machine) |
| `preview` | `preview` | Ad-hoc internal binaries (your devices) |
| `production` | `production` | **TestFlight family binaries** |

`updates.url` is `https://u.expo.dev/<EAS_PROJECT_ID>`. Family testers install the **production** profile from TestFlight, so `pnpm update:production` (or a `v*` tag) is what they receive.

### JS-only vs native (when you need a new TestFlight build)

**OTA is enough** (keep `version` as-is, `pnpm update:production` for family testers):

- Screen layout, copy, styles
- Clerk/Convex JS (`app/`, `providers/`, `convex/*.ts` that is not a native module)
- Images loaded as JS assets (not the iOS app icon / splash used by the binary)

**New TestFlight binary** (bump `version` in `app.config.js`, then `pnpm ios:testflight`):

- New native dependency (`expo install` of a module with native code)
- Expo SDK upgrade
- Changes to `app.config.js` plugins, permissions, bundle id, icons, splash
- `ios/` / `android/` native files (this repo is CNG; those folders are generated at build time)
- `newArchEnabled` or other runtime flags

Incompatible OTAs are avoided by bumping `version` whenever native changes. A `1.0.1` update will not load on a `1.0.0` binary. Family testers then install the new build from TestFlight; JS-only work after that is OTA again.

### Publish locally

```sh
cd packages/reactnative
npx eas-cli update:configure          # once, after eas init
pnpm update:preview                   # or: pnpm update:production
```

TestFlight (production) binaries download the update in the background and apply it after a second launch. Dev clients can load a specific update from the Extensions tab.

### GitHub Actions

`.github/workflows/eas-update.yml`:

| Trigger | Channel |
| --- | --- |
| Push to `main` touching `packages/reactnative/**`, `packages/server/convex/**` (bundled into the app), `pnpm-lock.yaml`, or the workflow | `production` (TestFlight devices) |
| Git tag `v*` (e.g. `v1.0.1`) | `production` (TestFlight devices) |
| Actions → Run workflow | `production` by default, or `preview` |

Only `EXPO_TOKEN` is required; the job fails up front with a clear error if it is missing. Public config comes from `eas.json` (Convex URL, Clerk publishable key) and the default EAS project ID, each overridable by a secret of the same name. A red **EAS Update** run means TestFlight devices did not get that commit.

Vercel is unchanged: it still builds web from `vercel.json`. The workflow never runs `expo export --platform web`.

## Web / Vercel

`packages/reactnative/app.config.js` sets `web.output` to `"static"`.

**Public URL: [https://alpha-theta-silk.vercel.app](https://alpha-theta-silk.vercel.app)**

Expo writes `sign-in.html` (and the same for other routes). `vercel.json` sets `cleanUrls: true` so `/sign-in` serves that file on refresh, and a fallback rewrite sends unknown paths to `/index.html` (not `/_expo`, `/assets`, or `/api`). The finance MCP lives at **`/api/mcp`**.

| Vercel setting | Value |
| --- | --- |
| Framework Preset | Other (`vercel.json` sets `"framework": null`) |
| Install command | `pnpm install` |
| Build command | `pnpm --filter @rn-monorepo/reactnative export:web` |
| Output directory | `packages/reactnative/dist` |
| Root Directory | repository root |

**Vercel env vars** (same public dev values until you have a prod Convex deployment):

| Name | Value |
| --- | --- |
| `EXPO_PUBLIC_CONVEX_URL` | `https://posh-mink-581.convex.cloud` |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_YXdhaXRlZC1qZW5uZXQtMjc2MC5jbGVyay5hY2NvdW50cy5kZXYk` |
| `CONVEX_SITE_URL` | `https://posh-mink-581.convex.site` (HTTP actions). Optional if the cloud URL is set — MCP derives `.convex.site` from it. |
| `FINANCE_MCP_TOKEN` | Bearer token for `/api/mcp`. Agents send `Authorization: Bearer <token>`. |
| `FINANCE_SERVER_SECRET` | Same value as Convex `FINANCE_SERVER_SECRET`. Vercel uses it to call Convex; never a deploy key. |

In Clerk, add `https://alpha-theta-silk.vercel.app` (and `http://localhost:8081`) under allowed origins / redirect URLs.

## TestFlight (family testers)

iOS goes to **TestFlight only**. `eas submit` / `--auto-submit` uploads the IPA to App Store Connect and stops there. Do **not** submit the app for App Store review, and do not fill a public store listing (screenshots, description, keywords, availability).

The EAS `production` profile uses `distribution: "store"` because TestFlight requires a store-signed binary. Its update **channel is `production`**, so family devices pick up `pnpm update:production`.

### One-step build + submit

From the repo root (after `eas-cli login` / `eas-cli init` / `eas-cli update:configure` in `packages/reactnative`):

```sh
pnpm ios:testflight
```

That runs `eas build --profile production --platform ios --auto-submit`: EAS builds the IPA, then `eas submit` uploads it for TestFlight. To submit an already-finished build: `pnpm --filter @rn-monorepo/reactnative eas:submit`.

Set **EAS secrets** for values baked into the TestFlight binary (do not put production secrets in `eas.json`):

```sh
npx eas-cli secret:create --name EXPO_PUBLIC_CONVEX_URL --value https://posh-mink-581.convex.cloud
npx eas-cli secret:create --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value pk_test_YXdhaXRlZC1qZW5uZXQtMjc2MC5jbGVyay5hY2NvdW50cy5kZXYk
```

Use the committed `pk_test_` key for family TestFlight until you switch Clerk to live keys. GitHub Actions needs the same `EXPO_PUBLIC_*` values as repository secrets so OTA bundles match the binary.

### Add testers in App Store Connect

1. Wait until the build shows as **Ready to Test** in App Store Connect → TestFlight (processing often takes 10–30 minutes).
2. **Internal testers** (optional): people who already have an App Store Connect seat. They get the build quickly and **do not** go through Beta App Review. Cap is 100, but they must be on your Apple team.
3. **External testers** (typical for family): App Store Connect → TestFlight → create a group (for example `Family`) → add the five testers by email. They install the **TestFlight** app from the App Store and redeem the invite. They do **not** need an App Store Connect account.

`eas.json` `submit.production.ios.groups` can name an existing **internal** TestFlight group so EAS adds the build automatically. External groups are managed in App Store Connect (or an EAS Workflow `testflight` job). After you create `Family`, you can still add builds to that group in the TestFlight UI.

### Light beta review (external testers only)

The first build you send to an **external** group goes through Apple **Beta App Review**. That is a light compliance pass (crash-on-launch, obvious guideline issues) — **not** a full App Store review, and it does not publish a store listing. Have TestFlight test information filled in (contact, a short “what to test”, a demo login if the reviewer cannot create an account). Later builds of the **same** `expo.version` usually skip review; bumping `version` for a native change starts a new version and can trigger review again.

Internal testers never wait on Beta App Review.

### When OTA is enough vs when `pnpm ios:testflight` is required

| Change | What to run | Testers do |
| --- | --- | --- |
| JS, styles, copy, Clerk/Convex app code | `pnpm update:production` (or tag `v*`) | Kill and reopen the TestFlight app (or wait for the next launch) |
| Native module, Expo SDK, plugins, icons, splash, permissions, `version` bump | `pnpm ios:testflight` | Install the new build in TestFlight. External groups may wait on Beta App Review. |

Do not use `pnpm ios:testflight` for copy/layout tweaks — that burns a build number and, on a version bump, another review.

Lower-level commands if you need them:

```sh
npx eas-cli build --profile development --platform ios   # simulator / dev client
npx eas-cli build --profile preview --platform ios       # ad-hoc, your devices
npx eas-cli build --profile production --platform ios    # TestFlight IPA only
npx eas-cli submit --profile production --platform ios --latest
```

## Manual checklist (cannot be done in this PR)

- [ ] Link Clerk app `app_3L3Yo0NESQ48He3AynMeLsx1HTA` (`npx -y clerk@latest auth login` then `clerk link --app app_3L3Yo0NESQ48He3AynMeLsx1HTA` + `clerk env pull`). Do not `clerk init`.
- [ ] Enable email+password, Native API, and the **Convex** integration (session token `aud: convex`). Do **not** create a JWT template named `convex`
- [ ] Convex project **alpha** / `CONVEX_DEPLOYMENT=dev:posh-mink-581`; set `CLERK_JWT_ISSUER_DOMAIN=https://awaited-jennet-2760.clerk.accounts.dev` on that deployment
- [ ] Fill `packages/reactnative/.env.local`
- [ ] Expo account; `eas-cli login` + `eas-cli init` + **`eas-cli update:configure`**
- [ ] Put EAS project ID in `EAS_PROJECT_ID` so `updates.url` is real
- [ ] GitHub secret **`EXPO_TOKEN`** (public config defaults from `eas.json` / `app.config.js`)
- [ ] Apple Developer; App Store Connect **app record** for TestFlight (no public listing); bundle id + `ascAppId`
- [ ] `pnpm ios:testflight`; add ~5 family testers as an **external** TestFlight group; fill TestFlight test information
- [ ] Do **not** submit for App Store review
- [ ] Replace icon/splash placeholders before the first TestFlight build
- [x] Vercel project root = repo root; public URL **https://alpha-theta-silk.vercel.app**. Set `EXPO_PUBLIC_CONVEX_URL=https://posh-mink-581.convex.cloud` and the Clerk `pk_test_` key (web only)
- [ ] Clerk: enable **Google** under [SSO connections](https://dashboard.clerk.com/apps/app_3L3Yo0NESQ48He3AynMeLsx1HTA/user-authentication/sso-connections) (shared credentials on this dev instance). Add redirect URLs `johnsapp://sso-callback`, `http://localhost:8081/sso-callback`, and `https://alpha-theta-silk.vercel.app/sso-callback`.
- [ ] Add Vercel and native origins in the Clerk dashboard
- [ ] Convex dashboard on **dev:posh-mink-581**: set `ALLOWED_EMAILS=john.twigg@gmail.com`. If `ctx.auth` identity has no `email`, also set `ALLOWED_USER_IDS` to John's Clerk `user_…` id (Users → john.twigg@gmail.com). Confirm Sessions → Claims includes `email`.
- [ ] `nx run server:deploy` before pointing clients at prod Convex

## Auth model

1. Expo wraps the tree in `ClerkProvider` + `ConvexProviderWithClerk` on iOS and web.
2. After Clerk has a session, ConvexProviderWithClerk sees `sessionClaims.aud === "convex"` and calls `getToken()` **without** a JWT template (the default session token). Whisper HTTP uses the same helper.
3. Every public Convex query/mutation/action (and Whisper HTTP) requires that identity's verified email in `ALLOWED_EMAILS` (or Clerk subject in `ALLOWED_USER_IDS`). Unset allowlists deny everyone. Signed-in users who are not listed see **Access not granted** and cannot load app data.
4. `users.store` upserts `{ tokenIdentifier, name, email }` so data can foreign-key `users._id` (allowlisted identities only).
5. `messages.list` / `messages.send` load the current user and index by `userId`.
6. Sign-in, sign-up (email verification code), Google, and sign-out are the same screens on both platforms.

## Personal finances (Convex is the source of truth)

Finance (an external admin agent) is the only writer. The app is display-only. Agents should use the MCP server at **`/api/mcp`** (Bearer `FINANCE_MCP_TOKEN`) rather than Convex admin access. Internal `npx convex run finance/ingest:*` mutations remain for local/admin use. There is **no** `FINANCE_INGEST_SECRET` and **no** Convex deploy key on Vercel.

```sh
cd packages/server
npx convex run finance/ingest:upsertAccounts '{"items":[...]}'
npx convex run finance/ingest:upsertSnapshots '{"items":[...]}'
npx convex run finance/ingest:upsertTransactions '{"items":[...]}'
npx convex run finance/ingest:upsertHoldings '{"items":[...]}'
npx convex run finance/ingest:fillGaps '{"accountId":"acc_1","from":"2026-07-31","to":"2026-10-12"}'
npx convex run finance/sync:digest '{"from":"2026-07","to":"2026-10"}'
npx convex run finance/sync:exportBucket '{"table":"balance_snapshots","accountId":"acc_1","month":"2026-07"}'
npx convex run finance/rollupJobs:rebuildAll
npx convex run finance/rollupJobs:checkConsistency '{"sample":16}'
```

Net-worth charts read materialized `finance_rollups` at day / week / month grain (per account, class, group, total, and S&P if bars exist). `1M`/`3M`/`YTD` use daily rows, `1Y` weekly, `5Y`/`All` monthly. Every ingest or delete path records the earliest affected date and `finance/rollupJobs:rebuildStep` rematerializes from that date forward in scheduled batches. While a rebuild is pending the page query serves stale rollups marked `rollup: "stale"`, or falls back to raw snapshot probes (`rollup: "raw"`). After deploy, run **`finance/rollupJobs:rebuildAll`** once.

Each upsert takes `{ items: [...] }` (cap 500). The pusher is master: a sent row overwrites the stored row for the same key. Within one batch, if keys collide, the highest-precedence snapshot is kept (**manual > observed > reconstructed > interpolated**). Dedup keys: accounts + transactions by `sourceId`; snapshots by `accountId+asOf`; holdings by `accountId+symbol+asOf`. Manual assets use `provider: "manual"` (no `connectionId`) and snapshot `source: "manual"`.

Reads (`isAllowed`, `accounts`, `snapshots`, `holdings`, `netWorth`, `page`) use `requireAllowedIdentity` — the same `ALLOWED_EMAILS` / `ALLOWED_USER_IDS` default-deny as the rest of the app. There is no `FINANCE_ALLOWED_USER_IDS`.

`contentHash` is SHA-256 (lowercase hex) of `finance.v1` + table + declared fields (`accounts`: sourceId, provider, connectionId, class, name, mask, type, subtype, currentBalance, availableBalance, currency, syncedAt, coverageStart). Missing values are the token `null`. Money is 8 fixed decimals. `finance/sync:digest` buckets by `(table, accountId, YYYY-MM)`; `bucketHash` is SHA-256 of that bucket's content hashes sorted and joined by LF.

Investment coverage starts **31 Jul 2026** (some accounts **12 Oct 2026**). Charts draw continuous lines. Gaps are a lighter dashed interpolated segment. An account is omitted from totals until its first stored point — never treated as $0 — and a coverage marker is shown instead of a step. The Net Worth page is display-only.

### Finance MCP (Vercel `/api/mcp`)

Streamable HTTP. Clients send `Authorization: Bearer $FINANCE_MCP_TOKEN`. The route calls Convex `POST $CONVEX_SITE_URL/finance/server` with `Authorization: Bearer $FINANCE_SERVER_SECRET`. That HTTP action wraps the existing internal ingest/sync functions.

```
https://alpha-theta-silk.vercel.app/api/mcp
```

Tools: `upsert_accounts`, `upsert_snapshots`, `upsert_transactions`, `upsert_holdings`, `fill_gaps`, `get_digest`, `export_bucket`, `list_accounts`, `delete_accounts`, `delete_transactions`, `upsert_flows`, `delete_flows`, `upsert_returns`, `upsert_series`, `delete_series`. Upsert batch cap 500; `fill_gaps` write cap 800; `delete_transactions` / `delete_flows` cap 500 ids (Convex `_id` or `sourceId` / `flowId`); `delete_series` write cap 500 rows (`continueFrom` to page).

Time-weighted returns: Finance writes `flows` (keyed by `flowId`), `returns` (keyed by `scope+window+asOf`), and daily `series` (keyed by `scope+date`: value, netInvested, sp500Equiv). `upsert_returns` replaces every stored row for each `asOf` present in the batch. `returns.scope` may also be `sp500:<inner>` (`sp500:total`, `sp500:reliable_subset`, `sp500:account:<id>`) for the S&P TWR Finance computed. The chart header reads that stored row only — it never derives S&P TWR from the series path, and shows `—` when the row is missing. The app is read-only. `get_digest` adds table-level `flows`, `returns`, and `series` `{ count, checksum }` — SHA-256 of sorted `finance.v1` content hashes joined by LF, same as `bucketHash`. Series rows fold into `finance_rollups` as `scopeKind: "series"` (day / week / month) with the same ingest invalidation as snapshots. The net-worth and account-detail balance charts keep two independent, device-local toggles: **Time-weighted** (value + net-invested step + profit gap + TWR) and **S&P 500** (flow-adjusted overlay when series exist, otherwise the rebased market-index overlay).

```
upsert_flows({ items: [{
  flowId, accountId, date, amount,           // amount > 0 = into the investment account
  kind: "internal_transfer" | "roth_conversion" | "external",
  counterpartAccountId?, counterpartFlowId?, counterpartTxnId?, evidence?,
  externalToInvestable: boolean
}] })                                       // 1–500 items

delete_flows({ ids: string[] })             // 1–500 Convex _id or flowId

upsert_returns({ items: [{
  scope: "account:<id>" | "total" | "reliable_subset" | "sp500:<those>",
  window: "3M" | "6M" | "YTD" | "1Y" | "3Y" | "SI",
  asOf, startDate, cumulative, annualized?, // annualized nullable
  reliable, startOnAnchor, flowsFullyKnown,
  method: "finance.twr.v1", note?
}] })                                       // 1–500 items; replaces all rows for each asOf in the batch

upsert_series({ items: [{
  scope: "account:<id>" | "total" | "reliable_subset",
  date,                                     // YYYY-MM-DD
  value, netInvested, sp500Equiv,
  valueInterpolated,                        // gap-filled value
  estimated                                 // true before flow data exists
}] })                                       // 1–500 items; key scope+date, last in batch wins

delete_series({ scope, fromDate?, toDate? }) // inclusive dates; continueFrom pages at 500
```

Pending → posted: a posted `upsert_transactions` row deletes the pending row named by `pendingTransactionId` (same account). Without a link, a newly inserted posted row replaces at most one pending row on the same account with the same amount, normalized merchant/name, and date within 5 days (closest wins). Replacements and `delete_transactions` calls are written to the `finance_audit_log` table (no public read path). Digests are computed live, so deletes are reflected immediately.

Local smoke (no deploy): unit tests in `packages/server/tests/finance-mcp.test.ts`. Against `vercel dev`, point the MCP inspector at `http://localhost:3000/api/mcp` with the bearer token.

### Daily email briefings

The Briefings tab (signed-in app, same Clerk allowlist as finance) shows one day at a time with **Personal** and **Crankcase** tabs: top priorities, worth-a-glance, counts, Remember / Stop / Comment, and swipe-left archive with a 5-second undo. Cards keep both Gmail links (desktop `href`, mobile on iOS/Android).

Ingest is server-to-server:

```
POST https://posh-mink-581.convex.site/briefings/ingest
Authorization: Bearer $BRIEFINGS_INGEST_SECRET
```

The body is one calendar day (`personal` + `crankcase`). Re-sends overwrite that date. Schema, a synthetic example, and the feedback webhook body are in [`docs/briefings.md`](docs/briefings.md). Item ids are `date-account-threadId`, not card position.

Feedback is an allowlisted Convex action that POSTs to `FEEDBACK_WEBHOOK_URL` with `Authorization: Bearer $FEEDBACK_WEBHOOK_KEY` and `source: "email-briefing-deck"` — the same payload the old `/api/feedback` forwarded. Those two env vars stay on Convex; they are never `EXPO_PUBLIC_*`. Sentry redacts briefing item text. There is no public query on `briefing_audit_log`.
