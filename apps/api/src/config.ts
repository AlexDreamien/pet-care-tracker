import { z } from 'zod';

/**
 * Configuration, read once from the environment.
 *
 * `PUBLIC_ORIGIN` is not decoration: WebAuthn binds a passkey to an origin, and a mismatch
 * between what the browser saw and what the server expects fails the signature check with
 * an error that looks like a bug in the passkey.
 */
const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(5174),
  /** Where the SQLite file lives; on Fly this points into the mounted volume. */
  DATABASE_PATH: z.string().default('./data/pet-care-tracker.sqlite'),
  /** Directory for uploaded files and their thumbnails. */
  UPLOAD_DIR: z.string().default('./data/uploads'),
  /** Public origin, e.g. https://pets.example.com — used for cookies and WebAuthn. */
  PUBLIC_ORIGIN: z.string().default('http://localhost:5173'),
  /** Directory of the built SPA, served when present. */
  WEB_DIST: z.string().optional(),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 1024 * 1024),
  /**
   * When set, registration requires this code.
   *
   * A publicly reachable instance with open registration and file uploads is an invitation
   * to fill someone else's volume. Empty leaves registration open, which is the sensible
   * default on a laptop and the wrong one on the internet.
   */
  SIGNUP_INVITE_CODE: z.string().default(''),
  /**
   * VAPID keys for web push. Both empty disables push entirely — which is a supported
   * state, not a broken one: the calendar feed is the reminder channel that always works.
   */
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  /** Contact address a push service can complain to, per the VAPID spec. */
  VAPID_SUBJECT: z.string().default('mailto:noreply@example.com'),
  /**
   * Lets a scheduler with no account trigger the reminder sweep.
   *
   * Its own secret rather than a reuse of the invite code: one is shared with people you
   * want to register, the other with a machine, and conflating them means every invited
   * person can also poke the scheduler.
   */
  PUSH_DISPATCH_SECRET: z.string().default(''),
});

export type Config = z.infer<typeof configSchema> & {
  /** Host part of `PUBLIC_ORIGIN`; the WebAuthn relying-party identifier. */
  rpId: string;
  isProduction: boolean;
  pushEnabled: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.parse(env);
  const rpId = new URL(parsed.PUBLIC_ORIGIN).hostname;
  return {
    ...parsed,
    rpId,
    isProduction: parsed.NODE_ENV === 'production',
    pushEnabled: parsed.VAPID_PUBLIC_KEY !== '' && parsed.VAPID_PRIVATE_KEY !== '',
  };
}
