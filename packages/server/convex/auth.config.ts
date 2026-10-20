import { AuthConfig } from 'convex/server';

// Clerk JWT issuer (Frontend API URL). Set CLERK_JWT_ISSUER_DOMAIN on the
// Convex dashboard for both the dev and prod deployments.
// Dev example: https://verb-noun-00.clerk.accounts.dev
// Prod example: https://clerk.yourdomain.com
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: 'convex',
    },
  ],
} satisfies AuthConfig;
