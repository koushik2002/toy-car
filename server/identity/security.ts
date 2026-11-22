import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export interface IdentityEmailPayload {
  to: string;
  name: string;
  url: string;
  expiresAt: string;
}

export function newToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function encryptionKey(value: string) {
  if (!/^[a-f\d]{64}$/i.test(value)) {
    throw new Error('Identity outbox encryption key must be 32 bytes encoded as hex.');
  }
  return Buffer.from(value, 'hex');
}

export function csrfTokenFor(sessionToken: string, key: string) {
  return createHmac('sha256', encryptionKey(key))
    .update(`tiny-kars:csrf:v1:${sessionToken}`)
    .digest('hex');
}

export function tokenMatches(actual: string | undefined, expected: string) {
  if (!actual || !/^[a-f\d]{64}$/i.test(actual)) return false;
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

/** Tokens are hashed in identity_tokens and encrypted only inside the email outbox. */
export function encryptPayload(payload: IdentityEmailPayload, key: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  cipher.setAAD(Buffer.from('tiny-kars:identity-email:v1'));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  return JSON.stringify({
    version: 1,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    data: ciphertext.toString('base64url'),
  });
}

export function decryptPayload(value: string, key: string): IdentityEmailPayload {
  const envelope = JSON.parse(value) as Record<string, unknown>;
  if (
    envelope.version !== 1 ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.tag !== 'string' ||
    typeof envelope.data !== 'string'
  ) {
    throw new Error('Invalid identity email envelope.');
  }
  const iv = Buffer.from(envelope.iv, 'base64url');
  const tag = Buffer.from(envelope.tag, 'base64url');
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid identity email envelope.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(key), iv);
  decipher.setAAD(Buffer.from('tiny-kars:identity-email:v1'));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64url')),
    decipher.final(),
  ]);
  const payload = JSON.parse(plaintext.toString('utf8')) as IdentityEmailPayload;
  if (
    ![payload.to, payload.name, payload.url, payload.expiresAt].every((v) => typeof v === 'string')
  ) {
    throw new Error('Invalid identity email payload.');
  }
  return payload;
}
