import { useMemo, useReducer } from 'react';

import { EMPTY_HIGHLIGHT, activeKey, highlightReducer } from '@/lib/series-highlight';

export type SeriesHighlight = {
  /** Series currently emphasized (hover preview or tapped selection). */
  active: string | null;
  selected: string | null;
  hidden: ReadonlySet<string>;
  toggle: (key: string) => void;
  preview: (key: string | null) => void;
  toggleHidden: (key: string) => void;
  clear: () => void;
  reset: () => void;
};

export function useSeriesHighlight(): SeriesHighlight {
  const [state, dispatch] = useReducer(highlightReducer, EMPTY_HIGHLIGHT);
  const actions = useMemo(
    () => ({
      toggle: (key: string) => dispatch({ type: 'toggle', key }),
      preview: (key: string | null) => dispatch({ type: 'preview', key }),
      toggleHidden: (key: string) => dispatch({ type: 'toggleHidden', key }),
      clear: () => dispatch({ type: 'clear' }),
      reset: () => dispatch({ type: 'reset' }),
    }),
    [],
  );
  return { ...actions, active: activeKey(state), selected: state.selected, hidden: state.hidden };
}
