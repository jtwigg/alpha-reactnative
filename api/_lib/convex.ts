export type ConvexFinanceClient = {
  call: (op: string, args: Record<string, unknown>) => Promise<unknown>;
};

export function convexSiteUrl(
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): string | undefined {
  if (env.CONVEX_SITE_URL) return env.CONVEX_SITE_URL.replace(/\/$/, '');
  const cloud = env.EXPO_PUBLIC_CONVEX_URL;
  if (cloud?.includes('.convex.cloud')) {
    return cloud.replace('.convex.cloud', '.convex.site').replace(/\/$/, '');
  }
  return undefined;
}

export function createConvexFinanceClient(
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
  fetchImpl: typeof fetch = fetch,
): ConvexFinanceClient {
  return {
    async call(op, args) {
      const site = convexSiteUrl(env);
      const secret = env.FINANCE_SERVER_SECRET;
      if (!site || !secret) {
        throw new Error(
          'Set CONVEX_SITE_URL (or EXPO_PUBLIC_CONVEX_URL) and FINANCE_SERVER_SECRET',
        );
      }
      const response = await fetchImpl(`${site}/finance/server`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ op, args }),
      });
      const text = await response.text();
      let parsed: { result?: unknown; error?: string } = {};
      try {
        parsed = text ? (JSON.parse(text) as { result?: unknown; error?: string }) : {};
      } catch {
        parsed = { error: text };
      }
      if (!response.ok) {
        throw new Error(
          parsed.error ?? `Convex finance ${op} failed (${response.status})`,
        );
      }
      return parsed.result;
    },
  };
}
