import { updateBannerCopy, type UpdatePrompt } from './app-update';
import { jsVersionLabel } from './app-version';

export type ChromeNode = {
  type: string;
  text?: string;
  children?: ChromeNode[];
};

export type HomeChromeState = {
  jsLabel?: string;
  prompt: UpdatePrompt;
  availableOta?: number | null;
  dismissed?: boolean;
  busy?: boolean;
};

/** Layout Home actually mounts: banner (top) → header → version label → body → composer. */
export function renderHomeChrome(state: HomeChromeState): ChromeNode {
  const versionLabel = state.jsLabel ?? jsVersionLabel();
  const copy = updateBannerCopy(state.prompt, {
    availableOta: state.availableOta,
    busy: state.busy,
  });
  const banner =
    copy && !state.dismissed
      ? { type: 'UpdateBanner', text: copy, children: [] as ChromeNode[] }
      : null;
  return {
    type: 'Home',
    children: [
      ...(banner ? [banner] : []),
      { type: 'Header', text: 'Home' },
      { type: 'VersionLabel', text: versionLabel },
      { type: 'Thread' },
      { type: 'Briefing' },
      { type: 'Composer' },
    ],
  };
}

export function collectTexts(node: ChromeNode | undefined): string[] {
  if (!node) return [];
  const own = node.text ? [node.text] : [];
  return own.concat((node.children ?? []).flatMap(collectTexts));
}

export function findNode(node: ChromeNode, type: string): ChromeNode | null {
  if (node.type === type) return node;
  for (const child of node.children ?? []) {
    const hit = findNode(child, type);
    if (hit) return hit;
  }
  return null;
}
