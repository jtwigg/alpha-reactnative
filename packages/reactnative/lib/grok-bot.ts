import { Linking } from 'react-native';

import { GROK_BOT_AGENT_URL, tryOpenGrokBot } from '@/lib/grok-bot-url';

export { GROK_BOT_AGENT_ID, GROK_BOT_AGENT_URL } from '@/lib/grok-bot-url';

export async function openGrokBot(
  openUrl: (url: string) => Promise<void> = (url) => Linking.openURL(url),
): Promise<'opened' | 'failed'> {
  return tryOpenGrokBot(openUrl);
}
