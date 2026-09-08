/**
 * Serving the built front end from the same origin.
 *
 * This path only runs when `WEB_DIST` is set, which is production and nothing else — so it
 * was the one path with no test, and the one that broke: two not-found handlers on the same
 * prefix, and Fastify refused to start.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createDatabase, type Database } from '../src/db/client';

let app: FastifyInstance;
let database: Database;
let dist: string;

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'pct-dist-'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Питомец</title>');
  writeFileSync(join(dist, 'manifest.webmanifest'), '{"name":"Питомец"}');

  database = createDatabase();
  const config = loadConfig({
    NODE_ENV: 'test',
    PUBLIC_ORIGIN: 'http://localhost:5199',
    WEB_DIST: dist,
  } as NodeJS.ProcessEnv);

  app = await buildApp({
    context: { database, config, now: () => new Date('2026-09-08T12:00:00Z') },
  });
});

afterAll(async () => {
  await app.close();
  database.close();
  rmSync(dist, { recursive: true, force: true });
});

describe('with a built front end', () => {
  it('starts at all', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/health' })).statusCode).toBe(200);
  });

  it('serves the shell at the root', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Питомец');
  });

  it('serves a static asset', async () => {
    const response = await app.inject({ method: 'GET', url: '/manifest.webmanifest' });
    expect(response.statusCode).toBe(200);
  });

  it('hands a client-side route back to the shell', async () => {
    // A deep link into the app is not a 404; the router decides what it means.
    const response = await app.inject({ method: 'GET', url: '/pets/some-id/measurements' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Питомец');
  });

  it('still answers an unknown API route with JSON', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
  });
});
