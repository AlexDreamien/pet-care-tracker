/**
 * Accounts, sessions and recovery.
 *
 * Passwords are hashed with Argon2id. Session tokens are random and only their SHA-256 is
 * stored, so a leaked database does not hand over live sessions — the same reasoning that
 * applies to passwords applies to the cookies that stand in for them.
 */

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, lt } from 'drizzle-orm';
import type { Database } from '../db/client';
import { households, householdMembers, sessions, users } from '../db/schema';
import { randomToken, uuidv7 } from './ids';

export const SESSION_COOKIE = 'pct_session';
export const SESSION_DAYS = 30;

/** Unambiguous alphabet: no 0/O, no 1/I/L. A recovery code gets read off paper. */
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * `@node-rs/argon2` defaults to Argon2id with the OWASP-recommended parameters, and the
 * `Algorithm` enum it exports is an ambient const enum this build cannot reference. The
 * variant is asserted in `auth.test.ts` by reading the prefix of a stored hash.
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(stored: string, candidate: string): Promise<boolean> {
  try {
    return await verify(stored, candidate);
  } catch {
    // A malformed hash must read as a failed login, never as a crash.
    return false;
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison for values an attacker can vary and time. */
export function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Five groups of four, e.g. `K7QP-3MRD-XY9F-2HTN-BVC4`. */
export function generateRecoveryCode(): string {
  const groups = Array.from({ length: 5 }, () =>
    Array.from(
      { length: 4 },
      () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)] as string,
    ).join(''),
  );
  return groups.join('-');
}

export function normaliseRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export interface RegisteredUser {
  userId: string;
  householdId: string;
  /** Shown once, at registration, and never recoverable afterwards. */
  recoveryCode: string;
}

export interface RegisterOptions {
  email: string;
  password: string;
  displayName: string;
  locale: string;
  now: Date;
}

/**
 * Creates the user and the household they own in one transaction.
 *
 * Every pet belongs to a household rather than to a person, so sharing with a partner
 * later is adding a member — not migrating any data.
 */
export async function registerUser(
  database: Database,
  options: RegisterOptions,
): Promise<RegisteredUser> {
  const email = options.email.trim().toLowerCase();
  const existing = database.db.select().from(users).where(eq(users.email, email)).get();
  if (existing) throw new EmailTakenError();

  const recoveryCode = generateRecoveryCode();
  const [passwordHash, recoveryCodeHash] = await Promise.all([
    hashPassword(options.password),
    hashPassword(normaliseRecoveryCode(recoveryCode)),
  ]);

  const userId = uuidv7(options.now.getTime());
  const householdId = uuidv7(options.now.getTime());
  const createdAt = options.now.toISOString();

  database.sqlite.transaction(() => {
    database.db
      .insert(users)
      .values({
        id: userId,
        email,
        passwordHash,
        recoveryCodeHash,
        displayName: options.displayName,
        locale: options.locale,
        createdAt,
      })
      .run();

    database.db
      .insert(households)
      .values({
        id: householdId,
        name: options.displayName,
        calendarToken: randomToken(),
        createdAt,
      })
      .run();

    database.db
      .insert(householdMembers)
      .values({ id: uuidv7(options.now.getTime()), householdId, userId, role: 'owner', createdAt })
      .run();
  })();

  return { userId, householdId, recoveryCode };
}

export class EmailTakenError extends Error {
  constructor() {
    super('email already registered');
    this.name = 'EmailTakenError';
  }
}

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: string;
}

export function createSession(
  database: Database,
  input: { userId: string; userAgent?: string | undefined; now: Date },
): { token: string; session: SessionRecord } {
  const token = randomToken();
  const expiresAt = new Date(input.now.getTime() + SESSION_DAYS * 86_400_000).toISOString();
  const session = {
    id: uuidv7(input.now.getTime()),
    userId: input.userId,
    expiresAt,
  };

  database.db
    .insert(sessions)
    .values({
      ...session,
      tokenHash: hashToken(token),
      userAgent: input.userAgent ?? null,
      createdAt: input.now.toISOString(),
    })
    .run();

  return { token, session };
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  locale: string;
  unitSystem: string;
  timeZone: string;
}

/** Resolves a cookie value to a user, treating an expired session as absent. */
export function resolveSession(
  database: Database,
  token: string,
  now: Date,
): { user: AuthenticatedUser; sessionId: string } | null {
  const row = database.db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .get();

  if (!row) return null;
  if (row.session.expiresAt <= now.toISOString()) return null;

  return {
    sessionId: row.session.id,
    user: {
      id: row.user.id,
      email: row.user.email,
      displayName: row.user.displayName,
      locale: row.user.locale,
      unitSystem: row.user.unitSystem,
      timeZone: row.user.timeZone,
    },
  };
}

export function revokeSession(database: Database, sessionId: string): void {
  database.db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

export function revokeAllSessions(database: Database, userId: string): void {
  database.db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

/** Housekeeping: expired rows serve no purpose and only grow the table. */
export function purgeExpiredSessions(database: Database, now: Date): number {
  const result = database.db
    .delete(sessions)
    .where(lt(sessions.expiresAt, now.toISOString()))
    .run();
  return result.changes;
}

/**
 * Spends the recovery code and sets a new password.
 *
 * The code is single-use: it is cleared on success, and every existing session is revoked
 * because a recovery is exactly the situation where one of them might not be the owner's.
 */
export async function useRecoveryCode(
  database: Database,
  input: { email: string; recoveryCode: string; newPassword: string },
): Promise<boolean> {
  const email = input.email.trim().toLowerCase();
  const user = database.db.select().from(users).where(eq(users.email, email)).get();
  if (!user?.recoveryCodeHash) return false;

  const matches = await verifyPassword(
    user.recoveryCodeHash,
    normaliseRecoveryCode(input.recoveryCode),
  );
  if (!matches) return false;

  const passwordHash = await hashPassword(input.newPassword);
  database.sqlite.transaction(() => {
    database.db
      .update(users)
      .set({ passwordHash, recoveryCodeHash: null })
      .where(eq(users.id, user.id))
      .run();
    database.db.delete(sessions).where(eq(sessions.userId, user.id)).run();
  })();

  return true;
}

/** Rejects a zone `Intl` does not know, before it silently becomes UTC at read time. */
export function isKnownTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function updateProfile(
  database: Database,
  userId: string,
  changes: {
    displayName?: string | undefined;
    locale?: string | undefined;
    unitSystem?: string | undefined;
    timeZone?: string | undefined;
  },
): AuthenticatedUser {
  const patch = Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  );
  if (Object.keys(patch).length > 0) {
    database.db.update(users).set(patch).where(eq(users.id, userId)).run();
  }

  const row = database.db.select().from(users).where(eq(users.id, userId)).get();
  if (!row) throw new Error(`user ${userId} vanished mid-update`);

  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    locale: row.locale,
    unitSystem: row.unitSystem,
    timeZone: row.timeZone,
  };
}

export function findUserByEmail(database: Database, email: string) {
  return database.db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).get();
}

/** The households a user may act in, with the role that decides what they may do. */
export function householdsFor(database: Database, userId: string) {
  return database.db
    .select({ household: households, role: householdMembers.role })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.userId, userId))
    .all();
}

export function membershipRole(
  database: Database,
  input: { userId: string; householdId: string },
): string | null {
  const row = database.db
    .select({ role: householdMembers.role })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.userId, input.userId),
        eq(householdMembers.householdId, input.householdId),
      ),
    )
    .get();
  return row?.role ?? null;
}
