/** Plaid Link here is a native module; the web build cannot open it. */
export function openPlaidLink(_linkToken: string): Promise<string | null> {
  return Promise.reject(new Error('Linking a bank is only available in the iOS app.'));
}
