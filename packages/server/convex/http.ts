import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { evaluateAllowlist } from './allowlist';
import { financeServer } from './finance/gateway';

const http = httpRouter();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// Preflight for browser CORS requests (e.g. Expo Web)
http.route({
  path: '/transcribe',
  method: 'OPTIONS',
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }),
});

// Accepts a multipart/form-data POST with a single `file` field (audio).
// Proxies it to OpenAI Whisper and returns { text: string }.
// The OPENAI_API_KEY stays server-side — never exposed to the client.
// Clients must send the Clerk Convex JWT: Authorization: Bearer <token>
http.route({
  path: '/transcribe',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const identity = await ctx.auth.getUserIdentity();
    const access = evaluateAllowlist(identity);
    if (!identity) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    if (!access.allowed) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return jsonResponse({ error: 'OPENAI_API_KEY not set' }, 500);
    }

    // FormData typings differ between Convex (DOM) and Expo (RN). Use a
    // structural any so both packages can typecheck this shared module.
    const formData: any = await request.formData();
    if (!formData.has('model')) {
      formData.set('model', 'whisper-1');
    }

    const whisperResponse = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      },
    );

    const body = await whisperResponse.text();
    return new Response(body, {
      status: whisperResponse.status,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }),
});

http.route({
  path: '/finance/server',
  method: 'POST',
  handler: financeServer,
});

export default http;
