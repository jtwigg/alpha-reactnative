# John's App

Personal NX + pnpm monorepo: an Expo app for **iOS and web**, with a **Convex** backend and **Clerk** authentication.

```
/
├── vercel.json              — Vercel import config (web export)
├── packages/
│   ├── reactnative/         — Expo Router app (iOS + static web)
│   │   ├── app.config.js    — bundle id, icons, splash, EAS project id
│   │   ├── eas.json         — EAS Build + Submit profiles
│   │   └── app/             — sign-in, sign-up, signed-in home + chat
│   └── server/              — Convex schema and functions
│       └── convex/
│           ├── auth.config.ts
│           ├── schema.ts    — users + per-user messages
│           ├── users.ts     — store / current / greeting
│           └── messages.ts  — authenticated list / send
```

## Why Clerk + Convex

This repo uses **Clerk for login** and **Convex for data**, wired together with Clerk's Convex JWT template.

| Option | Why not (for this app) |
| --- | --- |
| Convex Auth | Great when auth lives only in Convex, but email verification, native token storage, and the same UI on iOS + web are more work. OAuth on Expo needs extra deep-link setup. |
| Clerk + Convex | **Chosen.** `@clerk/expo` is a first-party SDK for native iOS and Expo web. Convex officially validates Clerk JWTs (`auth.config.ts` + `ConvexProviderWithClerk`), so every query/mutation can call `ctx.auth.getUserIdentity()` and load **that user's** row. Email + password, verification codes, sign-out, and SecureStore session cache are production defaults. |

Users can only read or write their own `messages`. Chat and Whisper HTTP routes reject unauthenticated requests. Whisper no longer ships an OpenAI key to the client.

## Accounts John has to create (manual)

Nothing in this PR can finish these for you. Do them in this order:

