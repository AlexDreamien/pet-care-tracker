/**
 * The schema, as SQL.
 *
 * Written by hand rather than generated, and kept honest by `tests/schema-parity.test.ts`,
 * which compares every table here against the Drizzle definitions column by column. That
 * test is the reason this file can be trusted; do not skip it when adding a column.
 */

import type BetterSqlite3 from 'better-sqlite3';

/** Bump when adding a statement below, so an existing database picks the change up. */
export const SCHEMA_VERSION = 1;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    recovery_code_hash TEXT,
    display_name TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'ru',
    unit_system TEXT NOT NULL DEFAULT 'metric',
    time_zone TEXT NOT NULL DEFAULT 'UTC',
    created_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email)`,

  `CREATE TABLE IF NOT EXISTS credentials (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL,
    public_key TEXT NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    transports TEXT,
    device_label TEXT,
    created_at TEXT NOT NULL,
    last_used_at TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS credentials_credential_id_unique ON credentials (credential_id)`,
  `CREATE INDEX IF NOT EXISTS credentials_user_idx ON credentials (user_id)`,

  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_unique ON sessions (token_hash)`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`,

  `CREATE TABLE IF NOT EXISTS webauthn_flows (
    id TEXT PRIMARY KEY,
    purpose TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    challenge TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS webauthn_flows_expiry_idx ON webauthn_flows (expires_at)`,

  `CREATE TABLE IF NOT EXISTS households (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    calendar_token TEXT NOT NULL,
    reminder_lead_days INTEGER NOT NULL DEFAULT 2,
    reminder_hour INTEGER NOT NULL DEFAULT 9,
    time_zone TEXT NOT NULL DEFAULT 'UTC',
    currency TEXT NOT NULL DEFAULT 'RUB',
    food_lead_days INTEGER NOT NULL DEFAULT 5,
    created_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS household_members (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'editor',
    created_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS household_members_unique ON household_members (household_id, user_id)`,
  `CREATE INDEX IF NOT EXISTS household_members_user_idx ON household_members (user_id)`,

  `CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS files_household_idx ON files (household_id)`,

  `CREATE TABLE IF NOT EXISTS pets (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    species TEXT NOT NULL,
    species_label TEXT,
    breed TEXT,
    sex TEXT NOT NULL DEFAULT 'unknown',
    colour TEXT,
    birth_date TEXT,
    birth_precision TEXT NOT NULL DEFAULT 'exact',
    acquired_on TEXT,
    microchip TEXT,
    microchip_implanted_on TEXT,
    tattoo TEXT,
    pedigree_number TEXT,
    registration_number TEXT,
    neutered INTEGER NOT NULL DEFAULT 0,
    neutered_on TEXT,
    avatar_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
    notes TEXT,
    lost_token TEXT,
    lost_contact_name TEXT,
    lost_contact_phone TEXT,
    lost_note TEXT,
    archived_at TEXT,
    deceased_on TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS pets_household_idx ON pets (household_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS pets_lost_token_unique ON pets (lost_token)`,

  `CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    website TEXT,
    favourite INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS contacts_household_idx ON contacts (household_id)`,

  `CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    issued_on TEXT,
    expires_on TEXT,
    file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS documents_pet_idx ON documents (pet_id)`,
  `CREATE INDEX IF NOT EXISTS documents_expiry_idx ON documents (expires_on)`,

  `CREATE TABLE IF NOT EXISTS health_flags (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',
    notes TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS health_flags_pet_idx ON health_flags (pet_id)`,

  `CREATE TABLE IF NOT EXISTS vaccinations (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    vaccine_code TEXT,
    product_name TEXT,
    batch_number TEXT,
    administered_on TEXT NOT NULL,
    next_due_on TEXT,
    contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS vaccinations_pet_idx ON vaccinations (pet_id)`,
  `CREATE INDEX IF NOT EXISTS vaccinations_due_idx ON vaccinations (next_due_on)`,

  `CREATE TABLE IF NOT EXISTS parasite_treatments (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    target TEXT NOT NULL,
    product_name TEXT,
    administered_on TEXT NOT NULL,
    next_due_on TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS parasite_treatments_pet_idx ON parasite_treatments (pet_id)`,
  `CREATE INDEX IF NOT EXISTS parasite_treatments_due_idx ON parasite_treatments (next_due_on)`,

  `CREATE TABLE IF NOT EXISTS visits (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    visited_on TEXT NOT NULL,
    reason TEXT NOT NULL,
    findings TEXT,
    treatment TEXT,
    cost REAL,
    currency TEXT,
    contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS visits_pet_idx ON visits (pet_id)`,

  `CREATE TABLE IF NOT EXISTS medication_courses (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    dose TEXT,
    times_per_day INTEGER NOT NULL DEFAULT 1,
    starts_on TEXT NOT NULL,
    ends_on TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS medication_courses_pet_idx ON medication_courses (pet_id)`,

  `CREATE TABLE IF NOT EXISTS medication_doses (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES medication_courses(id) ON DELETE CASCADE,
    due_on TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    taken_at TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS medication_doses_unique ON medication_doses (course_id, due_on, sequence)`,
  `CREATE INDEX IF NOT EXISTS medication_doses_course_idx ON medication_doses (course_id)`,

  `CREATE TABLE IF NOT EXISTS measurements (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    metric TEXT NOT NULL,
    measured_on TEXT NOT NULL,
    value REAL NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS measurements_pet_metric_idx ON measurements (pet_id, metric, measured_on)`,

  `CREATE TABLE IF NOT EXISTS measurement_targets (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    metric TEXT NOT NULL,
    value REAL,
    min_value REAL,
    max_value REAL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS measurement_targets_unique ON measurement_targets (pet_id, metric)`,

  `CREATE TABLE IF NOT EXISTS care_events (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    scheduled_on TEXT NOT NULL,
    start_time TEXT,
    duration_minutes INTEGER,
    contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    recurrence TEXT,
    last_completed_on TEXT,
    location TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS care_events_pet_idx ON care_events (pet_id)`,
  `CREATE INDEX IF NOT EXISTS care_events_scheduled_idx ON care_events (scheduled_on)`,

  `CREATE TABLE IF NOT EXISTS food_bags (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    brand TEXT,
    name TEXT NOT NULL,
    weight_grams INTEGER NOT NULL,
    daily_grams REAL NOT NULL,
    opened_on TEXT NOT NULL,
    finished_on TEXT,
    price REAL,
    currency TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS food_bags_pet_idx ON food_bags (pet_id, opened_on)`,

  `CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    pet_id TEXT REFERENCES pets(id) ON DELETE SET NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    spent_on TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS expenses_household_idx ON expenses (household_id, spent_on)`,

  `CREATE TABLE IF NOT EXISTS event_completions (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES care_events(id) ON DELETE CASCADE,
    completed_on TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS event_completions_event_idx ON event_completions (event_id)`,
];

export function migrate(database: BetterSqlite3.Database): void {
  database.exec('PRAGMA foreign_keys = ON');
  const apply = database.transaction(() => {
    for (const statement of STATEMENTS) database.exec(statement);
    database.pragma(`user_version = ${SCHEMA_VERSION}`);
  });
  apply();
}
