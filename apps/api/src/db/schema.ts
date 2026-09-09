/**
 * The database schema, as Drizzle tables.
 *
 * The DDL that creates these tables lives in `migrate.ts` and is written by hand. A test
 * compares the two column by column, so the pair cannot drift apart without a failure.
 *
 * Conventions: identifiers are UUIDv7 text, timestamps are UTC ISO-8601 text, calendar
 * dates are `YYYY-MM-DD` text and never pass through a `Date`.
 */

import { relations } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const id = () => text('id').primaryKey();
const createdAt = () => text('created_at').notNull();

// -- accounts -----------------------------------------------------------------------------

export const users = sqliteTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    /** Argon2id hash of a single-use recovery code, cleared once spent. */
    recoveryCodeHash: text('recovery_code_hash'),
    displayName: text('display_name').notNull(),
    locale: text('locale').notNull().default('ru'),
    unitSystem: text('unit_system').notNull().default('metric'),
    timeZone: text('time_zone').notNull().default('UTC'),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

export const credentials = sqliteTable(
  'credentials',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull(),
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transports: text('transports'),
    deviceLabel: text('device_label'),
    createdAt: createdAt(),
    lastUsedAt: text('last_used_at'),
  },
  (table) => [
    uniqueIndex('credentials_credential_id_unique').on(table.credentialId),
    index('credentials_user_idx').on(table.userId),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the cookie value; the token itself is never stored. */
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    expiresAt: text('expires_at').notNull(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_user_idx').on(table.userId),
  ],
);

/**
 * One in-flight WebAuthn ceremony.
 *
 * The challenge has to be remembered between the two requests of a passkey flow, and it
 * cannot live in memory: a deploy between the two halves would fail every login in
 * progress. Rows are single-use and short-lived.
 */
export const webauthnFlows = sqliteTable(
  'webauthn_flows',
  {
    id: id(),
    purpose: text('purpose').notNull(),
    /** Null for a usernameless login, where the user is only known after verification. */
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    challenge: text('challenge').notNull(),
    createdAt: createdAt(),
    expiresAt: text('expires_at').notNull(),
  },
  (table) => [index('webauthn_flows_expiry_idx').on(table.expiresAt)],
);

export const households = sqliteTable('households', {
  id: id(),
  name: text('name').notNull(),
  /** Opaque, revocable token backing the ICS subscription URL. */
  calendarToken: text('calendar_token').notNull(),
  reminderLeadDays: integer('reminder_lead_days').notNull().default(2),
  reminderHour: integer('reminder_hour').notNull().default(9),
  /**
   * The zone appointment times are written in. It belongs to the household rather than to
   * a member, because the calendar feed is fetched without anyone signed in.
   */
  timeZone: text('time_zone').notNull().default('UTC'),
  /** The currency the expense summary totals in. Nothing is ever converted. */
  currency: text('currency').notNull().default('RUB'),
  /** Days of warning before an open bag of food runs out. */
  foodLeadDays: integer('food_lead_days').notNull().default(5),
  createdAt: createdAt(),
});

