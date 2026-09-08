import { randomBytes, randomUUID } from 'node:crypto';

/**
 * A UUIDv7: 48 bits of Unix milliseconds, then randomness.
 *
 * Time-ordered identifiers keep insertions at the end of an index instead of scattering
 * them, and they sort chronologically without a separate column — useful every time a list
 * of records wants "newest first" and the created-at timestamps tie.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);

  bytes.writeUIntBE(now, 0, 6);
  // Version 7 in the high nibble of byte 6, variant 10 in the top bits of byte 8.
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/** An opaque token for a session cookie or a calendar feed URL. */
export function randomToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

export { randomUUID };
