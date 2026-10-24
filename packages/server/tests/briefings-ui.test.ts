import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_COMMIT_PX,
  ARCHIVE_LOCK_PX,
  ARCHIVE_UNDO_MS,
  archiveTranslate,
  formatBriefingDate,
  shouldCommitArchive,
  swipeLock,
  threadOpenUrl,
} from '../../reactnative/lib/briefing-gesture';
import { isSensitiveSurface, scrubSensitive } from '../../reactnative/lib/sentry-scrub';

describe('swipe-to-archive', () => {
  it('locks after 8px and only follows a leftward swipe', () => {
    expect(swipeLock(4, 2)).toBe('none');
    expect(swipeLock(ARCHIVE_LOCK_PX, 2)).toBe('horizontal');
    expect(swipeLock(2, ARCHIVE_LOCK_PX)).toBe('vertical');
    expect(archiveTranslate(-40, 'horizontal')).toBe(-40);
    expect(archiveTranslate(40, 'horizontal')).toBe(0);
    expect(archiveTranslate(-40, 'vertical')).toBe(0);
  });

  it('commits past −90px and uses a 5 second undo', () => {
    expect(shouldCommitArchive(-ARCHIVE_COMMIT_PX, 'horizontal')).toBe(true);
    expect(shouldCommitArchive(-ARCHIVE_COMMIT_PX + 1, 'horizontal')).toBe(false);
    expect(shouldCommitArchive(-200, 'vertical')).toBe(false);
    expect(ARCHIVE_UNDO_MS).toBe(5_000);
  });
});

describe('gmail links', () => {
  const web = 'https://mail.google.com/mail/?authuser=user@example.com#all/thread-f:1';
  const mobile = 'https://mail.google.com/mail/mu/mp/?authuser=user@example.com#cv/all/abc';

  it('uses the mobile link on iOS and Android, desktop on web', () => {
    expect(threadOpenUrl(web, mobile, 'ios')).toBe(mobile);
    expect(threadOpenUrl(web, mobile, 'android')).toBe(mobile);
    expect(threadOpenUrl(web, mobile, 'web')).toBe(web);
  });
});

describe('date label', () => {
  it('formats YYYY-MM-DD in UTC so the calendar day does not shift', () => {
    expect(formatBriefingDate('2026-01-15')).toBe('Thu, Jan 15');
  });
});

describe('sentry never logs briefing content', () => {
  it('redacts gist, sender, comment, and thread fields', () => {
    const scrubbed = scrubSensitive({
      gist: 'Example Co needs a signed form',
      sender: 'Example Sender',
      comment: 'remember this',
      threadId: '112210f47de98115',
      threadUrl: 'https://mail.google.com/mail/x',
      title: 'secret',
      date: '2026-01-15',
    }) as Record<string, unknown>;
    expect(scrubbed.gist).toBe('[redacted]');
    expect(scrubbed.sender).toBe('[redacted]');
    expect(scrubbed.comment).toBe('[redacted]');
    expect(scrubbed.threadId).toBe('[redacted]');
    expect(scrubbed.threadUrl).toBe('[redacted]');
    expect(scrubbed.title).toBe('[redacted]');
    expect(scrubbed.date).toBe('2026-01-15');
  });

  it('redacts TWR amounts and never treats finance routes as safe', () => {
    const scrubbed = scrubSensitive({
      cumulative: 0.08,
      annualized: 0.07,
      flowId: 'flow_1',
      twr: 0.1,
    }) as Record<string, unknown>;
    expect(scrubbed.cumulative).toBe('[redacted]');
    expect(scrubbed.annualized).toBe('[redacted]');
    expect(scrubbed.flowId).toBe('[redacted]');
    expect(scrubbed.twr).toBe('[redacted]');
    expect(isSensitiveSurface('/finances/account/acc_1')).toBe(true);
  });

  it('treats briefing routes as a sensitive surface', () => {
    expect(isSensitiveSurface('/briefings')).toBe(true);
    expect(isSensitiveSurface('email-briefing-deck')).toBe(true);
    expect(isSensitiveSurface('/sign-in')).toBe(false);
  });
});
