/**
 * AES-256-GCM for Plaid access tokens at rest (WebCrypto, so it runs in the
 * Convex default runtime). Key is `PLAID_TOKEN_KEY`: 32 bytes, base64.
 * Stored form: `v1.<iv b64>.<ciphertext b64>`.
 */

const VERSION = 'v1';

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}

async function importKey(keyB64: string | undefined): Promise<CryptoKey> {
  if (!keyB64) throw new Error('PLAID_TOKEN_KEY is not set');
  const raw = fromBase64(keyB64.trim());
  if (raw.length !== 32) throw new Error('PLAID_TOKEN_KEY must be 32 bytes (base64)');
  return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptToken(plain: string, keyB64: string | undefined): Promise<string> {
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plain);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  return `${VERSION}.${toBase64(iv)}.${toBase64(cipher)}`;
}

export async function decryptToken(stored: string, keyB64: string | undefined): Promise<string> {
  const [version, ivB64, cipherB64] = stored.split('.');
  if (version !== VERSION || !ivB64 || !cipherB64) {
    throw new Error('Unsupported encrypted token format');
  }
  const key = await importKey(keyB64);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivB64) },
    key,
    fromBase64(cipherB64),
  );
  return new TextDecoder().decode(plain);
}
