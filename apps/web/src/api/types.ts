import type { Age, AgendaItem, Metric, RecurrenceRule } from '@pet-care-tracker/core';

export interface User {
  id: string;
  email: string;
  displayName: string;
  locale: 'ru' | 'en';
  unitSystem: 'metric' | 'imperial';
  timeZone: string;
}

export interface HouseholdSummary {
  id: string;
  name: string;
  role: 'owner' | 'editor' | 'viewer';
  reminderLeadDays: number;
  reminderHour: number;
}

export interface Session {
  user: User;
  households: HouseholdSummary[];
}

export interface HealthFlag {
  id: string;
  petId: string;
  kind: 'allergy' | 'chronic_condition' | 'drug_intolerance';
  label: string;
  severity: 'low' | 'medium' | 'high';
  notes: string | null;
}

export interface Pet {
  id: string;
  householdId: string;
  name: string;
  species: 'dog' | 'cat' | 'other';
  speciesLabel: string | null;
  breed: string | null;
  sex: 'male' | 'female' | 'unknown';
  colour: string | null;
  birthDate: string | null;
  birthPrecision: 'exact' | 'month' | 'year' | 'approximate';
  acquiredOn: string | null;
  microchip: string | null;
  microchipImplantedOn: string | null;
  tattoo: string | null;
  pedigreeNumber: string | null;
  registrationNumber: string | null;
  neutered: boolean;
  neuteredOn: string | null;
  avatarFileId: string | null;
  notes: string | null;
  archivedAt: string | null;
  deceasedOn: string | null;
  age: Age | null;
  nextBirthday: string | null;
  flags: HealthFlag[];
}

export interface StoredFileSummary {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  hasThumbnail: boolean;
}

export interface PetDocument {
  id: string;
  petId: string;
  kind: string;
  title: string;
  issuedOn: string | null;
  expiresOn: string | null;
  fileId: string | null;
  notes: string | null;
}

export interface Vaccination {
  id: string;
  petId: string;
  vaccineCode: string | null;
  productName: string | null;
  batchNumber: string | null;
  administeredOn: string;
  nextDueOn: string | null;
  notes: string | null;
}

export interface ParasiteTreatment {
  id: string;
  petId: string;
  target: 'internal' | 'external' | 'both';
  productName: string | null;
  administeredOn: string;
  nextDueOn: string | null;
  notes: string | null;
}

export interface Visit {
  id: string;
  petId: string;
  visitedOn: string;
  reason: string;
  findings: string | null;
  treatment: string | null;
  cost: number | null;
  currency: string | null;
  notes: string | null;
}

export interface MedicationDose {
  id: string;
  courseId: string;
  dueOn: string;
  sequence: number;
  takenAt: string | null;
}

export interface MedicationCourse {
  id: string;
  petId: string;
  name: string;
  dose: string | null;
  timesPerDay: number;
  startsOn: string;
  endsOn: string | null;
  notes: string | null;
  doses: MedicationDose[];
  progress: { total: number; taken: number; missed: number; remaining: number };
}

export interface Reading {
  id: string;
  metric: Metric;
  measuredOn: string;
  value: number;
  notes: string | null;
}

export interface MeasurementSeries {
  metric: Metric;
  readings: Reading[];
  target: { value: number | null; min: number | null; max: number | null } | null;
  change: { absolute: number; relative: number | null; days: number } | null;
  trend: { direction: 'rising' | 'falling' | 'stable'; changeOverWindow: number } | null;
  position: 'below' | 'within' | 'above' | null;
}

export interface SizeCardEntry {
  metric: Metric;
  value: number;
  measuredOn: string;
  ageInDays: number;
}

export interface Contact {
  id: string;
  householdId: string;
  kind: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  favourite: boolean;
  notes: string | null;
}

export interface CareEvent {
  id: string;
  petId: string;
  type: string;
  title: string;
  scheduledOn: string;
  startTime: string | null;
  durationMinutes: number | null;
  contactId: string | null;
  recurrence: RecurrenceRule | null;
  lastCompletedOn: string | null;
  location: string | null;
  notes: string | null;
}

export interface Passkey {
  id: string;
  deviceLabel: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface VaccineOption {
  code: string;
  core: boolean;
  covers: string[];
  guidance: string;
}

export type { AgendaItem };