export const householdMembers = sqliteTable(
  'household_members',
  {
    id: id(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('editor'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('household_members_unique').on(table.householdId, table.userId),
    index('household_members_user_idx').on(table.userId),
  ],
);

// -- pets and files -------------------------------------------------------------------------

export const files = sqliteTable(
  'files',
  {
    id: id(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    sha256: text('sha256').notNull(),
    storagePath: text('storage_path').notNull(),
    thumbnailPath: text('thumbnail_path'),
    createdAt: createdAt(),
  },
  (table) => [index('files_household_idx').on(table.householdId)],
);

export const pets = sqliteTable(
  'pets',
  {
    id: id(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    species: text('species').notNull(),
    speciesLabel: text('species_label'),
    breed: text('breed'),
    sex: text('sex').notNull().default('unknown'),
    colour: text('colour'),
    birthDate: text('birth_date'),
    birthPrecision: text('birth_precision').notNull().default('exact'),
    acquiredOn: text('acquired_on'),
    microchip: text('microchip'),
    microchipImplantedOn: text('microchip_implanted_on'),
    tattoo: text('tattoo'),
    pedigreeNumber: text('pedigree_number'),
    registrationNumber: text('registration_number'),
    neutered: integer('neutered', { mode: 'boolean' }).notNull().default(false),
    neuteredOn: text('neutered_on'),
    avatarFileId: text('avatar_file_id').references(() => files.id, { onDelete: 'set null' }),
    notes: text('notes'),
    /**
     * The lost-tag token. Null until the owner turns the tag on, and replaceable — a tag
     * that fell off a collar in a park is a URL somebody else now holds.
     */
    lostToken: text('lost_token'),
    lostContactName: text('lost_contact_name'),
    lostContactPhone: text('lost_contact_phone'),
    /** The owner's own words, so nothing medical is disclosed by accident. */
    lostNote: text('lost_note'),
    archivedAt: text('archived_at'),
    deceasedOn: text('deceased_on'),
    createdAt: createdAt(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('pets_household_idx').on(table.householdId),
    uniqueIndex('pets_lost_token_unique').on(table.lostToken),
  ],
);

// -- contacts --------------------------------------------------------------------------------

export const contacts = sqliteTable(
  'contacts',
  {
    id: id(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    address: text('address'),
    website: text('website'),
    favourite: integer('favourite', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (table) => [index('contacts_household_idx').on(table.householdId)],
);

// -- documents and medical record ---------------------------------------------------------------

export const documents = sqliteTable(
  'documents',
  {
    id: id(),
    petId: text('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    issuedOn: text('issued_on'),
    expiresOn: text('expires_on'),
    fileId: text('file_id').references(() => files.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (table) => [
    index('documents_pet_idx').on(table.petId),
    index('documents_expiry_idx').on(table.expiresOn),
  ],
);

export const healthFlags = sqliteTable(
  'health_flags',
  {
    id: id(),
    petId: text('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    label: text('label').notNull(),
    severity: text('severity').notNull().default('medium'),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (table) => [index('health_flags_pet_idx').on(table.petId)],
);

export const vaccinations = sqliteTable(
  'vaccinations',
  {
    id: id(),
    petId: text('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    vaccineCode: text('vaccine_code'),
    productName: text('product_name'),
    batchNumber: text('batch_number'),
    administeredOn: text('administered_on').notNull(),
    nextDueOn: text('next_due_on'),
    contactId: text('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    documentId: text('document_id').references(() => documents.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (table) => [
    index('vaccinations_pet_idx').on(table.petId),
    index('vaccinations_due_idx').on(table.nextDueOn),
  ],
);

export const parasiteTreatments = sqliteTable(
  'parasite_treatments',
  {
    id: id(),
    petId: text('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    target: text('target').notNull(),
    productName: text('product_name'),
    administeredOn: text('administered_on').notNull(),
    nextDueOn: text('next_due_on'),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (table) => [
    index('parasite_treatments_pet_idx').on(table.petId),
    index('parasite_treatments_due_idx').on(table.nextDueOn),
  ],
);

export const visits = sqliteTable(
  'visits',
  {
    id: id(),
    petId: text('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    visitedOn: text('visited_on').notNull(),
    reason: text('reason').notNull(),
    findings: text('findings'),
    treatment: text('treatment'),
    cost: real('cost'),
    currency: text('currency'),
    contactId: text('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (table) => [index('visits_pet_idx').on(table.petId)],
);

export const medicationCourses = sqliteTable(
  'medication_courses',
  {
    id: id(),
    petId: text('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    dose: text('dose'),
    timesPerDay: integer('times_per_day').notNull().default(1),
    startsOn: text('starts_on').notNull(),
    endsOn: text('ends_on'),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (table) => [index('medication_courses_pet_idx').on(table.petId)],
);

export const medicationDoses = sqliteTable(
  'medication_doses',
  {
    id: id(),
    courseId: text('course_id')
      .notNull()
      .references(() => medicationCourses.id, { onDelete: 'cascade' }),
    dueOn: text('due_on').notNull(),
    /** Which dose of the day this is, counting from one. */
    sequence: integer('sequence').notNull(),
    takenAt: text('taken_at'),
  },
  (table) => [
    uniqueIndex('medication_doses_unique').on(table.courseId, table.dueOn, table.sequence),
    index('medication_doses_course_idx').on(table.courseId),
  ],
);

/**
 * One number off a laboratory form.
 *
 * The reference range is stored per reading, not per analyte: ranges differ between
 * laboratories and machines, and the one that matters is the one printed on the form the
 * value came from.
 */
export const labValues = sqliteTable(
  'lab_values',
  {
    id: id(),
    petId: text('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    /** The scan the numbers were read off, when there is one. */
    documentId: text('document_id').references(() => documents.id, { onDelete: 'set null' }),
    analyte: text('analyte').notNull(),
    value: real('value').notNull(),
    unit: text('unit').notNull(),
    measuredOn: text('measured_on').notNull(),
    referenceMin: real('reference_min'),
    referenceMax: real('reference_max'),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (table) => [index('lab_values_pet_idx').on(table.petId, table.analyte, table.measuredOn)],
);

// -- measurements ------------------------------------------------------------------------------

export const measurements = sqliteTable(
  'measurements',
  {
    id: id(),
    petId: text('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    metric: text('metric').notNull(),
    measuredOn: text('measured_on').notNull(),
    /** Always in the storage unit: kilograms, centimetres, degrees Celsius. */
    value: real('value').notNull(),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (table) => [index('measurements_pet_metric_idx').on(table.petId, table.metric, table.measuredOn)],
);

export const measurementTargets = sqliteTable(
  'measurement_targets',
  {
    id: id(),
    petId: text('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    metric: text('metric').notNull(),
    value: real('value'),
    minValue: real('min_value'),
    maxValue: real('max_value'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('measurement_targets_unique').on(table.petId, table.metric)],
);

// -- calendar -------------------------------------------------------------------------------------

export const careEvents = sqliteTable(
  'care_events',
  {
    id: id(),
    petId: text('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    scheduledOn: text('scheduled_on').notNull(),
    /** `HH:MM` wall-clock time; null makes the event all-day. */
    startTime: text('start_time'),
    durationMinutes: integer('duration_minutes'),
    contactId: text('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    /** A `RecurrenceRule` as JSON, or null for a one-off. */
    recurrence: text('recurrence', { mode: 'json' }),
    lastCompletedOn: text('last_completed_on'),
    location: text('location'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('care_events_pet_idx').on(table.petId),
    index('care_events_scheduled_idx').on(table.scheduledOn),
  ],
);

/**
 * A browser's push subscription.
 *
 * One row per browser, not per person: the same owner on a phone and a laptop is two
 * endpoints, and each dies on its own schedule when the browser decides to rotate it.
 */
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    deviceLabel: text('device_label'),
    createdAt: createdAt(),
    lastSentAt: text('last_sent_at'),
  },
  (table) => [
    uniqueIndex('push_subscriptions_endpoint_unique').on(table.endpoint),
    index('push_subscriptions_user_idx').on(table.userId),
  ],
);

/**
 * What has already been pushed.
 *
 * A reminder sent twice is worse than one sent late: the second one teaches the owner to
 * ignore the first. The agenda item's key is stable across regenerations, which is what
 * makes this ledger work.
 */
export const pushLog = sqliteTable(
  'push_log',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemKey: text('item_key').notNull(),
    sentOn: text('sent_on').notNull(),
  },
  (table) => [uniqueIndex('push_log_unique').on(table.userId, table.itemKey, table.sentOn)],
);

/**
 * A temporary, read-only link for whoever is looking after the animal.
 *
 * The third public surface, and the widest: a sitter is holding the animal, so they get the
 * allergies, the ration and what to give when. It expires on a date the owner picks and can
 * be revoked before then — the two things that make handing it over reasonable.
 */
export const sitterLinks = sqliteTable(
  'sitter_links',
  {
    id: id(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    /** Who it was made for, so a list of links is not a list of opaque strings. */
    label: text('label').notNull(),
    /** Inclusive last day it works. */
    expiresOn: text('expires_on').notNull(),
    revokedAt: text('revoked_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('sitter_links_token_unique').on(table.token),
    index('sitter_links_household_idx').on(table.householdId),
  ],
);

/** Which animals a link covers: the dog at the sitter, not the cat still at home. */
export const sitterLinkPets = sqliteTable(
  'sitter_link_pets',
  {
    id: id(),
    linkId: text('link_id')
      .notNull()
      .references(() => sitterLinks.id, { onDelete: 'cascade' }),
    petId: text('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
  },
  (table) => [uniqueIndex('sitter_link_pets_unique').on(table.linkId, table.petId)],
);

// -- food and money -------------------------------------------------------------------------------

export const foodBags = sqliteTable(
  'food_bags',
  {
    id: id(),
    petId: text('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    brand: text('brand'),
    name: text('name').notNull(),
    weightGrams: integer('weight_grams').notNull(),
    dailyGrams: real('daily_grams').notNull(),
    openedOn: text('opened_on').notNull(),
    /** Set when the bag is actually done, which is what corrects the next estimate. */
    finishedOn: text('finished_on'),
    price: real('price'),
    currency: text('currency'),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (table) => [index('food_bags_pet_idx').on(table.petId, table.openedOn)],
);

export const expenses = sqliteTable(
  'expenses',
  {
    id: id(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    /** Null for something the household shares rather than one animal. */
    petId: text('pet_id').references(() => pets.id, { onDelete: 'set null' }),
    category: text('category').notNull(),
    amount: real('amount').notNull(),
    currency: text('currency').notNull(),
    spentOn: text('spent_on').notNull(),
    note: text('note'),
    createdAt: createdAt(),
  },
  (table) => [index('expenses_household_idx').on(table.householdId, table.spentOn)],
);

export const eventCompletions = sqliteTable(
  'event_completions',
  {
    id: id(),
    eventId: text('event_id')
      .notNull()
      .references(() => careEvents.id, { onDelete: 'cascade' }),
    completedOn: text('completed_on').notNull(),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (table) => [index('event_completions_event_idx').on(table.eventId)],
);

// -- relations --------------------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(householdMembers),
  credentials: many(credentials),
  sessions: many(sessions),
}));

export const householdsRelations = relations(households, ({ many }) => ({
  members: many(householdMembers),
  pets: many(pets),
  contacts: many(contacts),
  files: many(files),
}));

export const petsRelations = relations(pets, ({ many, one }) => ({
  household: one(households, { fields: [pets.householdId], references: [households.id] }),
  documents: many(documents),
  healthFlags: many(healthFlags),
  vaccinations: many(vaccinations),
  parasiteTreatments: many(parasiteTreatments),
  visits: many(visits),
  medicationCourses: many(medicationCourses),
  measurements: many(measurements),
  careEvents: many(careEvents),
}));

export const schema = {
  users,
  credentials,
  sessions,
  webauthnFlows,
  households,
  householdMembers,
  files,
  pets,
  contacts,
  documents,
  healthFlags,
  vaccinations,
  parasiteTreatments,
  visits,
  medicationCourses,
  medicationDoses,
  measurements,
  measurementTargets,
  careEvents,
  eventCompletions,
  foodBags,
  expenses,
  sitterLinks,
  sitterLinkPets,
  labValues,
  pushSubscriptions,
  pushLog,
};
