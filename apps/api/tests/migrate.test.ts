/**
 * Migrating a database that already exists.
 *
 * Every other test starts from an empty file, which is why none of them caught the real
 * failure: `CREATE TABLE IF NOT EXISTS` does nothing to a table that is already there, so a
 * new column never appeared on a deployed volume and the first index touching it took the
 * application down on boot. These tests start from an *older* database on purpose.
 */

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { ensureColumns, migrate, SCHEMA_VERSION } from '../src/db/migrate';
import { schema } from '../src/db/schema';

let database: BetterSqlite3.Database;

afterEach(() => {
  database?.close();
});

/** The `pets` and `households` tables as an earlier release created them. */
function olderDatabase(): BetterSqlite3.Database {
  const sqlite = new BetterSqlite3(':memory:');
  sqlite.exec(`
    CREATE TABLE households (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      calendar_token TEXT NOT NULL,
      reminder_lead_days INTEGER NOT NULL DEFAULT 2,
      reminder_hour INTEGER NOT NULL DEFAULT 9,
      created_at TEXT NOT NULL
    );
    CREATE TABLE pets (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL,
      name TEXT NOT NULL,
      species TEXT NOT NULL,
      sex TEXT NOT NULL DEFAULT 'unknown',
      birth_precision TEXT NOT NULL DEFAULT 'exact',
      neutered INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  sqlite.pragma('user_version = 1');
  return sqlite;
}

const columnsOf = (sqlite: BetterSqlite3.Database, table: string) =>
  new Set(
    sqlite
      .prepare<[], { name: string }>(`PRAGMA table_info(${table})`)
      .all()
      .map((row) => row.name),
  );

describe('migrating an existing database', () => {
  it('adds the columns a newer release declares', () => {
    database = olderDatabase();
    expect(columnsOf(database, 'pets').has('lost_token')).toBe(false);

    const added = migrate(database);

    expect(columnsOf(database, 'pets').has('lost_token')).toBe(true);
    expect(columnsOf(database, 'pets').has('microchip')).toBe(true);
    expect(columnsOf(database, 'households').has('currency')).toBe(true);
    expect(added).toContain('pets.lost_token');
  });

  it('creates an index that references a column it just added', () => {
    // The exact failure: the index ran before the column existed and took the boot down.
    database = olderDatabase();
    migrate(database);

    const indexes = database
      .prepare<[], { name: string }>(`SELECT name FROM sqlite_master WHERE type = 'index'`)
      .all()
      .map((row) => row.name);

    expect(indexes).toContain('pets_lost_token_unique');
  });

  it('keeps the rows that were already there', () => {
    database = olderDatabase();
    database
      .prepare(
        `INSERT INTO households (id, name, calendar_token, created_at) VALUES ('h', 'Дом', 'tok', '2026-01-01T00:00:00Z')`,
      )
      .run();
    database
      .prepare(
        `INSERT INTO pets (id, household_id, name, species, created_at, updated_at)
         VALUES ('p', 'h', 'Рекс', 'dog', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
      )
      .run();

    migrate(database);

    const pet = database
      .prepare<[], { name: string; lost_token: string | null; species: string }>(
        `SELECT name, lost_token, species FROM pets WHERE id = 'p'`,
      )
      .get();

    expect(pet?.name).toBe('Рекс');
    expect(pet?.species).toBe('dog');
    expect(pet?.lost_token).toBeNull();

    const household = database
      .prepare<[], { currency: string }>(`SELECT currency FROM households WHERE id = 'h'`)
      .get();
    // A column added with a default fills existing rows rather than leaving them null.
    expect(household?.currency).toBe('RUB');
  });

  it('is idempotent', () => {
    database = olderDatabase();
    migrate(database);

    expect(migrate(database)).toEqual([]);
    expect(ensureColumns(database)).toEqual([]);
    expect(database.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
  });

  it('leaves a migrated database matching the schema in full', () => {
    // The general form of the bug: not "did we remember lost_token" but "is anything the
    // schema declares still missing after a migration".
    database = olderDatabase();
    migrate(database);

    const missing: string[] = [];
    for (const table of Object.values(schema)) {
      const config = getTableConfig(table);
      const actual = columnsOf(database, config.name);
      for (const column of config.columns) {
        if (!actual.has(column.name)) missing.push(`${config.name}.${column.name}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it('adds nothing to a database created from the current baseline', () => {
    database = new BetterSqlite3(':memory:');
    expect(migrate(database)).toEqual([]);
  });
});
