/** Direction locks after 8px, matching the email-briefings deck. */
export const ARCHIVE_LOCK_PX = 8;
/** Release past −90px commits archive. */
export const ARCHIVE_COMMIT_PX = 90;
export const ARCHIVE_UNDO_MS = 5_000;
export const ARCHIVE_SLIDE_MS = 250;
export const ARCHIVE_DONE_MS = 2_500;

export type SwipeLock = 'none' | 'horizontal' | 'vertical';

export function swipeLock(dx: number, dy: number): SwipeLock {
  if (Math.abs(dx) < ARCHIVE_LOCK_PX && Math.abs(dy) < ARCHIVE_LOCK_PX) return 'none';
  return Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
}

/** Cards only follow a leftward swipe. */
export function archiveTranslate(dx: number, lock: SwipeLock): number {
  if (lock !== 'horizontal') return 0;
  return Math.min(0, dx);
}

export function shouldCommitArchive(dx: number, lock: SwipeLock): boolean {
  return lock === 'horizontal' && dx <= -ARCHIVE_COMMIT_PX;
}

export function threadOpenUrl(webUrl: string, mobileUrl: string, os: string): string {
  if (os === 'ios' || os === 'android') return mobileUrl || webUrl;
  return webUrl;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatBriefingDate(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${DAYS[date.getUTCDay()]}, ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}
