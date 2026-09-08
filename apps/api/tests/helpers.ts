import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createDatabase, type Database } from '../src/db/client';

export interface TestApp {
  app: FastifyInstance;
  database: Database;
  uploadDir: string;
  /** Moves the injected clock, so anything time-dependent is deterministic. */
  setNow(instant: string): void;
  close(): Promise<void>;
}

export async function makeApp(
  startingAt = '2026-09-08T12:00:00Z',
  env: Record<string, string> = {},
): Promise<TestApp> {
  const database = createDatabase();
  const uploadDir = mkdtempSync(join(tmpdir(), 'pct-uploads-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    PUBLIC_ORIGIN: 'http://localhost:5173',
    DATABASE_PATH: ':memory:',
    UPLOAD_DIR: uploadDir,
    ...env,
  } as NodeJS.ProcessEnv);

  let now = new Date(startingAt);
  const app = await buildApp({ context: { database, config, now: () => now } });

  return {
    app,
    database,
    uploadDir,
    setNow: (instant) => {
      now = new Date(instant);
    },
    close: async () => {
      await app.close();
      database.close();
      rmSync(uploadDir, { recursive: true, force: true });
    },
  };
}

/** The `Set-Cookie` value for the session, ready to send back as a `cookie` header. */
export function sessionCookie(response: { cookies: unknown[] }): string {
  const cookies = response.cookies as { name: string; value: string }[];
  const session = cookies.find((cookie) => cookie.name === 'pct_session');
  if (!session) throw new Error('no session cookie was set');
  return `pct_session=${session.value}`;
}

export const CREDENTIALS = {
  email: 'owner@example.com',
  password: 'a long enough passphrase',
  displayName: 'Alek',
};

/** Registers an account and returns the cookie plus the ids everything else hangs off. */
export async function signUp(
  test: TestApp,
  overrides: Partial<typeof CREDENTIALS> = {},
): Promise<{ cookie: string; userId: string; householdId: string; recoveryCode: string }> {
  const response = await test.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { ...CREDENTIALS, ...overrides },
  });

  if (response.statusCode !== 201) {
    throw new Error(`registration failed: ${response.statusCode} ${response.body}`);
  }

  const body = response.json() as {
    userId: string;
    householdId: string;
    recoveryCode: string;
  };
  return { ...body, cookie: sessionCookie(response) };
}

/** `app.inject` with the session cookie attached. */
export function asUser(test: TestApp, cookie: string, options: InjectOptions) {
  return test.app.inject({
    ...options,
    headers: { ...options.headers, cookie },
  });
}
