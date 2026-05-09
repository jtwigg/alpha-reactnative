# RN Monorepo

NX monorepo with a React Native (Expo) app and a Convex backend, managed with pnpm.

## Structure

```
/
├── nx.json                  — NX config with @nx/expo plugin
├── package.json             — workspace root (pnpm build approvals here)
├── pnpm-workspace.yaml      — declares packages/*
├── tsconfig.base.json       — shared TS config
└── packages/
    ├── reactnative/         — Expo React Native app
    │   ├── App.tsx          — ConvexProvider + HelloWorld screen
    │   ├── src/HelloWorld.tsx — useQuery(api.messages.getHello)
    │   ├── metro.config.js  — monorepo-aware Metro config
    │   └── .env.local       — EXPO_PUBLIC_CONVEX_URL placeholder
    └── server/              — Convex backend
        └── convex/
            ├── schema.ts    — messages table (text, author, createdAt)
            └── messages.ts  — getHello query, list, send, seed mutations
```

## Getting Started

### 1. Install dependencies

```sh
pnpm install
```

### 2. Set up Convex

From `packages/server`, log in and start the dev server. This generates the real `_generated/` types.

```sh
cd packages/server
pnpm convex dev
```

### 3. Seed the hello world row

Run once via the Convex dashboard or CLI:

```sh
pnpm convex run messages:seed
```

### 4. Fill in the Convex URL

Paste the URL from the Convex dashboard into `packages/reactnative/.env.local`:

```
EXPO_PUBLIC_CONVEX_URL=https://your-project.convex.cloud
```

### 5. Start the app

```sh
nx run reactnative:start
```

The `HelloWorld` component does a live `useQuery` against Convex — any change to that row streams instantly to the app.

## NX Commands

```sh
nx run reactnative:start     # Start Expo dev server
nx run reactnative:build     # Build the app
nx run server:dev            # Start Convex dev watcher
nx run server:deploy         # Deploy Convex functions to production
nx show projects             # List all projects
```
