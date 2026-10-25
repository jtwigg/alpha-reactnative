import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../..');

const screens: Array<{ file: string; needle: RegExp; min?: number }> = [
  { file: 'app/_layout.tsx', needle: /QueryErrorBoundary/, min: 1 },
  { file: 'app/(tabs)/_layout.tsx', needle: /QueryErrorBoundary/, min: 1 },
  { file: 'app/(tabs)/index.tsx', needle: /QueryErrorBoundary/, min: 3 },
  { file: 'components/briefing/page.tsx', needle: /QueryErrorBoundary/, min: 1 },
  { file: 'app/(tabs)/finances.tsx', needle: /FinanceErrorBoundary|QueryErrorBoundary/, min: 1 },
  { file: 'app/finances/[accountId].tsx', needle: /QueryErrorBoundary/, min: 1 },
];

describe('every screen wraps Convex queries in an error boundary', () => {
  it.each(screens)('$file has an error boundary', ({ file, needle, min = 1 }) => {
    const source = readFileSync(join(root, file), 'utf8');
    const matches = source.match(new RegExp(needle, 'g')) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(min);
  });
});
