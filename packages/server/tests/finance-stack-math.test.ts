import { describe, expect, it } from 'vitest';
import { buildStack, dragWindow, shade, windowIndexes } from '../../reactnative/lib/stack-math';

const COLORS = {
  cash: '#16a34a',
  investments: '#0a7ea4',
  real_estate: '#7c3aed',
  liability: '#c2410c',
  other: '#64748b',
};

const accounts = [
  { sourceId: 'visa', name: 'Visa', class: 'credit', group: 'liability' as const, values: [null, 200, 300] },
  { sourceId: 'chk', name: 'Checking', class: 'cash', group: 'cash' as const, values: [100, 100, 100] },
  { sourceId: 'sav', name: 'Savings', class: 'cash', group: 'cash' as const, values: [null, 400, 500] },
  { sourceId: 'brk', name: 'Brokerage', class: 'investments', group: 'investments' as const, values: [1_000, 1_100, 1_200] },
  { sourceId: 'home', name: 'Home', class: 'real_estate', group: 'real_estate' as const, values: [null, null, null] },
];

describe('stack math', () => {
  it('stacks groups bottom-up with loans below zero', () => {
    const model = buildStack({ accounts, level: 'group', includeLoans: true, groupColors: COLORS });
    expect(model.series.map((s) => s.key)).toEqual(['cash', 'investments', 'real_estate', 'liability']);
    expect(model.series[0].values).toEqual([100, 500, 600]);
    expect(model.series[3].values).toEqual([0, -200, -300]);
    expect(model.positive).toEqual([1_100, 1_600, 1_800]);
    expect(model.negative).toEqual([0, -200, -300]);
    expect(model.net).toEqual([1_100, 1_400, 1_500]);
    expect(model.covered).toEqual([true, true, true]);
  });

  it('drops loans in assets-only mode and orders accounts by size within a group', () => {
    const model = buildStack({ accounts, level: 'account', includeLoans: false, groupColors: COLORS });
    expect(model.series.map((s) => s.key)).toEqual(['sav', 'chk', 'brk', 'home']);
    expect(model.series[0].color).toBe(COLORS.cash);
    expect(model.series[1].color).not.toBe(COLORS.cash);
    expect(model.negative).toEqual([0, 0, 0]);
    expect(model.net).toEqual([1_100, 1_600, 1_800]);
  });

  it('lightens shades toward white', () => {
    expect(shade('#000000', 0, 3)).toBe('#000000');
    expect(shade('#000000', 2, 3)).toBe('#999999');
  });

  it('maps a date window to overview indexes', () => {
    const dates = ['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22'];
    expect(windowIndexes(dates, '2026-01-05', '2026-01-20')).toEqual([1, 2]);
    expect(windowIndexes(dates, '2025-01-01', '2027-01-01')).toEqual([0, 3]);
  });

  it('drags handles and the window body within bounds', () => {
    expect(dragWindow(2, 6, 'start', -5, 10)).toEqual([0, 6]);
    expect(dragWindow(2, 6, 'start', 10, 10)).toEqual([5, 6]);
    expect(dragWindow(2, 6, 'end', 10, 10)).toEqual([2, 9]);
    expect(dragWindow(2, 6, 'end', -10, 10)).toEqual([2, 3]);
    expect(dragWindow(2, 6, 'body', 10, 10)).toEqual([5, 9]);
    expect(dragWindow(2, 6, 'body', -10, 10)).toEqual([0, 4]);
  });
});
