/** John's Assistant in Grok Bot. */
export const GROK_BOT_AGENT_ID = 'fcff0fa9-a9cd-444b-8c28-6a5904690983';
export const GROK_BOT_AGENT_URL = `grokbot://app/v1/agent?id=${GROK_BOT_AGENT_ID}`;

export async function tryOpenGrokBot(
  openUrl: (url: string) => Promise<void>,
): Promise<'opened' | 'failed'> {
  try {
    await openUrl(GROK_BOT_AGENT_URL);
    return 'opened';
  } catch {
    return 'failed';
  }
}
