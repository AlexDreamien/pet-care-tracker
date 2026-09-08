/**
 * The validation schemas the API and the web client both import.
 *
 * One definition per shape, used on the way in at the server and on the way out of a form
 * in the browser. Two copies would drift, and the one that drifted would be the client's —
 * which is the one the owner sees.
 */

import { z } from 'zod';
import { isValidDate } from './date';
import { isValidMicrochip } from './microchip';
import { METRICS } from './measurements';
import { BCS_MAX, BCS_MIN } from './bcs';

/** A calendar date, rejecting ones that do not exist such as `2026-02-30`. */
export const isoDateSchema = z
  .string()
  .refine(isValidDate, { message: 'expected a YYYY-MM-DD calendar date' });

export const instantSchema = z.iso.datetime({ offset: true });

const trimmed = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => trimmed(max).min(1);
const optionalText = (max: number) =>
  trimmed(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

export const speciesSchema = z.enum(['dog', 'cat', 'other']);
export const sexSchema = z.enum(['male', 'female', 'unknown']);
export const birthPrecisionSchema = z.enum(['exact', 'month', 'year', 'approximate']);
export const recurrenceUnitSchema = z.enum(['day', 'week', 'month', 'year']);
export const unitSystemSchema = z.enum(['metric', 'imperial']);
export const localeSchema = z.enum(['ru', 'en']);

export const documentKindSchema = z.enum([
  'vet_passport',
  'pedigree',
  'registration',
  'insurance',
  'travel_certificate',
  'purchase_contract',
  'lab_result',
  'other',
]);

export const healthFlagKindSchema = z.enum(['allergy', 'chronic_condition', 'drug_intolerance']);
export const severitySchema = z.enum(['low', 'medium', 'high']);
export const parasiteTargetSchema = z.enum(['internal', 'external', 'both']);
export const metricSchema = z.enum(
  Object.keys(METRICS) as [keyof typeof METRICS, ...(keyof typeof METRICS)[]],
);

export const contactKindSchema = z.enum([
  'clinic',
  'vet',
  'groomer',
  'trainer',
  'sitter',
  'taxi',
  'other',
]);

export const eventTypeSchema = z.enum([
  'checkup',
  'vaccination',
  'parasite_treatment',
  'grooming',
  'nail_trim',
  'teeth',
  'ears',
  'bath',
  'training',
  'boarding',
  'other',
]);

export const householdRoleSchema = z.enum(['owner', 'editor', 'viewer']);

const interval = z.number().int().min(1).max(365);

export const recurrenceRuleSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('fixed_calendar'),
    interval,
    unit: recurrenceUnitSchema,
    anchor: isoDateSchema,
    until: isoDateSchema.optional(),
    count: z.number().int().min(1).max(1000).optional(),
  }),
  z.object({
    kind: z.literal('after_completion'),
    interval,
    unit: recurrenceUnitSchema,
    anchor: isoDateSchema,
    until: isoDateSchema.optional(),
  }),
]);

// -- accounts ---------------------------------------------------------------------------

/**
 * Twelve characters and no composition rules. Length is what makes a password hard to
 * guess; forcing a punctuation mark mostly produces `Password1!`.
 */
export const passwordSchema = z.string().min(12).max(200);

export const registerSchema = z.object({
  email: z.email().max(254),
  password: passwordSchema,
  displayName: requiredText(80),
  locale: localeSchema.default('ru'),
  /** Required only when the instance is configured to ask for one. */
  inviteCode: z.string().max(200).optional(),
});

export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});

export const recoverySchema = z.object({
  email: z.email().max(254),
  recoveryCode: requiredText(64),
  newPassword: passwordSchema,
});

export const inviteMemberSchema = z.object({
  email: z.email().max(254),
  role: householdRoleSchema.default('editor'),
});

export const profileSchema = z
  .object({
    displayName: requiredText(80).optional(),
    locale: localeSchema.optional(),
    unitSystem: unitSystemSchema.optional(),
    /** IANA zone; it decides what "today" means for overdue and for the agenda. */
    timeZone: trimmed(64).optional(),
  })
  .refine((profile) => Object.values(profile).some((value) => value !== undefined), {
    message: 'nothing to update',
  });

// -- pets -------------------------------------------------------------------------------

