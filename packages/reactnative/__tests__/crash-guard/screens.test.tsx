import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { RootLayout } from '../../app/_layout';
import HomeScreen from '../../app/(tabs)/index';
import BriefingsScreen from '../../app/(tabs)/briefings/index';
import FinancesScreen from '../../app/(tabs)/finances';
import AccountDetailScreen from '../../app/finances/[accountId]';
import { QueryErrorBoundary } from '../../components/query-error-boundary';
import { jsVersionLabel } from '../../lib/app-version';
import { setQueryMode, type QueryMode } from './mock-convex';

function Boom() {
  throw new Error('Convex backend unavailable');
}

function renderOk(ui: React.ReactElement) {
  expect(() => render(ui)).not.toThrow();
}

const screens: Array<{ name: string; ui: () => React.ReactElement; version?: boolean }> = [
  { name: 'Home', ui: () => <HomeScreen />, version: true },
  { name: 'Briefings', ui: () => <BriefingsScreen /> },
  { name: 'Finances', ui: () => <FinancesScreen /> },
  { name: 'Account', ui: () => <AccountDetailScreen /> },
];

describe('crash-guard: throwing Convex queries', () => {
  beforeEach(() => setQueryMode('throw'));

  it('root layout renders and its boundary catches a child throw', () => {
    renderOk(<RootLayout />);
    renderOk(
      <QueryErrorBoundary showVersion>
        <Boom />
      </QueryErrorBoundary>,
    );
    expect(screen.getByText('Backend unavailable')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
    expect(screen.getByText(jsVersionLabel())).toBeTruthy();
  });

  it.each(screens)('$name does not throw and shows Backend unavailable + Retry', ({ ui, version }) => {
    renderOk(ui());
    expect(screen.getAllByText('Backend unavailable').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Retry').length).toBeGreaterThan(0);
    if (version) {
      expect(screen.getByText(jsVersionLabel())).toBeTruthy();
    }
  });
});

describe.each(['loading', 'empty'] as QueryMode[])('crash-guard: queries return %s', (mode) => {
  beforeEach(() => setQueryMode(mode));

  it('root layout does not throw', () => {
    renderOk(<RootLayout />);
  });

  it.each(screens)('$name does not throw', ({ ui, version }) => {
    renderOk(ui());
    expect(screen.queryByText('Backend unavailable')).toBeNull();
    if (version) {
      expect(screen.getByText(jsVersionLabel())).toBeTruthy();
    }
  });
});
