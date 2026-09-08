import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createDatabase } from './db/client';
import { purgeExpiredSessions } from './domain/auth';
import { purgeExpiredFlows } from './domain/passkeys';

/** Hourly is often enough for rows whose only cost is sitting there. */
const HOUSEKEEPING_INTERVAL_MS = 60 * 60 * 1000;

async function main(): Promise<void> {
  const config = loadConfig();

  mkdirSync(dirname(resolve(config.DATABASE_PATH)), { recursive: true });
  mkdirSync(resolve(config.UPLOAD_DIR), { recursive: true });

  const database = createDatabase(config.DATABASE_PATH);
  const app = await buildApp({
    context: { database, config, now: () => new Date() },
    logger: true,
  });

  /**
   * The built SPA is served from the same origin as the API.
   *
   * One origin means no CORS, a plain session cookie, and a service worker whose scope
   * covers everything the application talks to.
   */
  if (config.WEB_DIST) {
    await app.register(fastifyStatic, { root: resolve(config.WEB_DIST) });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: { code: 'not_found', message: 'no such route' } });
      }
      // Anything else is a client-side route; the SPA decides what it means.
      return reply.sendFile('index.html');
    });
  }

  const housekeeping = setInterval(() => {
    const now = new Date();
    purgeExpiredSessions(database, now);
    purgeExpiredFlows(database, now);
  }, HOUSEKEEPING_INTERVAL_MS);
  housekeeping.unref();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    clearInterval(housekeeping);
    await app.close();
    database.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
