import { AuthConfig } from 'convex/server';

// Clerk JWT issuer (Frontend API URL) for app_3L3Yo0NESQ48He3AynMeLsx1HTA.
// Override with CLERK_JWT_ISSUER_DOMAIN on the Convex dashboard (dev and prod).
const clerkIssuerDomain =
  process.env.CLERK_JWT_ISSUER_DOMAIN ??
  'https://awaited-jennet-2760.clerk.accounts.dev';

export default {
  providers: [
    {
      domain: clerkIssuerDomain,
      applicationID: 'convex',
    },
  ],
} satisfies AuthConfig;
