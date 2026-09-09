import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createDatabase } from './db/client';
import { purgeExpiredSessions } from './domain/auth';
import { purgeExpiredFlows } from './domain/passkeys';
import { dispatchDueReminders } from './domain/push';

/** Hourly is often enough for rows whose only cost is sitting there. */
const HOUSEKEEPING_INTERVAL_MS = 60 * 60 * 1000;

/**
 * How often to look for reminders to push.
 *
 * Quarter-hourly rather than hourly so a machine that woke up late still catches the
 * household's reminder hour. Sending twice is prevented by the ledger, not by the clock.
 */
const PUSH_INTERVAL_MS = 15 * 60 * 1000;

async function main(): Promise<void> {
  const config = loadConfig();

  mkdirSync(dirname(resolve(config.DATABASE_PATH)), { recursive: true });
  mkdirSync(resolve(config.UPLOAD_DIR), { recursive: true });

  const database = createDatabase(config.DATABASE_PATH);
  const app = await buildApp({
    context: { database, config, now: () => new Date() },
    logger: true,
  });

  // Altering a live database on boot should be visible in the log, not silent.
  if (database.migrated.length > 0) {
    app.log.info({ columns: database.migrated }, 'added columns to an existing database');
  }

  const housekeeping = setInterval(() => {
    const now = new Date();
    purgeExpiredSessions(database, now);
    purgeExpiredFlows(database, now);
  }, HOUSEKEEPING_INTERVAL_MS);
  housekeeping.unref();

  /**
   * The push sweep, while the process happens to be running.
   *
   * A machine that suspends when idle will miss this, which is why `POST /push/dispatch`
   * exists for something outside to call — and why the calendar feed, which needs no
   * running process at all, is still the primary channel.
   */
  const pushSweep = setInterval(() => {
    void dispatchDueReminders(database, config, new Date()).then((result) => {
      if (result.notificationsSent > 0) app.log.info(result, 'pushed reminders');
    });
  }, PUSH_INTERVAL_MS);
  pushSweep.unref();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    clearInterval(housekeeping);
    clearInterval(pushSweep);
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
