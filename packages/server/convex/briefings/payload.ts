import { parseIsoDate } from '../finance/dates';

export const BRIEFING_ACCOUNTS = ['personal', 'crankcase'] as const;
export type BriefingAccount = (typeof BRIEFING_ACCOUNTS)[number];

export const DECK_NAME: Record<BriefingAccount, 'Personal' | 'Crankcase'> = {
  personal: 'Personal',
  crankcase: 'Crankcase',
};

export const THREAD_ID = /^[0-9a-f]{6,24}$/i;
export const HTTPS_URL = /^https:\/\//;

export const PRIORITY_CAP = 50;
export const GLANCE_CAP = 100;
export const BREAKDOWN_CAP = 20;

export type GlanceItem = {
  threadId: string;
  sender: string;
  gist: string;
  webUrl: string;
  mobileUrl: string;
};

export type PriorityItem = GlanceItem & {
  rank: number;
  deadline: string;
  todo: string;
};

export type RestCounts = {
  total: number;
  breakdown: { label: string; count: number }[];
};

export type AccountBriefing = {
  account: BriefingAccount;
  deckName: 'Personal' | 'Crankcase';
  headline: string;
  sub: string;
  priorityHeading?: string;
  glanceHeading?: string;
  priorities: PriorityItem[];
  glance: GlanceItem[];
  rest: RestCounts;
};

export type BriefingDay = {
  date: string;
  accounts: Record<BriefingAccount, AccountBriefing>;
};

export type ParseError = { path: string; message: string };

export class BriefingPayloadError extends Error {
  readonly errors: ParseError[];
  constructor(errors: ParseError[]) {
    super(
      errors.length === 1
        ? `${errors[0].path}: ${errors[0].message}`
        : `Validation failed (${errors.length} errors): ${errors
            .slice(0, 8)
            .map((error) => `${error.path}: ${error.message}`)
            .join('; ')}`,
    );
    this.name = 'BriefingPayloadError';
    this.errors = errors;
  }
}

/** Stable feedback id: date + account + Gmail thread id, not card position. */
export function briefingItemId(date: string, account: string, threadId: string): string {
  return `${date}-${account}-${threadId}`;
}

