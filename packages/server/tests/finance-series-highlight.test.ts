import { describe, expect, it } from 'vitest';
import {
  EMPTY_HIGHLIGHT,
  activeKey,
  highlightReducer,
  seriesOpacity,
  type HighlightAction,
} from '../../reactnative/lib/series-highlight';

const run = (...actions: HighlightAction[]) => actions.reduce(highlightReducer, EMPTY_HIGHLIGHT);

describe('series highlight', () => {
  it('toggles a selection and clears it on a second tap or an empty-space tap', () => {
    expect(activeKey(run({ type: 'toggle', key: 'cash' }))).toBe('cash');
    expect(activeKey(run({ type: 'toggle', key: 'cash' }, { type: 'toggle', key: 'cash' }))).toBeNull();
    expect(activeKey(run({ type: 'toggle', key: 'cash' }, { type: 'toggle', key: 'loans' }))).toBe('loans');
    expect(activeKey(run({ type: 'toggle', key: 'cash' }, { type: 'clear' }))).toBeNull();
  });

  it('lets a hover preview win over the selection, then falls back', () => {
    const hovering = run({ type: 'toggle', key: 'cash' }, { type: 'preview', key: 'home' });
    expect(activeKey(hovering)).toBe('home');
    expect(activeKey(highlightReducer(hovering, { type: 'preview', key: null }))).toBe('cash');
  });

  it('hides and shows a series, dropping it from the selection', () => {
    const hidden = run({ type: 'toggle', key: 'cash' }, { type: 'toggleHidden', key: 'cash' });
    expect(hidden.hidden.has('cash')).toBe(true);
    expect(activeKey(hidden)).toBeNull();
    expect(run({ type: 'toggleHidden', key: 'cash' }, { type: 'toggleHidden', key: 'cash' }).hidden.size).toBe(0);
    const reselected = highlightReducer(hidden, { type: 'toggle', key: 'cash' });
    expect(reselected.hidden.has('cash')).toBe(false);
    expect(activeKey(reselected)).toBe('cash');
  });

  it('dims everything but the active series to 20%', () => {
    expect(seriesOpacity('cash', null)).toBe(1);
    expect(seriesOpacity('cash', 'cash')).toBe(1);
    expect(seriesOpacity('home', 'cash')).toBe(0.2);
  });
});