export const petSchema = z
  .object({
    name: requiredText(60),
    species: speciesSchema,
    /** Free text for a species outside the built-in list; required when species is other. */
    speciesLabel: optionalText(60),
    breed: optionalText(80),
    sex: sexSchema.default('unknown'),
    colour: optionalText(80),
    birthDate: isoDateSchema.optional(),
    birthPrecision: birthPrecisionSchema.default('exact'),
    acquiredOn: isoDateSchema.optional(),
    microchip: trimmed(32)
      .optional()
      .refine((value) => value === undefined || value === '' || isValidMicrochip(value), {
        message: 'not a recognised microchip number',
      })
      .transform((value) => (value === '' ? undefined : value)),
    microchipImplantedOn: isoDateSchema.optional(),
    tattoo: optionalText(32),
    pedigreeNumber: optionalText(60),
    registrationNumber: optionalText(60),
    neutered: z.boolean().default(false),
    neuteredOn: isoDateSchema.optional(),
    avatarFileId: z.uuid().optional(),
    notes: optionalText(2000),
  })
  .refine((pet) => pet.species !== 'other' || (pet.speciesLabel ?? '') !== '', {
    message: 'name the species when it is not a dog or a cat',
    path: ['speciesLabel'],
  })
  .refine(
    (pet) =>
      !pet.neutered ||
      pet.birthDate === undefined ||
      pet.neuteredOn === undefined ||
      pet.neuteredOn >= pet.birthDate,
    {
      message: 'neutering cannot predate the birth date',
      path: ['neuteredOn'],
    },
  );

/**
 * What a stranger who found the animal is shown.
 *
 * Nothing is pulled from the medical record: the note is the owner's own words, so a
 * public page can never disclose something they did not choose to write on it.
 */
export const lostTagSchema = z.object({
  contactName: requiredText(80),
  contactPhone: requiredText(40),
  note: optionalText(500),
});

// -- documents and medical record --------------------------------------------------------

export const documentSchema = z
  .object({
    kind: documentKindSchema,
    title: requiredText(120),
    issuedOn: isoDateSchema.optional(),
    expiresOn: isoDateSchema.optional(),
    fileId: z.uuid().optional(),
    notes: optionalText(1000),
  })
  .refine(
    (doc) =>
      doc.issuedOn === undefined || doc.expiresOn === undefined || doc.expiresOn >= doc.issuedOn,
    { message: 'a document cannot expire before it was issued', path: ['expiresOn'] },
  );

export const vaccinationSchema = z.object({
  vaccineCode: optionalText(40),
  productName: optionalText(120),
  batchNumber: optionalText(60),
  administeredOn: isoDateSchema,
  nextDueOn: isoDateSchema.optional(),
  contactId: z.uuid().optional(),
  documentId: z.uuid().optional(),
  notes: optionalText(1000),
});

export const parasiteTreatmentSchema = z.object({
  target: parasiteTargetSchema,
  productName: optionalText(120),
  administeredOn: isoDateSchema,
  nextDueOn: isoDateSchema.optional(),
  notes: optionalText(1000),
});

export const visitSchema = z.object({
  visitedOn: isoDateSchema,
  reason: requiredText(200),
  findings: optionalText(4000),
  treatment: optionalText(4000),
  cost: z.number().nonnegative().max(10_000_000).optional(),
  currency: trimmed(3).optional(),
  contactId: z.uuid().optional(),
  notes: optionalText(1000),
});

export const healthFlagSchema = z.object({
  kind: healthFlagKindSchema,
  label: requiredText(120),
  severity: severitySchema.default('medium'),
  notes: optionalText(1000),
});

export const medicationCourseSchema = z
  .object({
    name: requiredText(120),
    dose: optionalText(120),
    timesPerDay: z.number().int().min(1).max(12).default(1),
    startsOn: isoDateSchema,
    endsOn: isoDateSchema.optional(),
    notes: optionalText(1000),
  })
  .refine((course) => course.endsOn === undefined || course.endsOn >= course.startsOn, {
    message: 'a course cannot end before it starts',
    path: ['endsOn'],
  });

// -- measurements -------------------------------------------------------------------------

export const measurementSchema = z.object({
  metric: metricSchema,
  measuredOn: isoDateSchema,
  /** Always in the storage unit: kilograms, centimetres, degrees Celsius. */
  value: z.number().finite(),
  notes: optionalText(500),
});

