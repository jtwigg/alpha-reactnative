/**
 * JS-only OTA stamp. Bump `JS_OTA_BUILD` each time we publish JS.
 * Do not change `APP_VERSION` or `runtimeVersion` — that would miss
 * TestFlight build 3 (runtime 1.0.0).
 */
export const APP_VERSION = '1.0.0';
export const JS_OTA_BUILD = 17;

export function jsVersionLabel(appVersion = APP_VERSION, ota = JS_OTA_BUILD): string {
  return `v${appVersion} (ota ${ota})`;
}

export function shortUpdateId(updateId: string | null | undefined): string | null {
  if (!updateId) return null;
  const compact = updateId.replace(/-/g, '');
  return compact.length >= 8 ? compact.slice(0, 8) : compact;
}

export function formatPacific(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export type UpdateMeta = {
  updateId: string | null;
  createdAt: Date | null;
  embedded: boolean;
};

/** Second line: `1.0.0 · embedded` or `1.0.0 · a1b2c3d4 · Oct 24, 2026, 4:12 PM PDT`. */
export function formatBuildDetail(meta: UpdateMeta, appVersion = APP_VERSION): string {
  if (meta.embedded || !meta.updateId) return `${appVersion} · embedded`;
  const hash = shortUpdateId(meta.updateId) ?? 'embedded';
  if (!meta.createdAt) return `${appVersion} · ${hash}`;
  return `${appVersion} · ${hash} · ${formatPacific(meta.createdAt)}`;
}
