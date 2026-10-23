export type HighlightState = {
  selected: string | null;
  preview: string | null;
  hidden: ReadonlySet<string>;
};

export type HighlightAction =
  | { type: 'toggle'; key: string }
  | { type: 'preview'; key: string | null }
  | { type: 'toggleHidden'; key: string }
  | { type: 'clear' }
  | { type: 'reset' };

export const EMPTY_HIGHLIGHT: HighlightState = { selected: null, preview: null, hidden: new Set() };

export function highlightReducer(state: HighlightState, action: HighlightAction): HighlightState {
  switch (action.type) {
    case 'toggle': {
      const hidden = new Set(state.hidden);
      hidden.delete(action.key);
      return { ...state, hidden, selected: state.selected === action.key ? null : action.key };
    }
    case 'preview':
      return state.preview === action.key ? state : { ...state, preview: action.key };
    case 'toggleHidden': {
      const hidden = new Set(state.hidden);
      if (hidden.has(action.key)) hidden.delete(action.key);
      else hidden.add(action.key);
      return {
        selected: state.selected === action.key ? null : state.selected,
        preview: state.preview === action.key ? null : state.preview,
        hidden,
      };
    }
    case 'clear':
      return state.selected == null && state.preview == null ? state : { ...state, selected: null, preview: null };
    case 'reset':
      return EMPTY_HIGHLIGHT;
  }
}

/** The series to emphasize: a hover preview wins over the tapped selection. */
export function activeKey(state: HighlightState): string | null {
  const key = state.preview ?? state.selected;
  return key != null && !state.hidden.has(key) ? key : null;
}

/** Opacity for a series given the active key (~20% when another is active). */
export function seriesOpacity(key: string, active: string | null, dimmed = 0.2): number {
  return active == null || active === key ? 1 : dimmed;
}