1. **Clerk** — [clerk.com/sign-up](https://clerk.com/sign-up). Create an application. Enable **email + password** (User & authentication). Enable the **Native API** (native applications). Enable the **Convex** integration (JWT template named `convex`). Copy the **Publishable Key** (`pk_test_…` / `pk_live_…`) and the **Frontend API URL** (`https://verb-noun-00.clerk.accounts.dev`).
2. **Convex** — [dashboard.convex.dev](https://dashboard.convex.dev). This repo already has `packages/server/convex.json` pointing at team `john-twigg`. Log in with that account (or create a new project and replace `convex.json`). Copy the deployment URL (`https://….convex.cloud`). Create a **deploy key** (Settings → Deploy Key) if Vercel or CI should push functions.
3. **Expo / EAS** — [expo.dev](https://expo.dev) account. Run `npx eas-cli login` and `npx eas-cli init` from `packages/reactnative` (this writes `extra.eas.projectId`).
4. **Apple Developer Program** — paid membership. Needed for device/App Store builds and Submit. You will also create an App Store Connect app and paste its numeric **Apple ID** into `packages/reactnative/eas.json` → `submit.production.ios.ascAppId`.
5. **Vercel** — [vercel.com](https://vercel.com). Import **this GitHub repo** (`jtwigg/alpha-reactnative`). Root Directory = repo root (leave default). Vercel reads `vercel.json`.
6. **OpenAI** (only if you use Chat / Whisper) — set `OPENAI_API_KEY` on the Convex dashboard.

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

In another terminal, or from the Convex dashboard → Settings → Environment Variables, set:

| Convex env var | Value |
| --- | --- |
| `CLERK_JWT_ISSUER_DOMAIN` | Clerk Frontend API URL, **no trailing slash** |
| `OPENAI_API_KEY` | optional, chat + Whisper |

Use the **development** deployment for `convex dev` and the **production** deployment for `npx convex deploy`. Set the same names on both; production Clerk uses the `pk_live_` / production Frontend API URL.

### 3. Expo env

Copy `packages/reactnative/.env.example` to `packages/reactnative/.env.local`:

```
EXPO_PUBLIC_CONVEX_URL=https://YOUR_DEPLOYMENT.convex.cloud
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_KEY
```

### 4. Run

```sh
# from repo root
nx run server:dev              # Convex (if not already running)
nx run reactnative:start       # Expo: press i (simulator) or w (web)
```

Sign up with email/password, enter the Clerk verification code, and you should land on the signed-in home screen. Sign out is on that screen.

### NX commands

```sh
pnpm typecheck                 # tsc for server + app
pnpm export:web                # Expo static web → packages/reactnative/dist
nx run reactnative:start
nx run reactnative:export:web
nx run server:dev
nx run server:deploy           # production Convex
nx run server:typecheck
```

## Web / Vercel

`packages/reactnative/app.config.js` sets `web.output` to `"static"`. The production web build is Expo's static export (not Next.js).

| Vercel setting | Value |
| --- | --- |
| Framework Preset | Other (`vercel.json` sets `"framework": null`) |
| Install command | `pnpm install` |
| Build command | `pnpm --filter @rn-monorepo/reactnative export:web` |
| Output directory | `packages/reactnative/dist` |
| Root Directory | repository root |

**Vercel environment variables** (Production and Preview):

| Name | Notes |
| --- | --- |
| `EXPO_PUBLIC_CONVEX_URL` | **Production** Convex URL (`https://….convex.cloud`) |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk `pk_live_…` in Production; `pk_test_…` is fine for Preview |

Optional: also deploy Convex from Vercel by wrapping the build:

```sh
cd packages/server && npx convex deploy --cmd 'cd ../reactnative && npx expo export --platform web' --cmd-url-env-name EXPO_PUBLIC_CONVEX_URL
```

That needs `CONVEX_DEPLOY_KEY` on Vercel. Otherwise run `nx run server:deploy` yourself whenever backend code changes.

In Clerk, add the Vercel URL (and `http://localhost:8081`) under **Allowed origins / redirect URLs**.

## App Store / EAS

From `packages/reactnative`:

```sh
npx eas-cli login
npx eas-cli init                 # fills extra.eas.projectId
npx eas-cli build --profile development --platform ios
npx eas-cli build --profile preview --platform ios
npx eas-cli build --profile production --platform ios
npx eas-cli submit --profile production --platform ios
```

Profiles in `eas.json`:

| Profile | What it is |
| --- | --- |
| `development` | Dev client, internal, iOS Simulator |
| `preview` | Internal distribution (TestFlight-style / ad hoc) |
| `production` | Store build, `autoIncrement` via remote app version |

Set these as **EAS secrets** (they are inlined at build time). Do not put secrets in `eas.json`.

```sh
npx eas-cli secret:create --name EXPO_PUBLIC_CONVEX_URL --value https://YOUR_PROD.convex.cloud
npx eas-cli secret:create --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value pk_live_YOUR_KEY
```

Optional identifier overrides: `IOS_BUNDLE_IDENTIFIER`, `ANDROID_PACKAGE`, `EAS_PROJECT_ID`, `EXPO_OWNER`.

Before the first production iOS build:

1. Paid **Apple Developer** membership.
2. Change `com.example.johnsapp` in `app.config.js` (or set `IOS_BUNDLE_IDENTIFIER`) to an id you own.
3. Replace placeholder icon / splash images.
4. In Clerk, add the iOS bundle identifier on the **Native applications** page.
5. Put the App Store Connect app id in `eas.json` → `submit.production.ios.ascAppId`.
6. Register the bundle id and signing via `npx eas-cli credentials` (EAS can manage certs and profiles).

`expo-dev-client` is installed so the `development` profile can produce a development build.

## Manual checklist (cannot be done in this PR)

- [ ] Create Clerk app; enable email+password, Native API, Convex JWT template
- [ ] Copy Clerk publishable key + Frontend API URL
- [ ] Log into Convex; set `CLERK_JWT_ISSUER_DOMAIN` (dev and prod)
- [ ] Optional: Convex `OPENAI_API_KEY`, `CONVEX_DEPLOY_KEY`
- [ ] Fill `packages/reactnative/.env.local`
- [ ] Create Expo account; `eas-cli login` + `eas-cli init`
- [ ] Enroll in Apple Developer; create App Store Connect app; set bundle id + `ascAppId`
- [ ] Replace icon/splash placeholders
- [ ] Import the GitHub repo into Vercel; set `EXPO_PUBLIC_*` env vars
- [ ] Add Vercel and native origins in the Clerk dashboard
- [ ] Run a production Convex deploy (`nx run server:deploy`) before pointing the web app at prod

## Auth model

1. Expo wraps the tree in `ClerkProvider` + `ConvexProviderWithClerk`.
2. After Clerk has a session, Convex fetches the `convex` JWT.
3. `users.store` upserts `{ tokenIdentifier, name, email }` so data can foreign-key `users._id`.
4. `messages.list` / `messages.send` load the current user and index by `userId`. Unauthenticated callers throw.
5. Sign-in, sign-up (email verification code), and sign-out are first-class screens.
