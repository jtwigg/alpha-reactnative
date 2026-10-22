# John's App

Personal NX + pnpm monorepo. **iOS (Expo / React Native) is the main platform**, distributed **only through TestFlight** to about five family testers. There is no public App Store listing. The web build is a secondary Expo static export that Vercel deploys. Ship JS and asset changes to those TestFlight binaries with **EAS Update**. Native changes still need a new TestFlight build.

```
/
├── vercel.json                 — Vercel import config (web only)
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

## Accounts John has to create (manual)

Nothing in this PR can finish these for you. Do them in this order:

1. **Clerk** — app `app_3L3Yo0NESQ48He3AynMeLsx1HTA` already exists. Link it (commands above). Do not create a second app. The **Convex** integration is on; that is enough. Confirm Sessions → Claims includes `aud` = `convex`. Do **not** add a JWT template.
2. **Convex** — [dashboard.convex.dev](https://dashboard.convex.dev). This repo already has `packages/server/convex.json` pointing at team `john-twigg`. Copy the deployment URL (`https://….convex.cloud`). Set `CLERK_JWT_ISSUER_DOMAIN=https://awaited-jennet-2760.clerk.accounts.dev` on **both** the development and production deployments. Create a **deploy key** if CI should push functions.
3. **Expo / EAS** — [expo.dev](https://expo.dev) account. From `packages/reactnative`:
   ```sh
   npx eas-cli login
   npx eas-cli init
   npx eas-cli update:configure
   ```
   `update:configure` writes `runtimeVersion` / `updates.url` / `extra.eas.projectId` if they are still placeholders. Paste the project ID into `EAS_PROJECT_ID` (or `app.config.js`) so `updates.url` is `https://u.expo.dev/<project-id>`.
4. **Apple Developer Program** — paid membership is required for TestFlight. In App Store Connect, create an **app record** (needed so TestFlight has a place to land; do not fill a public store listing or submit for App Store review). Paste the numeric Apple ID into `eas.json` → `submit.production.ios.ascAppId`.
5. **Vercel** — [vercel.com](https://vercel.com). Import **this GitHub repo**. Root Directory = repo root. Vercel reads `vercel.json` and deploys **web only**.
6. **GitHub Actions** — create an Expo access token at [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens). In the GitHub repo: Settings → Secrets and variables → Actions → **EXPO_TOKEN**. Also add `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, and `EAS_PROJECT_ID` so OTA JS for TestFlight (`production` channel) and preview is built with the right keys.
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
pnpm convex login          # once
pnpm convex dev            # syncs schema, auth.config.ts, and functions
```

| Convex env var | Value |
| --- | --- |
| `CLERK_JWT_ISSUER_DOMAIN` | `https://awaited-jennet-2760.clerk.accounts.dev` (**no trailing slash**). Set this on **both** Convex deployments. |
| `OPENAI_API_KEY` | optional, chat + Whisper |

`packages/server/convex/auth.config.ts` defaults to that issuer (`applicationID: "convex"` matches the session token `aud`) and still honors `CLERK_JWT_ISSUER_DOMAIN` / `CLERK_FRONTEND_API_URL` if you override it. Production Clerk uses `pk_live_` / the production Frontend API URL.

### 3. Expo env

Copy `packages/reactnative/.env.example` to `packages/reactnative/.env.local` (or use `clerk env pull` as above). The committed example already has John's public Clerk **dev** publishable key:

```
EXPO_PUBLIC_CONVEX_URL=https://YOUR_DEPLOYMENT.convex.cloud
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_YXdhaXRlZC1qZW5uZXQtMjc2MC5jbGVyay5hY2NvdW50cy5kZXYk
```

The same `pk_test_` key is inlined on the EAS `development` and `preview` profiles in `eas.json`. Production builds should use a `pk_live_` value via an EAS secret.

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
| Push to `main` | `preview` |
| Git tag `v*` (e.g. `v1.0.1`) | `production` (TestFlight devices) |
| Actions → Run workflow | you pick `preview` or `production` |

Vercel is unchanged: it still builds web from `vercel.json`. The workflow never runs `expo export --platform web`.

## Web / Vercel

`packages/reactnative/app.config.js` sets `web.output` to `"static"`.

| Vercel setting | Value |
| --- | --- |
| Framework Preset | Other (`vercel.json` sets `"framework": null`) |
| Install command | `pnpm install` |
| Build command | `pnpm --filter @rn-monorepo/reactnative export:web` |
| Output directory | `packages/reactnative/dist` |
| Root Directory | repository root |

**Vercel env vars:** `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`

In Clerk, add the Vercel URL (and `http://localhost:8081`) under allowed origins / redirect URLs.

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
npx eas-cli secret:create --name EXPO_PUBLIC_CONVEX_URL --value https://YOUR_PROD.convex.cloud
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
- [ ] Log into Convex; set `CLERK_JWT_ISSUER_DOMAIN=https://awaited-jennet-2760.clerk.accounts.dev` on **dev and prod** deployments
- [ ] Fill `packages/reactnative/.env.local`
- [ ] Expo account; `eas-cli login` + `eas-cli init` + **`eas-cli update:configure`**
- [ ] Put EAS project ID in `EAS_PROJECT_ID` so `updates.url` is real
- [ ] GitHub secret **`EXPO_TOKEN`**, plus `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EAS_PROJECT_ID`
- [ ] Apple Developer; App Store Connect **app record** for TestFlight (no public listing); bundle id + `ascAppId`
- [ ] `pnpm ios:testflight`; add ~5 family testers as an **external** TestFlight group; fill TestFlight test information
- [ ] Do **not** submit for App Store review
- [ ] Replace icon/splash placeholders before the first TestFlight build
- [ ] Import the GitHub repo into Vercel; set `EXPO_PUBLIC_*` (web only)
- [ ] Add Vercel and native origins in the Clerk dashboard
- [ ] `nx run server:deploy` before pointing clients at prod Convex

## Auth model

1. Expo wraps the tree in `ClerkProvider` + `ConvexProviderWithClerk` on iOS and web.
2. After Clerk has a session, ConvexProviderWithClerk sees `sessionClaims.aud === "convex"` and calls `getToken()` **without** a JWT template (the default session token). Whisper HTTP uses the same helper.
3. `users.store` upserts `{ tokenIdentifier, name, email }` so data can foreign-key `users._id`.
4. `messages.list` / `messages.send` load the current user and index by `userId`.
5. Sign-in, sign-up (email verification code), and sign-out are the same screens on both platforms.
