# John's App

Personal NX + pnpm monorepo. **iOS (Expo / React Native) is the main platform.** The web build is a secondary Expo static export that Vercel deploys. Ship JS and asset changes to iOS with **EAS Update** (no App Store review). Native changes still need a new EAS Build / store binary.

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

Also in the Clerk Dashboard: enable **email + password**, the **Native API**, and the **Convex** integration with a JWT template named `convex` (required — Convex will not accept Clerk tokens without it). The Frontend API URL / issuer for this app is `https://awaited-jennet-2760.clerk.accounts.dev`.

Users can only read or write their own `messages`. Chat and Whisper HTTP routes reject unauthenticated requests.

## Accounts John has to create (manual)

Nothing in this PR can finish these for you. Do them in this order:

1. **Clerk** — app `app_3L3Yo0NESQ48He3AynMeLsx1HTA` already exists. Link it (commands above). Do not create a second app. Turn on the **Convex** integration / JWT template named `convex`.
2. **Convex** — [dashboard.convex.dev](https://dashboard.convex.dev). This repo already has `packages/server/convex.json` pointing at team `john-twigg`. Copy the deployment URL (`https://….convex.cloud`). Set `CLERK_JWT_ISSUER_DOMAIN=https://awaited-jennet-2760.clerk.accounts.dev` on **both** the development and production deployments. Create a **deploy key** if CI should push functions.
3. **Expo / EAS** — [expo.dev](https://expo.dev) account. From `packages/reactnative`:
   ```sh
   npx eas-cli login
   npx eas-cli init
   npx eas-cli update:configure
   ```
   `update:configure` writes `runtimeVersion` / `updates.url` / `extra.eas.projectId` if they are still placeholders. Paste the project ID into `EAS_PROJECT_ID` (or `app.config.js`) so `updates.url` is `https://u.expo.dev/<project-id>`.
4. **Apple Developer Program** — paid membership for device/App Store builds. Create an App Store Connect app and put its numeric Apple ID in `eas.json` → `submit.production.ios.ascAppId`.
5. **Vercel** — [vercel.com](https://vercel.com). Import **this GitHub repo**. Root Directory = repo root. Vercel reads `vercel.json` and deploys **web only**.
6. **GitHub Actions** — create an Expo access token at [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens). In the GitHub repo: Settings → Secrets and variables → Actions → **EXPO_TOKEN**. Also add `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, and `EAS_PROJECT_ID` so the OTA JS bundle is built with production/preview keys.
7. **OpenAI** (only if you use Chat / Whisper) — set `OPENAI_API_KEY` on the Convex dashboard.

Replace placeholder branding before a store submission: `com.example.johnsapp`, `assets/images/icon.png`, `splash-icon.png`, Android adaptive icons, and `favicon.png`.

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

`packages/server/convex/auth.config.ts` defaults to that issuer and still honors `CLERK_JWT_ISSUER_DOMAIN` if you override it. Production Clerk uses `pk_live_` / the production Frontend API URL.

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
pnpm update:preview            # eas update --channel preview
pnpm update:production         # eas update --channel production
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
| `development` | `development` | Dev-client / simulator builds |
| `preview` | `preview` | Internal / TestFlight-style binaries |
| `production` | `production` | App Store binaries |

`updates.url` is `https://u.expo.dev/<EAS_PROJECT_ID>`.

### JS-only vs native (when you need a store build)

**OTA is enough** (keep `version` as-is, `pnpm update:preview` / `update:production` or push to `main`):

- Screen layout, copy, styles
- Clerk/Convex JS (`app/`, `providers/`, `convex/*.ts` that is not a native module)
- Images loaded as JS assets (not the iOS app icon / splash used by the binary)

**New EAS Build + App Store / TestFlight binary** (bump `version`, then `eas build`):

- New native dependency (`expo install` of a module with native code)
- Expo SDK upgrade
- Changes to `app.config.js` plugins, permissions, bundle id, icons, splash
- `ios/` / `android/` native files (this repo is CNG; those folders are generated at build time)
- `newArchEnabled` or other runtime flags

Incompatible OTAs are avoided by bumping `version` whenever native changes. A `1.0.1` update will not load on a `1.0.0` binary.

### Publish locally

```sh
cd packages/reactnative
npx eas-cli update:configure          # once, after eas init
pnpm update:preview                   # or: pnpm update:production
```

Preview/production release builds download the update in the background and apply it after a second launch. Dev clients can load a specific update from the Extensions tab.

### GitHub Actions

`.github/workflows/eas-update.yml`:

| Trigger | Channel |
| --- | --- |
| Push to `main` | `preview` |
| Git tag `v*` (e.g. `v1.0.1`) | `production` |
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

## App Store / EAS Build

From `packages/reactnative`:

```sh
npx eas-cli login
npx eas-cli init
npx eas-cli update:configure
npx eas-cli build --profile development --platform ios
npx eas-cli build --profile preview --platform ios
npx eas-cli build --profile production --platform ios
npx eas-cli submit --profile production --platform ios
```

Set **EAS secrets** for values inlined at native build time (do not put them in `eas.json`):

```sh
npx eas-cli secret:create --name EXPO_PUBLIC_CONVEX_URL --value https://YOUR_PROD.convex.cloud
npx eas-cli secret:create --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value pk_live_YOUR_KEY
```

GitHub Actions needs the same `EXPO_PUBLIC_*` values as repository secrets so OTA bundles match the binary.

## Manual checklist (cannot be done in this PR)

- [ ] Link Clerk app `app_3L3Yo0NESQ48He3AynMeLsx1HTA` (`npx -y clerk@latest auth login` then `clerk link --app app_3L3Yo0NESQ48He3AynMeLsx1HTA` + `clerk env pull`). Do not `clerk init`.
- [ ] Enable email+password, Native API, and the **Convex** integration / JWT template named `convex` in that Clerk app
- [ ] Log into Convex; set `CLERK_JWT_ISSUER_DOMAIN=https://awaited-jennet-2760.clerk.accounts.dev` on **dev and prod** deployments
- [ ] Fill `packages/reactnative/.env.local`
- [ ] Expo account; `eas-cli login` + `eas-cli init` + **`eas-cli update:configure`**
- [ ] Put EAS project ID in `EAS_PROJECT_ID` so `updates.url` is real
- [ ] GitHub secret **`EXPO_TOKEN`**, plus `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EAS_PROJECT_ID`
- [ ] Apple Developer; App Store Connect app; bundle id + `ascAppId`
- [ ] Replace icon/splash placeholders
- [ ] Import the GitHub repo into Vercel; set `EXPO_PUBLIC_*` (web only)
- [ ] Add Vercel and native origins in the Clerk dashboard
- [ ] `nx run server:deploy` before pointing clients at prod Convex

## Auth model

1. Expo wraps the tree in `ClerkProvider` + `ConvexProviderWithClerk` on iOS and web.
2. After Clerk has a session, Convex fetches the `convex` JWT.
3. `users.store` upserts `{ tokenIdentifier, name, email }` so data can foreign-key `users._id`.
4. `messages.list` / `messages.send` load the current user and index by `userId`.
5. Sign-in, sign-up (email verification code), and sign-out are the same screens on both platforms.
