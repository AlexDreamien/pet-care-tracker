import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from './migrate';
import { schema } from './schema';

export interface Database {
  sqlite: BetterSqlite3.Database;
  db: ReturnType<typeof drizzle<typeof schema>>;
  /** Columns this open added to an existing database; empty for a fresh one. */
  migrated: string[];
  close(): void;
}

/**
 * Opens the database and applies the schema.
 *
 * WAL keeps a reader from blocking the writer, which matters on a single small machine
 * where the ICS feed is fetched by a calendar client on someone else's schedule. Foreign
 * keys are off by default in SQLite and have to be asked for on every connection.
 */
export function createDatabase(path = ':memory:'): Database {
  const sqlite = new BetterSqlite3(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');

  const migrated = migrate(sqlite);

  return {
    sqlite,
    db: drizzle(sqlite, { schema }),
    migrated,
    close: () => sqlite.close(),
  };
}
