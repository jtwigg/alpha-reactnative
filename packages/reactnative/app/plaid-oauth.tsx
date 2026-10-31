import { Redirect, type Href } from 'expo-router';

/**
 * Universal-link landing for bank OAuth (https://<host>/plaid-oauth). The Link
 * SDK resumes the session from the OS-level return; this route only has to
 * land somewhere valid, so it sends the user to Connections.
 */
export default function PlaidOAuthReturn() {
  return <Redirect href={'/connections' as Href} />;
}
