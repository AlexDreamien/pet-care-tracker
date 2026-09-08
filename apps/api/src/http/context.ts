import type { FastifyRequest } from 'fastify';
import type { Config } from '../config';
import type { Database } from '../db/client';
import type { AuthenticatedUser } from '../domain/auth';
import { forbidden, unauthenticated } from './errors';

export interface AppContext {
  database: Database;
  config: Config;
  /** Injected so tests can pin the clock and every date is deterministic. */
  now: () => Date;
}

export interface RequestAuth {
  user: AuthenticatedUser;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: RequestAuth;
  }
}

export function requireAuth(request: FastifyRequest): RequestAuth {
  if (!request.auth) throw unauthenticated();
  return request.auth;
}

const WRITABLE_ROLES = new Set(['owner', 'editor']);

/** A viewer may read a household and nothing else. */
export function assertCanWrite(role: string | null): void {
  if (role === null) throw forbidden('you are not a member of this household');
  if (!WRITABLE_ROLES.has(role)) throw forbidden('your role is read-only');
}

export function assertCanRead(role: string | null): void {
  if (role === null) throw forbidden('you are not a member of this household');
}
