import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { briefingBannerLabel, briefingItemCount } from '../../components/home-banners';
import { LIGHT } from '../../lib/app-theme';

const root = join(__dirname, '../..');

describe('home is sparse and uses the finances theme', () => {
  it('keeps only banners, version, and quick-ask on Home', () => {
    const home = readFileSync(join(root, 'app/(tabs)/index.tsx'), 'utf8');
    expect(home).toContain('HomeUpdateBannerHost');
    expect(home).toContain('VersionLabel');
    expect(home).toContain('HomeBriefingBanner');
    expect(home).toContain('HomeFinanceBanner');
    expect(home).toContain('HomeThread');
    expect(home).toContain('ChatInput');
    expect(home).not.toContain("from '@/components/chat/home-briefing'");
    expect(home).not.toContain('BriefingCard');
    expect(home).not.toContain('HomeGreeting');
    expect(home.match(/QueryErrorBoundary/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('summarizes pending briefing items as new emails', () => {
    expect(briefingBannerLabel(0)).toBe('No new emails');
    expect(briefingBannerLabel(1)).toBe('1 new email');
    expect(briefingBannerLabel(3)).toBe('3 new emails');
    expect(
      briefingItemCount({
        personalPriorities: 2,
        crankcasePriorities: 1,
        personalGlance: 0,
        crankcaseGlance: 0,
      }),
    ).toBe(3);
  });

  it('exports the finances palette as the shared app theme', () => {
    expect(LIGHT.page).toBe('#F3F4F6');
    expect(LIGHT.accent).toBe('#0A7EA4');
    const theme = readFileSync(join(root, 'constants/theme.ts'), 'utf8');
    expect(theme).toContain("from '@/lib/app-theme'");
  });
});