export const measurementTargetSchema = z
  .object({
    metric: metricSchema,
    value: z.number().finite().optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  })
  .refine(
    (target) => target.min === undefined || target.max === undefined || target.min <= target.max,
    {
      message: 'the lower bound must not exceed the upper bound',
      path: ['min'],
    },
  );

export const bcsSchema = z.number().min(BCS_MIN).max(BCS_MAX);

// -- calendar ------------------------------------------------------------------------------

export const contactSchema = z.object({
  kind: contactKindSchema,
  name: requiredText(120),
  phone: optionalText(40),
  email: z.union([z.email().max(254), z.literal('')]).optional(),
  address: optionalText(300),
  website: z.union([z.url().max(300), z.literal('')]).optional(),
  favourite: z.boolean().default(false),
  notes: optionalText(1000),
});

export const careEventSchema = z
  .object({
    petId: z.uuid(),
    type: eventTypeSchema,
    title: requiredText(120),
    scheduledOn: isoDateSchema,
    /** Wall-clock time on `scheduledOn`, as `HH:MM`; absent makes it an all-day event. */
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM')
      .optional(),
    durationMinutes: z.number().int().min(5).max(1440).optional(),
    contactId: z.uuid().optional(),
    recurrence: recurrenceRuleSchema.optional(),
    location: optionalText(300),
    notes: optionalText(1000),
  })
  .refine(
    (event) => event.recurrence === undefined || event.recurrence.anchor === event.scheduledOn,
    {
      message: 'the recurrence anchor must be the first scheduled date',
      path: ['recurrence', 'anchor'],
    },
  );

export const completeEventSchema = z.object({
  completedOn: isoDateSchema,
  notes: optionalText(1000),
});

export const reminderPreferenceSchema = z.object({
  leadDays: z.number().int().min(0).max(60).default(2),
  hour: z.number().int().min(0).max(23).default(9),
});

// -- food and money ---------------------------------------------------------------------------

/** ISO 4217-shaped: three letters, upper-cased. No conversion happens anywhere. */
export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'expected a three-letter currency code');

export const foodBagSchema = z
  .object({
    brand: optionalText(80),
    name: requiredText(120),
    /** Net weight of the bag. Grams keep the arithmetic in integers. */
    weightGrams: z.number().int().min(1).max(200_000),
    /** The daily ration; the only figure the forecast really depends on. */
    dailyGrams: z.number().min(1).max(5_000),
    openedOn: isoDateSchema,
    finishedOn: isoDateSchema.optional(),
    price: z.number().nonnegative().max(1_000_000).optional(),
    currency: currencySchema.optional(),
    notes: optionalText(500),
  })
  .refine((bag) => bag.finishedOn === undefined || bag.finishedOn >= bag.openedOn, {
    message: 'a bag cannot be finished before it was opened',
    path: ['finishedOn'],
  });

export const expenseCategorySchema = z.enum([
  'food',
  'vet',
  'medication',
  'grooming',
  'accessories',
  'insurance',
  'training',
  'boarding',
  'other',
]);

export const expenseSchema = z.object({
  /** Absent for something the whole household shares, such as a carrier. */
  petId: z.uuid().optional(),
  category: expenseCategorySchema,
  amount: z.number().positive().max(10_000_000),
  currency: currencySchema.optional(),
  spentOn: isoDateSchema,
  note: optionalText(300),
});

export const expenseQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  petId: z.uuid().optional(),
});

export const agendaQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  petId: z.uuid().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PetInput = z.infer<typeof petSchema>;
export type DocumentInput = z.infer<typeof documentSchema>;
export type VaccinationInput = z.infer<typeof vaccinationSchema>;
export type ParasiteTreatmentInput = z.infer<typeof parasiteTreatmentSchema>;
export type VisitInput = z.infer<typeof visitSchema>;
export type HealthFlagInput = z.infer<typeof healthFlagSchema>;
export type MedicationCourseInput = z.infer<typeof medicationCourseSchema>;
export type MeasurementInput = z.infer<typeof measurementSchema>;
export type MeasurementTargetInput = z.infer<typeof measurementTargetSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type CareEventInput = z.infer<typeof careEventSchema>;
export type ReminderPreferenceInput = z.infer<typeof reminderPreferenceSchema>;
export type FoodBagInput = z.infer<typeof foodBagSchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type LostTagInput = z.infer<typeof lostTagSchema>;
