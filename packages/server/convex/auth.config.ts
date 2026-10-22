import { AuthConfig } from 'convex/server';

// Clerk JWT issuer (Frontend API URL) for app_3L3Yo0NESQ48He3AynMeLsx1HTA.
// applicationID must match the token `aud` claim. Clerk's Convex integration
// puts `aud: "convex"` on the **default session token** — there is no JWT
// template named `convex` to create. Override the issuer with
// CLERK_JWT_ISSUER_DOMAIN or CLERK_FRONTEND_API_URL on the Convex dashboard.
const clerkIssuerDomain =
  process.env.CLERK_JWT_ISSUER_DOMAIN ??
  process.env.CLERK_FRONTEND_API_URL ??
  'https://awaited-jennet-2760.clerk.accounts.dev';

export default {
  providers: [
    {
      domain: clerkIssuerDomain,
      applicationID: 'convex',
    },
  ],
} satisfies AuthConfig;
