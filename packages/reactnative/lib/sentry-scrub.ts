const AMOUNT_KEY =
  /amount|balance|value|worth|price|qty|quantity|dollars?|cents|holding|snapshot|net_?worth|market|cost|cash|equity|liabilit|asset|txn|transaction|gain|pnl|allocat|units?|position|credit|debt|available|principal|interest|nav|total|byclass|series|twr|flowid|cumulative|annualized|startonanchor|flowsfully/i;

/** Item text, senders, Gmail links, comments — never leave the device toward Sentry. */
const BRIEFING_CONTENT_KEY =
  /^(gist|headline|sub|sender|title|todo|comment|who|deadline|threadurl|threadid|itemid|deck|deckname|restline|weburl|mobileurl|priorities|glance|briefing)$/i;

const SENSITIVE_SURFACE =
  /\/finances(?:\/|$)|finance\/|net-?worth|\/api\/mcp|\/briefings(?:\/|$)|briefing\/|email-briefing/i;

type Plain = Record<string, unknown>;

function isPlainObject(value: unknown): value is Plain {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isSensitiveSurface(text: string): boolean {
  return SENSITIVE_SURFACE.test(text);
}

/** Drop finance amounts and briefing item text from anything we send to Sentry. */
export function scrubSensitive(value: unknown, depth = 0): unknown {
  if (value == null || depth > 6) return value;
  if (Array.isArray(value)) return value.map((item) => scrubSensitive(item, depth + 1));
  if (!isPlainObject(value)) return value;

  const out: Plain = {};
  for (const [key, nested] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (lower === 'body' || lower === 'data' || lower === 'request_body' || lower === 'cookies') {
      out[key] = '[redacted]';
      continue;
    }
    if (AMOUNT_KEY.test(key) || BRIEFING_CONTENT_KEY.test(key)) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = scrubSensitive(nested, depth + 1);
  }
  return out;
}

export function redactCurrencyText(text: string): string {
  return text.replace(/\$[\d,]+(?:\.\d+)?/g, '$[redacted]');
}
