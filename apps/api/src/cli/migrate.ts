import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadConfig } from '../config';
import { createDatabase } from '../db/client';
import { SCHEMA_VERSION } from '../db/migrate';

/**
 * Applies the schema to the configured database.
 *
 * `createDatabase` migrates on open, so this exists to do it deliberately — before a
 * deployment switches over, or to create the file on a fresh volume.
 */
const config = loadConfig();
mkdirSync(dirname(resolve(config.DATABASE_PATH)), { recursive: true });

const database = createDatabase(config.DATABASE_PATH);
const applied = database.sqlite.pragma('user_version', { simple: true });
database.close();

console.log(`schema version ${String(applied)} applied to ${config.DATABASE_PATH}`);
if (applied !== SCHEMA_VERSION) {
  console.error(`expected version ${SCHEMA_VERSION}`);
  process.exit(1);
}
