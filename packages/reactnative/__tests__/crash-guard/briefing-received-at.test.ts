import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { formatReceivedAt } from '../../../server/convex/briefings/receivedAt';

const root = join(__dirname, '../..');

describe('briefing email received time', () => {
  it('formats locally and is wired on BriefingCard', () => {
    const now = new Date(2026, 9, 27, 15, 0, 0).getTime();
    expect(formatReceivedAt(new Date(2026, 9, 27, 9, 42, 0).getTime(), now)).toBe('9:42 AM');
    expect(formatReceivedAt(undefined, now)).toBeNull();
    const card = readFileSync(join(root, 'components/briefing/card.tsx'), 'utf8');
    expect(card).toContain('formatReceivedAt');
    expect(card).toContain('receivedAt');
    expect(card).toContain('receivedLabel');
  });
});
