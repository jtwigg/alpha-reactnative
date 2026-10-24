import { action } from '../_generated/server';
import { requireAllowedIdentity } from '../allowlist';
import { BriefingPayloadError, buildFeedbackPayload } from './payload';
import { feedbackArgsValidator, feedbackResultValidator } from './validators';

/**
 * Allowlisted forwarder. Client never sees FEEDBACK_WEBHOOK_URL / KEY.
 * The POST body matches the email-briefings `/api/feedback` webhook payload
 * (`source: "email-briefing-deck"`, `at`, Bearer key).
 */
export const send = action({
  args: feedbackArgsValidator,
  returns: feedbackResultValidator,
  handler: async (ctx, args) => {
    await requireAllowedIdentity(ctx);
    let payload;
    try {
      payload = buildFeedbackPayload(args);
    } catch (error) {
      const message =
        error instanceof BriefingPayloadError ? error.message : 'Invalid feedback';
      return { ok: false, error: message };
    }

    const url = process.env.FEEDBACK_WEBHOOK_URL;
    const key = process.env.FEEDBACK_WEBHOOK_KEY;
    if (!url || !key) {
      return { ok: false, error: 'not configured' };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        return { ok: true, upstream: response.status };
      }
      return { ok: false, upstream: response.status, error: 'upstream' };
    } catch {
      return { ok: false, error: 'forward failed' };
    }
  },
});
