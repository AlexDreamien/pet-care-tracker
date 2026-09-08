/**
 * The hand-written DDL and the Drizzle definitions must describe the same database.
 *
 * This is the test that makes it safe not to run a migration generator: add a column to
 * one and forget the other, and this fails with the column name in the message.
 */

import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { createDatabase } from '../src/db/client';
import { schema } from '../src/db/schema';

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

const database = createDatabase();

describe('schema parity', () => {
  const tables = Object.values(schema);

  it('creates every table the Drizzle schema declares', () => {
    const existing = new Set(
      database.sqlite
        .prepare<[], { name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`)
        .all()
        .map((row) => row.name),
    );

    for (const table of tables) {
      expect(existing.has(getTableConfig(table).name)).toBe(true);
    }
  });

  it.each(tables.map((table) => [getTableConfig(table).name, table] as const))(
    '%s has the same columns in the DDL and the schema',
    (name, table) => {
      const config = getTableConfig(table);
      const actual = database.sqlite.prepare<[], ColumnInfo>(`PRAGMA table_info(${name})`).all();

      const declared = config.columns.map((column) => column.name).sort();
      const created = actual.map((column) => column.name).sort();
      expect(created).toEqual(declared);

      for (const column of config.columns) {
        const match = actual.find((candidate) => candidate.name === column.name);
        expect(match, `${name}.${column.name} missing from the DDL`).toBeDefined();
        expect(
          Boolean(match?.notnull) || Boolean(match?.pk),
          `${name}.${column.name} nullability differs`,
        ).toBe(column.notNull || column.primary);
      }
    },
  );

  it('creates every declared index', () => {
    const existing = new Set(
      database.sqlite
        .prepare<[], { name: string }>(`SELECT name FROM sqlite_master WHERE type = 'index'`)
        .all()
        .map((row) => row.name),
    );

    for (const table of tables) {
      for (const declared of getTableConfig(table).indexes) {
        const name = declared.config.name;
        expect(name).toBeDefined();
        expect(existing.has(name as string), `${name} is missing from the DDL`).toBe(true);
      }
    }
  });

  it('enforces foreign keys', () => {
    expect(database.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});
