import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';

/** Public DSN. Override with EXPO_PUBLIC_SENTRY_DSN if the Sentry project changes. */
export const DEFAULT_SENTRY_DSN =
  'https://208718c3494ccd1183983da6d1a06e7a@o4511655781335040.ingest.us.sentry.io/4512303348318208';

const AMOUNT_KEY =
  /amount|balance|value|worth|price|qty|quantity|dollars?|cents|holding|snapshot|net_?worth|market|cost/i;

type Primitive = string | number | boolean;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Drop finance amounts and nested request bodies from anything we send to Sentry. */
export function scrubSensitive(value: unknown, depth = 0): unknown {
  if (value == null || depth > 6) return value;
  if (Array.isArray(value)) return value.map((item) => scrubSensitive(item, depth + 1));
  if (!isPlainObject(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (lower === 'body' || lower === 'data' || lower === 'request_body' || lower === 'cookies') {
      out[key] = '[redacted]';
      continue;
    }
    if (AMOUNT_KEY.test(key)) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = scrubSensitive(nested, depth + 1);
  }
  return out;
}

function primitiveAttrs(data?: Record<string, unknown>): Record<string, Primitive> {
  const scrubbed = (scrubSensitive(data) ?? {}) as Record<string, unknown>;
  const out: Record<string, Primitive> = {};
  for (const [key, value] of Object.entries(scrubbed)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      out[key] = value.join(',');
    } else if (value != null) {
      out[key] = JSON.stringify(value);
    }
  }
  return out;
}

function stripRequestBody(event: Sentry.Event): void {
  if (!event.request) return;
  delete event.request.data;
  delete event.request.cookies;
}

export function initSentry() {
  if (Sentry.getClient()) return;

  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || DEFAULT_SENTRY_DSN,
    environment: Platform.OS,
    enableNative: Platform.OS !== 'web',
    enableLogs: true,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    enableCaptureFailedRequests: false,
    beforeSend(event) {
      stripRequestBody(event);
      if (event.extra) event.extra = scrubSensitive(event.extra) as typeof event.extra;
      if (event.contexts) event.contexts = scrubSensitive(event.contexts) as typeof event.contexts;
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.data) {
        breadcrumb.data = scrubSensitive(breadcrumb.data) as typeof breadcrumb.data;
      }
      return breadcrumb;
    },
    beforeSendLog(log) {
      if (log.attributes) {
        log.attributes = scrubSensitive(log.attributes) as typeof log.attributes;
      }
      return log;
    },
  });
}

export function logAuth(message: string, data?: Record<string, unknown>) {
  const attrs = primitiveAttrs(data);
  Sentry.addBreadcrumb({
    category: 'auth',
    level: 'info',
    message,
    data: attrs,
  });
  Sentry.logger.info(message, attrs);
}

export function captureAuthException(error: unknown, context?: Record<string, unknown>) {
  Sentry.captureException(error, {
    extra: primitiveAttrs(context),
  });
}

/** Query-string keys only — never values (OAuth codes, nonces, emails). */
export function queryParamKeys(search?: string | null): string[] {
  const raw =
    search ??
    (typeof window !== 'undefined' && window.location ? window.location.search : '');
  if (!raw) return [];
  try {
    return Array.from(new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw).keys());
  } catch {
    return [];
  }
}

export { Sentry };
