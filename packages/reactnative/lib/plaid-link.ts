import { createPlaidLinkSession, type LinkExit, type LinkSuccess } from 'react-native-plaid-link-sdk';

/**
 * Opens Plaid Link with a server-issued link token. Resolves with the public
 * token on success, or null if the user closed Link without an error. Native
 * only; the web build uses plaid-link.web.ts.
 */
export async function openPlaidLink(linkToken: string): Promise<string | null> {
  return await new Promise<string | null>((resolve, reject) => {
    createPlaidLinkSession({
      token: linkToken,
      onSuccess: (success: LinkSuccess) => resolve(success.publicToken),
      onExit: (exit: LinkExit) => {
        if (exit.error) {
          reject(new Error(exit.error.displayMessage || exit.error.errorMessage || 'Plaid Link failed'));
        } else {
          resolve(null);
        }
      },
      onEvent: () => undefined,
    })
      .then((session) => session.open())
      .catch(reject);
  });
}
