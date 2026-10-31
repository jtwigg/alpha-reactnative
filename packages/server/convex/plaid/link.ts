import { action } from '../_generated/server';
import { internal } from '../_generated/api';
import { v } from 'convex/values';
import { requireAllowedIdentity } from '../allowlist';
import { plaidPost } from './client';
import { decryptToken, encryptToken } from './crypto';

/** Must match an Allowed redirect URI in the Plaid dashboard. */
function redirectUri(): string {
  const host = process.env.PLAID_REDIRECT_HOST ?? 'alpha-theta-silk.vercel.app';
  return `https://${host}/plaid-oauth`;
}

function linkBase(userId: string) {
  return {
    user: { client_user_id: userId },
    client_name: 'Alpha',
    country_codes: ['US'],
    language: 'en',
    redirect_uri: redirectUri(),
  };
}

/**
 * New-institution Link token. Transactions is required; Investments is
 * optional so institutions without investment accounts are not billed for it,
 * and maximum history (730 days) is requested because depth is fixed at link time.
 */
export const createLinkToken = action({
  args: {},
  handler: async (ctx): Promise<{ linkToken: string }> => {
    const identity = await requireAllowedIdentity(ctx);
    const res = await plaidPost<{ link_token: string }>('/link/token/create', {
      ...linkBase(identity.subject),
      products: ['transactions'],
      optional_products: ['investments'],
      transactions: { days_requested: 730 },
    });
    return { linkToken: res.link_token };
  },
});

/** Relink in update mode for an existing item: no new item, no new billing slot. */
export const createUpdateLinkToken = action({
  args: { plaidItemId: v.string() },
  handler: async (ctx, { plaidItemId }): Promise<{ linkToken: string }> => {
    const identity = await requireAllowedIdentity(ctx);
    const item = await ctx.runQuery(internal.plaid.store.getItem, { plaidItemId });
    if (!item) throw new Error('Unknown item');
    const accessToken = await decryptToken(item.encryptedAccessToken, process.env.PLAID_TOKEN_KEY);
    const res = await plaidPost<{ link_token: string }>('/link/token/create', {
      ...linkBase(identity.subject),
      access_token: accessToken,
    });
    return { linkToken: res.link_token };
  },
});

/**
 * Exchanges the public token, encrypts the access token at rest, and refuses
 * a second link for an institution that already has an item (item slots are
 * limited and removing an item does not free one).
 */
export const exchangePublicToken = action({
  args: { publicToken: v.string() },
  handler: async (
    ctx,
    { publicToken },
  ): Promise<{ plaidItemId: string; institutionName: string | null }> => {
    await requireAllowedIdentity(ctx);
    const exchanged = await plaidPost<{ access_token: string; item_id: string }>(
      '/item/public_token/exchange',
      { public_token: publicToken },
    );
    const info = await plaidPost<{ item: { institution_id?: string | null } }>('/item/get', {
      access_token: exchanged.access_token,
    });
    const institutionId = info.item.institution_id ?? undefined;

    if (institutionId) {
      const existing = await ctx.runQuery(internal.plaid.store.findByInstitution, { institutionId });
      if (existing && existing.plaidItemId !== exchanged.item_id) {
        // Release the duplicate item on Plaid's side; the stored one stays.
        await plaidPost('/item/remove', { access_token: exchanged.access_token }).catch(() => undefined);
        throw new Error('This institution is already linked. Use Relink instead.');
      }
    }

    let institutionName: string | null = null;
    if (institutionId) {
      const inst = await plaidPost<{ institution: { name: string } }>('/institutions/get_by_id', {
        institution_id: institutionId,
        country_codes: ['US'],
      }).catch(() => null);
      institutionName = inst?.institution.name ?? null;
    }

    await ctx.runMutation(internal.plaid.store.insertItem, {
      plaidItemId: exchanged.item_id,
      ...(institutionId ? { institutionId } : {}),
      ...(institutionName ? { institutionName } : {}),
      encryptedAccessToken: await encryptToken(exchanged.access_token, process.env.PLAID_TOKEN_KEY),
    });
    return { plaidItemId: exchanged.item_id, institutionName };
  },
});

/** After a successful update-mode Link, the item is healthy again. */
export const markRelinked = action({
  args: { plaidItemId: v.string() },
  handler: async (ctx, { plaidItemId }) => {
    await requireAllowedIdentity(ctx);
    await ctx.runMutation(internal.plaid.store.patchItem, {
      plaidItemId,
      status: 'active',
      consecutiveFailures: 0,
      lastError: null,
    });
  },
});
