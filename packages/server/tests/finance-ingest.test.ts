import { describe, expect, it } from 'vitest';
import {
  decidePlainWrite,
  decideSnapshotWrite,
  formatFixedSum,
  interpolateBetween,
  planFillGaps,
  recordStatus,
  emptyUpsertCounts,
  assertBatchSize,
} from '../convex/finance/lib';
import { SNAPSHOT_PRECEDENCE } from '../convex/finance/hash';
import { parseAllowedUserIds, isFinanceSubjectAllowed } from '../convex/finance/auth';
import { addDays, daysBetween, monthEnd, monthStart } from '../convex/finance/dates';
import { BATCH_CAP } from '../convex/finance/validators';

describe('snapshot precedence', () => {
  it('is manual > observed > reconstructed > interpolated', () => {
    expect(SNAPSHOT_PRECEDENCE.manual).toBeGreaterThan(SNAPSHOT_PRECEDENCE.observed);
    expect(SNAPSHOT_PRECEDENCE.observed).toBeGreaterThan(SNAPSHOT_PRECEDENCE.reconstructed);
    expect(SNAPSHOT_PRECEDENCE.reconstructed).toBeGreaterThan(SNAPSHOT_PRECEDENCE.interpolated);
  });

  it('inserts when no existing row', () => {
    expect(
      decideSnapshotWrite(null, { source: 'interpolated', contentHash: 'aaa' }),
    ).toBe('inserted');
  });

  it('skips a lower-precedence incoming row', () => {
    expect(
      decideSnapshotWrite(
        { source: 'observed', contentHash: 'aaa' },
        { source: 'reconstructed', contentHash: 'bbb' },
      ),
    ).toBe('skipped_lower_precedence');
    expect(
      decideSnapshotWrite(
        { source: 'manual', contentHash: 'aaa' },
        { source: 'observed', contentHash: 'bbb' },
      ),
    ).toBe('skipped_lower_precedence');
  });

  it('updates when incoming is equal or higher precedence and hash differs', () => {
    expect(
      decideSnapshotWrite(
        { source: 'reconstructed', contentHash: 'aaa' },
        { source: 'reconstructed', contentHash: 'bbb' },
      ),
    ).toBe('updated');
    expect(
      decideSnapshotWrite(
        { source: 'reconstructed', contentHash: 'aaa' },
        { source: 'observed', contentHash: 'bbb' },
      ),
    ).toBe('updated');
    expect(
      decideSnapshotWrite(
        { source: 'observed', contentHash: 'aaa' },
        { source: 'manual', contentHash: 'bbb' },
      ),
    ).toBe('updated');
  });

  it('is unchanged when hashes match and incoming is not lower', () => {
    expect(
      decideSnapshotWrite(
        { source: 'observed', contentHash: 'aaa' },
        { source: 'observed', contentHash: 'aaa' },
      ),
    ).toBe('unchanged');
  });
});

describe('plain upserts', () => {
  it('returns inserted / updated / unchanged', () => {
    expect(decidePlainWrite(null, 'h1')).toBe('inserted');
    expect(decidePlainWrite('h1', 'h1')).toBe('unchanged');
    expect(decidePlainWrite('h1', 'h2')).toBe('updated');
  });

  it('counts per-row statuses', () => {
    const counts = emptyUpsertCounts();
    recordStatus(counts, 'a', 'inserted');
    recordStatus(counts, 'b', 'updated');
    recordStatus(counts, 'c', 'unchanged');
    recordStatus(counts, 'd', 'skipped_lower_precedence');
    expect(counts).toMatchObject({
      inserted: 1,
      updated: 1,
      unchanged: 1,
      skippedLowerPrecedence: 1,
    });
    expect(counts.results).toHaveLength(4);
  });

  it('caps batches at 500', () => {
    expect(BATCH_CAP).toBe(500);
    expect(() => assertBatchSize(500)).not.toThrow();
    expect(() => assertBatchSize(501)).toThrow(/Batch exceeds cap of 500/);
  });
});

describe('fillGaps interpolation', () => {
  it('writes daily linear points strictly between anchors', () => {
    const points = interpolateBetween(
      { asOf: '2026-07-31', balance: 100 },
      { asOf: '2026-08-03', balance: 400 },
    );
    expect(points.map((p) => p.asOf)).toEqual(['2026-08-01', '2026-08-02']);
    expect(points[0]).toMatchObject({
      source: 'interpolated',
      method: 'linear',
    });
    expect(points[0].balance).toBeCloseTo(200, 8);
    expect(points[1].balance).toBeCloseTo(300, 8);
    expect(daysBetween('2026-07-31', '2026-08-03')).toBe(3);
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
  });

  it('is idempotent for the same anchors', () => {
    const a = planFillGaps({
      from: '2026-07-31',
      to: '2026-08-10',
      anchors: [
        { asOf: '2026-07-31', balance: 10 },
        { asOf: '2026-08-10', balance: 100 },
      ],
    });
    const b = planFillGaps({
      from: '2026-07-31',
      to: '2026-08-10',
      anchors: [
        { asOf: '2026-07-31', balance: 10 },
        { asOf: '2026-08-10', balance: 100 },
      ],
    });
    expect(a).toEqual(b);
    expect(a).toHaveLength(9);
  });

  it('recomputes when a neighbor changes', () => {
    const before = planFillGaps({
      from: '2026-08-01',
      to: '2026-08-03',
      anchors: [
        { asOf: '2026-07-31', balance: 0 },
        { asOf: '2026-08-04', balance: 400 },
      ],
    });
    const after = planFillGaps({
      from: '2026-08-01',
      to: '2026-08-03',
      anchors: [
        { asOf: '2026-07-31', balance: 0 },
        { asOf: '2026-08-04', balance: 800 },
      ],
    });
    expect(before[0].balance).not.toBe(after[0].balance);
    expect(after.map((p) => p.balance)).toEqual([200, 400, 600]);
  });

  it('does not invent points with a single anchor', () => {
    expect(
      planFillGaps({
        from: '2026-07-01',
        to: '2026-07-31',
        anchors: [{ asOf: '2026-07-15', balance: 50 }],
      }),
    ).toEqual([]);
  });
});

describe('allowlist', () => {
  it('parses comma-separated Clerk subjects', () => {
    expect(parseAllowedUserIds(' user_1, user_2,,user_3 ')).toEqual([
      'user_1',
      'user_2',
      'user_3',
    ]);
    expect(parseAllowedUserIds(undefined)).toEqual([]);
    expect(parseAllowedUserIds('')).toEqual([]);
  });

  it('rejects subjects that are not listed', () => {
    expect(isFinanceSubjectAllowed('user_1', 'user_1,user_2')).toBe(true);
    expect(isFinanceSubjectAllowed('user_9', 'user_1,user_2')).toBe(false);
    expect(isFinanceSubjectAllowed('user_1', undefined)).toBe(false);
  });
});

describe('digest helpers', () => {
  it('sums money as an 8-decimal string', () => {
    expect(formatFixedSum([1250.5, -10.25, 0.125])).toBe('1240.37500000');
    expect(formatFixedSum([])).toBe('0.00000000');
    expect(monthStart('2026-07')).toBe('2026-07-01');
    expect(monthEnd('2026-07')).toBe('2026-07-31');
    expect(monthEnd('2026-02')).toBe('2026-02-28');
  });
});
