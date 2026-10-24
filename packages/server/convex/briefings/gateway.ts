import { httpAction } from '../_generated/server';
import { internal } from '../_generated/api';
import { bearerMatches } from '../finance/secret';
import { BriefingPayloadError, parseBriefingDay } from './payload';

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Server-to-server ingest. The morning routine POSTs one day's briefing.
 *
 *   POST https://posh-mink-581.convex.site/briefings/ingest
 *   Authorization: Bearer $BRIEFINGS_INGEST_SECRET
 *   { "date": "YYYY-MM-DD", "accounts": { "personal": {...}, "crankcase": {...} } }
 */
export const briefingIngest = httpAction(async (ctx, request) => {
  const expected = process.env.BRIEFINGS_INGEST_SECRET;
  if (!expected) {
    return jsonResponse({ error: 'BRIEFINGS_INGEST_SECRET is not set' }, 500);
  }
  if (!bearerMatches(request.headers.get('authorization'), expected)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'POST only' }, 405);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  try {
    parseBriefingDay(body);
  } catch (error) {
    if (error instanceof BriefingPayloadError) {
      return jsonResponse({ error: error.message, errors: error.errors }, 400);
    }
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 400);
  }

  try {
    const result = await ctx.runMutation(internal.briefings.ingest.upsertDay, { payload: body });
    return jsonResponse({ result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 400);
  }
});
