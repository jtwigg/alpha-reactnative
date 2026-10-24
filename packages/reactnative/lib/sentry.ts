import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';

import { isSensitiveSurface, redactCurrencyText, scrubSensitive } from '@/lib/sentry-scrub';

/** Public DSN. Override with EXPO_PUBLIC_SENTRY_DSN if the Sentry project changes. */
export const DEFAULT_SENTRY_DSN =
  'https://208718c3494ccd1183983da6d1a06e7a@o4511655781335040.ingest.us.sentry.io/4512303348318208';

type Primitive = string | number | boolean;

export { scrubSensitive } from '@/lib/sentry-scrub';

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

function isSensitiveEvent(event: Sentry.Event): boolean {
  const url = event.request?.url ?? '';
  const transaction = event.transaction ?? '';
  return isSensitiveSurface(`${url} ${transaction}`);
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
      if (isSensitiveEvent(event)) {
        if (event.request) {
          delete event.request.query_string;
          delete event.request.data;
        }
        event.extra = undefined;
      }
      if (event.message) event.message = redactCurrencyText(event.message);
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      const haystack = `${breadcrumb.message ?? ''} ${breadcrumb.category ?? ''} ${JSON.stringify(breadcrumb.data ?? {})}`;
      if (isSensitiveSurface(haystack)) {
        breadcrumb.data = undefined;
        if (breadcrumb.message) breadcrumb.message = redactCurrencyText(breadcrumb.message);
      }
      if (breadcrumb.data) {
        breadcrumb.data = scrubSensitive(breadcrumb.data) as typeof breadcrumb.data;
      }
      return breadcrumb;
    },
    beforeSendLog(log) {
      if (log.attributes) {
        log.attributes = scrubSensitive(log.attributes) as typeof log.attributes;
      }
      if (typeof log.message === 'string') {
        log.message = redactCurrencyText(log.message);
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
