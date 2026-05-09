import { action } from './_generated/server';
import { v } from 'convex/values';

const messageArg = v.object({
  role: v.union(v.literal('user'), v.literal('assistant')),
  content: v.string(),
});

// Calls OpenAI chat completions server-side so the API key stays out of the client.
// Set OPENAI_API_KEY in your Convex dashboard under Settings → Environment Variables.
export const send = action({
  args: {
    messages: v.array(messageArg),
  },
  handler: async (_ctx, { messages }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI error: ${err}`);
    }

    const data = await response.json();
    return data.choices[0].message.content as string;
  },
});