export function restLine(section: Pick<AccountBriefing, 'priorities' | 'glance' | 'rest'>): string {
  const parts = section.rest.breakdown.map((row) => `${row.count} ${row.label}`).join(' · ');
  const other = parts ? `${section.rest.total} other (${parts})` : `${section.rest.total} other`;
  return `${section.priorities.length} priorities · ${section.glance.length} worth a glance · ${other}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown, path: string, errors: ParseError[], max: number, required = true): string {
  if (value == null) {
    if (required) errors.push({ path, message: 'required' });
    return '';
  }
  if (typeof value !== 'string') {
    errors.push({ path, message: 'must be a string' });
    return '';
  }
  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    errors.push({ path, message: 'must not be empty' });
    return '';
  }
  if (trimmed.length > max) {
    errors.push({ path, message: `max ${max} characters` });
  }
  return trimmed.slice(0, max);
}

function int(value: unknown, path: string, errors: ParseError[], min = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    errors.push({ path, message: 'must be an integer' });
    return 0;
  }
  if (value < min) {
    errors.push({ path, message: `must be >= ${min}` });
  }
  return value;
}

function parseGlance(raw: unknown, path: string, errors: ParseError[]): GlanceItem {
  if (!isRecord(raw)) {
    errors.push({ path, message: 'must be an object' });
    return { threadId: '', sender: '', gist: '', webUrl: '', mobileUrl: '' };
  }
  const threadId = str(raw.threadId, `${path}.threadId`, errors, 40);
  if (threadId && !THREAD_ID.test(threadId)) {
    errors.push({ path: `${path}.threadId`, message: 'must be 6–24 hex characters' });
  }
  const webUrl = str(raw.webUrl, `${path}.webUrl`, errors, 500);
  const mobileUrl = str(raw.mobileUrl, `${path}.mobileUrl`, errors, 500);
  if (webUrl && !HTTPS_URL.test(webUrl)) {
    errors.push({ path: `${path}.webUrl`, message: 'must start with https://' });
  }
  if (mobileUrl && !HTTPS_URL.test(mobileUrl)) {
    errors.push({ path: `${path}.mobileUrl`, message: 'must start with https://' });
  }
  return {
    threadId,
    sender: str(raw.sender, `${path}.sender`, errors, 200),
    gist: str(raw.gist, `${path}.gist`, errors, 300),
    webUrl,
    mobileUrl,
  };
}

function parsePriority(raw: unknown, path: string, errors: ParseError[]): PriorityItem {
  const glance = parseGlance(raw, path, errors);
  if (!isRecord(raw)) {
    return { ...glance, rank: 0, deadline: '', todo: '' };
  }
  return {
    ...glance,
    rank: int(raw.rank, `${path}.rank`, errors, 1),
    deadline: str(raw.deadline, `${path}.deadline`, errors, 80),
    todo: str(raw.todo, `${path}.todo`, errors, 400),
  };
}

function parseRest(raw: unknown, path: string, errors: ParseError[]): RestCounts {
  if (!isRecord(raw)) {
    errors.push({ path, message: 'must be an object' });
    return { total: 0, breakdown: [] };
  }
  const breakdownRaw = raw.breakdown;
  if (!Array.isArray(breakdownRaw)) {
    errors.push({ path: `${path}.breakdown`, message: 'must be an array' });
    return { total: int(raw.total, `${path}.total`, errors, 0), breakdown: [] };
  }
  if (breakdownRaw.length > BREAKDOWN_CAP) {
    errors.push({ path: `${path}.breakdown`, message: `max ${BREAKDOWN_CAP} rows` });
  }
  const breakdown = breakdownRaw.slice(0, BREAKDOWN_CAP).map((row, index) => {
    if (!isRecord(row)) {
      errors.push({ path: `${path}.breakdown[${index}]`, message: 'must be an object' });
      return { label: '', count: 0 };
    }
    return {
      label: str(row.label, `${path}.breakdown[${index}].label`, errors, 80),
      count: int(row.count, `${path}.breakdown[${index}].count`, errors, 0),
    };
  });
  return { total: int(raw.total, `${path}.total`, errors, 0), breakdown };
}

function parseAccount(
  raw: unknown,
  expected: BriefingAccount,
  path: string,
  errors: ParseError[],
): AccountBriefing {
  if (!isRecord(raw)) {
    errors.push({ path, message: 'must be an object' });
    return {
      account: expected,
      deckName: DECK_NAME[expected],
      headline: '',
      sub: '',
      priorities: [],
      glance: [],
      rest: { total: 0, breakdown: [] },
    };
  }
  const account = str(raw.account, `${path}.account`, errors, 20);
  if (account && account !== expected) {
    errors.push({ path: `${path}.account`, message: `must be "${expected}"` });
  }
  const deckName = str(raw.deckName, `${path}.deckName`, errors, 20);
  if (deckName && deckName !== DECK_NAME[expected]) {
    errors.push({ path: `${path}.deckName`, message: `must be "${DECK_NAME[expected]}"` });
  }
  if (!Array.isArray(raw.priorities)) {
    errors.push({ path: `${path}.priorities`, message: 'must be an array' });
  }
  if (!Array.isArray(raw.glance)) {
    errors.push({ path: `${path}.glance`, message: 'must be an array' });
  }
  const prioritiesRaw = Array.isArray(raw.priorities) ? raw.priorities : [];
  const glanceRaw = Array.isArray(raw.glance) ? raw.glance : [];
  if (prioritiesRaw.length > PRIORITY_CAP) {
    errors.push({ path: `${path}.priorities`, message: `max ${PRIORITY_CAP} items` });
  }
  if (glanceRaw.length > GLANCE_CAP) {
    errors.push({ path: `${path}.glance`, message: `max ${GLANCE_CAP} items` });
  }
  const priorities = prioritiesRaw.slice(0, PRIORITY_CAP).map((item, index) =>
    parsePriority(item, `${path}.priorities[${index}]`, errors),
  );
  const glance = glanceRaw.slice(0, GLANCE_CAP).map((item, index) =>
    parseGlance(item, `${path}.glance[${index}]`, errors),
  );
  const priorityHeading = str(raw.priorityHeading, `${path}.priorityHeading`, errors, 80, false);
  const glanceHeading = str(raw.glanceHeading, `${path}.glanceHeading`, errors, 80, false);
  return {
    account: expected,
    deckName: DECK_NAME[expected],
    headline: str(raw.headline, `${path}.headline`, errors, 300),
    sub: str(raw.sub, `${path}.sub`, errors, 400, false),
    ...(priorityHeading ? { priorityHeading } : {}),
    ...(glanceHeading ? { glanceHeading } : {}),
    priorities,
    glance,
    rest: parseRest(raw.rest, `${path}.rest`, errors),
  };
}

export function parseBriefingDay(raw: unknown): BriefingDay {
  const errors: ParseError[] = [];
  if (!isRecord(raw)) {
    throw new BriefingPayloadError([{ path: '$', message: 'body must be a JSON object' }]);
  }
  const date = str(raw.date, 'date', errors, 10);
  if (date) {
    try {
      parseIsoDate(date);
    } catch (error) {
      errors.push({
        path: 'date',
        message: error instanceof Error ? error.message : 'must be YYYY-MM-DD',
      });
    }
  }
  if (!isRecord(raw.accounts)) {
    errors.push({ path: 'accounts', message: 'must be an object with personal and crankcase' });
    throw new BriefingPayloadError(errors);
  }
  const personal = parseAccount(raw.accounts.personal, 'personal', 'accounts.personal', errors);
  const crankcase = parseAccount(raw.accounts.crankcase, 'crankcase', 'accounts.crankcase', errors);
  if (errors.length > 0) throw new BriefingPayloadError(errors);
  return { date, accounts: { personal, crankcase } };
}

export type FeedbackReaction = 'remember' | 'stop' | 'archive';

export type FeedbackInput = {
  deck?: unknown;
  date?: unknown;
  itemId?: unknown;
  title?: unknown;
  sender?: unknown;
  threadUrl?: unknown;
  threadId?: unknown;
  account?: unknown;
  reaction?: unknown;
  comment?: unknown;
};

export type FeedbackWebhookPayload = {
  source: 'email-briefing-deck';
  deck: string;
  date: string;
  itemId: string;
  title: string;
  sender: string;
  threadUrl: string;
  threadId: string;
  account: string;
  reaction: FeedbackReaction | null;
  comment: string;
  at: string;
};

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Same sanitizing and required-field rules as the email-briefings
 * `/api/feedback` handler. `itemId` is always date-account-threadId.
 */
export function buildFeedbackPayload(
  body: FeedbackInput,
  at: string = new Date().toISOString(),
): FeedbackWebhookPayload {
  const reactionRaw = body.reaction;
  const reaction = ['remember', 'stop', 'archive'].includes(reactionRaw as string)
    ? (reactionRaw as FeedbackReaction)
    : null;
  if (reactionRaw != null && !reaction) {
    throw new BriefingPayloadError([
      { path: 'reaction', message: 'must be remember|stop|archive|null' },
    ]);
  }
  const comment = clip(body.comment, 1000);
  const deck = clip(body.deck, 40);
  const title = clip(body.title, 300);
  const date = clip(body.date, 20);
  const sender = clip(body.sender, 200);
  const account = ['personal', 'crankcase'].includes(body.account as string)
    ? (body.account as BriefingAccount)
    : '';
  const threadIdRaw = clip(body.threadId, 40);
  const threadId = THREAD_ID.test(threadIdRaw) ? threadIdRaw : '';
  if (reaction === 'archive' && (!threadId || !account)) {
    throw new BriefingPayloadError([
      { path: 'archive', message: 'archive needs threadId and account' },
    ]);
  }
  if (!deck || !title) {
    throw new BriefingPayloadError([{ path: 'deck|title', message: 'deck and title required' }]);
  }
  if (!reaction && !comment) {
    throw new BriefingPayloadError([
      { path: 'reaction|comment', message: 'reaction or comment required' },
    ]);
  }
  let threadUrl = clip(body.threadUrl, 500);
  if (threadUrl && !HTTPS_URL.test(threadUrl)) threadUrl = '';
  const itemId = threadId && account && date ? briefingItemId(date, account, threadId) : clip(body.itemId, 80);
  return {
    source: 'email-briefing-deck',
    deck,
    date,
    itemId,
    title,
    sender,
    threadUrl,
    threadId,
    account,
    reaction,
    comment,
    at,
  };
}
