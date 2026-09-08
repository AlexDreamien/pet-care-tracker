/**
 * Passkeys.
 *
 * After a first password login on a phone the application offers to register a platform
 * authenticator, so every subsequent visit is a fingerprint or a glance rather than a long
 * passphrase typed on glass. The password stays: it is the fallback when the phone is lost,
 * and passkeys do not travel to a device that has never seen one.
 *
 * The cryptography is `@simplewebauthn/server`'s. What lives here is the state around it —
 * which challenge belongs to which ceremony, and what a verified credential is stored as.
 */

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { and, eq, lt } from 'drizzle-orm';
import type { Database } from '../db/client';
import { credentials, users, webauthnFlows } from '../db/schema';
import { uuidv7 } from './ids';

export const WEBAUTHN_COOKIE = 'pct_webauthn';
/** A ceremony a user has walked away from should not stay usable. */
export const FLOW_TTL_SECONDS = 300;

export type FlowPurpose = 'registration' | 'authentication';

export interface RelyingParty {
  /** The origin the browser will report; a mismatch fails the signature check. */
  origin: string;
  rpId: string;
  name: string;
}

function openFlow(
  database: Database,
  input: { purpose: FlowPurpose; userId: string | null; challenge: string; now: Date },
): string {
  const id = uuidv7(input.now.getTime());
  database.db
    .insert(webauthnFlows)
    .values({
      id,
      purpose: input.purpose,
      userId: input.userId,
      challenge: input.challenge,
      createdAt: input.now.toISOString(),
      expiresAt: new Date(input.now.getTime() + FLOW_TTL_SECONDS * 1000).toISOString(),
    })
    .run();
  return id;
}

/** Reads a flow and deletes it: a challenge is good for exactly one attempt. */
function takeFlow(
  database: Database,
  input: { id: string; purpose: FlowPurpose; now: Date },
): { challenge: string; userId: string | null } | null {
  const row = database.db
    .select()
    .from(webauthnFlows)
    .where(and(eq(webauthnFlows.id, input.id), eq(webauthnFlows.purpose, input.purpose)))
    .get();

  if (!row) return null;
  database.db.delete(webauthnFlows).where(eq(webauthnFlows.id, row.id)).run();
  if (row.expiresAt <= input.now.toISOString()) return null;

  return { challenge: row.challenge, userId: row.userId };
}

export function purgeExpiredFlows(database: Database, now: Date): number {
  return database.db
    .delete(webauthnFlows)
    .where(lt(webauthnFlows.expiresAt, now.toISOString()))
    .run().changes;
}

export function listCredentials(database: Database, userId: string) {
  return database.db.select().from(credentials).where(eq(credentials.userId, userId)).all();
}

export async function startRegistration(
  database: Database,
  input: { userId: string; rp: RelyingParty; now: Date },
): Promise<{ flowId: string; options: PublicKeyCredentialCreationOptionsJSON }> {
  const user = database.db.select().from(users).where(eq(users.id, input.userId)).get();
  if (!user) throw new Error(`unknown user ${input.userId}`);

  const existing = listCredentials(database, input.userId);

  const options = await generateRegistrationOptions({
    rpName: input.rp.name,
    rpID: input.rp.rpId,
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: user.displayName,
    attestationType: 'none',
    // Already-registered credentials are excluded so the same phone cannot be added twice.
    excludeCredentials: existing.map((credential) => ({ id: credential.credentialId })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
      // The point is Face ID and fingerprint, not a security key in a drawer.
      authenticatorAttachment: 'platform',
    },
  });

  const flowId = openFlow(database, {
    purpose: 'registration',
    userId: user.id,
    challenge: options.challenge,
    now: input.now,
  });

  return { flowId, options };
}

export async function finishRegistration(
  database: Database,
  input: {
    userId: string;
    flowId: string;
    response: RegistrationResponseJSON;
    deviceLabel?: string | undefined;
    rp: RelyingParty;
    now: Date;
  },
): Promise<{ verified: boolean; credentialId?: string }> {
  const flow = takeFlow(database, { id: input.flowId, purpose: 'registration', now: input.now });
  if (!flow || flow.userId !== input.userId) return { verified: false };

  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: flow.challenge,
    expectedOrigin: input.rp.origin,
    expectedRPID: input.rp.rpId,
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) return { verified: false };

  const { credential } = verification.registrationInfo;
  const id = uuidv7(input.now.getTime());

  database.db
    .insert(credentials)
    .values({
      id,
      userId: input.userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: credential.transports ? JSON.stringify(credential.transports) : null,
      deviceLabel: input.deviceLabel ?? null,
      createdAt: input.now.toISOString(),
    })
    .run();

  return { verified: true, credentialId: id };
}

export async function startAuthentication(
  database: Database,
  input: { rp: RelyingParty; now: Date },
): Promise<{ flowId: string; options: PublicKeyCredentialRequestOptionsJSON }> {
  // No `allowCredentials`: the authenticator offers whichever discoverable passkey it
  // holds, so the owner never types an email to sign in on their own phone.
  const options = await generateAuthenticationOptions({
    rpID: input.rp.rpId,
    userVerification: 'preferred',
  });

  const flowId = openFlow(database, {
    purpose: 'authentication',
    userId: null,
    challenge: options.challenge,
    now: input.now,
  });

  return { flowId, options };
}

export async function finishAuthentication(
  database: Database,
  input: {
    flowId: string;
    response: AuthenticationResponseJSON;
    rp: RelyingParty;
    now: Date;
  },
): Promise<{ verified: boolean; userId?: string }> {
  const flow = takeFlow(database, { id: input.flowId, purpose: 'authentication', now: input.now });
  if (!flow) return { verified: false };

  const stored = database.db
    .select()
    .from(credentials)
    .where(eq(credentials.credentialId, input.response.id))
    .get();
  if (!stored) return { verified: false };

  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: flow.challenge,
    expectedOrigin: input.rp.origin,
    expectedRPID: input.rp.rpId,
    requireUserVerification: false,
    credential: {
      id: stored.credentialId,
      publicKey: new Uint8Array(Buffer.from(stored.publicKey, 'base64url')),
      counter: stored.counter,
      transports: stored.transports ? JSON.parse(stored.transports) : undefined,
    },
  });

  if (!verification.verified) return { verified: false };

  // The counter guards against a cloned authenticator; platform authenticators often
  // report zero, which the library accounts for.
  database.db
    .update(credentials)
    .set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: input.now.toISOString(),
    })
    .where(eq(credentials.id, stored.id))
    .run();

  return { verified: true, userId: stored.userId };
}

export function deleteCredential(
  database: Database,
  input: { userId: string; credentialId: string },
): boolean {
  const result = database.db
    .delete(credentials)
    .where(and(eq(credentials.id, input.credentialId), eq(credentials.userId, input.userId)))
    .run();
  return result.changes > 0;
}
