import { briefingItemId, THREAD_ID, type BriefingAccount } from '../../server/convex/briefings/payload';
import { RANGE_KEYS, type RangeKey } from '../../server/convex/finance/series';

/** Keep in sync with lib/app-links.json (write-app-links.mjs + app.config.js). */
export const APP_LINK_HOST = 'alpha-theta-silk.vercel.app';
export const APP_LINK_ORIGIN = `https://${APP_LINK_HOST}`;
export const APPLE_TEAM_ID = 'V488294NXN';
export const ANDROID_SHA256_CERT_FINGERPRINTS: string[] = [];

export const BRIEFING_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const ASK_ID = /^[A-Za-z0-9_.:-]{1,128}$/;
export const ACCOUNT_ID = /^[A-Za-z0-9_.:-]{1,128}$/;
export const APP_LINK_PATHS = [
  '/',
  '/home',
  '/briefings',
  '/briefings/*',
  '/finances',
  '/finances/*',
] as const;

export type BriefingItemRef = {
  date: string | null;
  account: BriefingAccount | null;
  threadId: string;
  itemId: string;
};

export function parseBriefingDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const match = BRIEFING_DATE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function parseAskId(value: string | string[] | undefined | null): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const trimmed = raw.trim();
  return ASK_ID.test(trimmed) ? trimmed : null;
}

export function parseAccountId(value: string | string[] | undefined | null): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const trimmed = decoded.trim();
  return ACCOUNT_ID.test(trimmed) ? trimmed : null;
}

export function parseRange(value: string | string[] | undefined | null): RangeKey | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  return (RANGE_KEYS as readonly string[]).includes(raw) ? (raw as RangeKey) : null;
}

export function parseBriefingItemRef(
  itemId: string | undefined | null,
  pathDate?: string | null,
): BriefingItemRef | null {
  if (!itemId) return null;
  const trimmed = itemId.trim();
  const full = /^(\d{4}-\d{2}-\d{2})-(personal|crankcase)-([0-9a-f]{6,24})$/i.exec(trimmed);
  if (full) {
    const date = parseBriefingDate(full[1]);
    if (!date) return null;
    const account = full[2].toLowerCase() as BriefingAccount;
    const threadId = full[3].toLowerCase();
    return { date, account, threadId, itemId: briefingItemId(date, account, threadId) };
  }
  const withAccount = /^(personal|crankcase)-([0-9a-f]{6,24})$/i.exec(trimmed);
  if (withAccount) {
    const date = pathDate ? parseBriefingDate(pathDate) : null;
    const account = withAccount[1].toLowerCase() as BriefingAccount;
    const threadId = withAccount[2].toLowerCase();
    return {
      date,
      account,
      threadId,
      itemId: date ? briefingItemId(date, account, threadId) : trimmed,
    };
  }
  if (THREAD_ID.test(trimmed) && !trimmed.includes('-')) {
    return { date: pathDate ? parseBriefingDate(pathDate) : null, account: null, threadId: trimmed.toLowerCase(), itemId: trimmed };
  }
  return null;
}

export function homePath(askId?: string | null): string {
  const ask = askId ? parseAskId(askId) : null;
  return ask ? `/home?ask=${encodeURIComponent(ask)}` : '/';
}

export function briefingsPath(date?: string | null, itemId?: string | null): string {
  const day = date ? parseBriefingDate(date) : null;
  if (!day) return '/briefings';
  const item = itemId ? parseBriefingItemRef(itemId, day) : null;
  if (item) return `/briefings/${day}/items/${encodeURIComponent(item.itemId)}`;
  return `/briefings/${day}`;
}

export function accountPath(
  accountId: string,
  query: { range?: RangeKey | null; demo?: boolean } = {},
): string {
  const id = parseAccountId(accountId);
  if (!id) return '/finances';
  const params = new URLSearchParams();
  if (query.range) params.set('range', query.range);
  if (query.demo) params.set('demo', '1');
  const suffix = params.toString();
  return `/finances/${encodeURIComponent(id)}${suffix ? `?${suffix}` : ''}`;
}

const RETURN_PREFIX = /^\/(?:$|home(?:\/|$|\?)|briefings(?:\/|$|\?)|finances(?:\/|$|\?))/;

/** Only in-app paths. Rejects protocol-relative and off-origin URLs. */
export function safeReturnPath(value: string | string[] | undefined | null): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('://')) return null;
  if (!RETURN_PREFIX.test(decoded)) return null;
  return decoded;
}

export function currentAppPath(
  pathname: string,
  params: Record<string, string | string[] | undefined> = {},
): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const query = new URLSearchParams();
  const ask = parseAskId(params.ask);
  const range = parseRange(params.range);
  if (ask) query.set('ask', ask);
  if (range) query.set('range', range);
  if (params.demo === '1' || params.demo === 'true') query.set('demo', '1');
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export function signInPath(returnTo?: string | null): string {
  const next = returnTo ? safeReturnPath(returnTo) : null;
  return next && next !== '/' ? `/sign-in?return=${encodeURIComponent(next)}` : '/sign-in';
}

export function findBriefingItem<T extends { threadId: string }>(
  day: { personal: { priorities: T[]; glance: T[] } | null; crankcase: { priorities: T[]; glance: T[] } | null } | null | undefined,
  ref: BriefingItemRef,
): { account: BriefingAccount; item: T } | null {
  if (!day) return null;
  const accounts: BriefingAccount[] = ref.account ? [ref.account] : ['personal', 'crankcase'];
  for (const account of accounts) {
    const section = day[account];
    if (!section) continue;
    const item = [...section.priorities, ...section.glance].find((row) => row.threadId.toLowerCase() === ref.threadId);
    if (item) return { account, item };
  }
  return null;
}

export function appleAppId(bundleId: string): string {
  return `${APPLE_TEAM_ID}.${bundleId}`;
}

export function appleAppSiteAssociation(bundleId: string) {
  const appId = appleAppId(bundleId);
  return {
    applinks: {
      apps: [] as string[],
      details: [
        {
          appID: appId,
          paths: [...APP_LINK_PATHS],
          appIDs: [appId],
          components: APP_LINK_PATHS.map((path) => ({ '/': path })),
        },
      ],
    },
  };
}

export function assetLinksJson(packageName: string, fingerprints: string[] = ANDROID_SHA256_CERT_FINGERPRINTS) {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
      ...(fingerprints.length === 0
        ? {
            _todo: 'Add the SHA256 cert fingerprint from EAS Android credentials (eas credentials). Not present in eas.json or the repo.',
          }
        : {}),
    },
  ];
}
