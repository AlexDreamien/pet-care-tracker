/**
 * Laboratory results over time.
 *
 * The reference range travels with each reading rather than living in a table here. Ranges
 * differ between laboratories, between species and between the machines a clinic happens to
 * own, and they are printed on the form the owner is holding. Inventing one would be exactly
 * the kind of medical content this application has no business producing.
 */

import { compareDates, type IsoDate } from './date';

export interface LabReading {
  id: string;
  analyte: string;
  value: number;
  unit: string;
  measuredOn: IsoDate;
  /** As printed on the laboratory's own form; either bound may be absent. */
  referenceMin?: number | undefined;
  referenceMax?: number | undefined;
}

export type LabPosition = 'below' | 'within' | 'above';

/**
 * Where a value sits against the range printed beside it — nothing more.
 *
 * "Below the reference range" is a fact about two numbers. What it means about the animal is
 * a conversation with a vet, and the interface says so.
 */
export function classifyLabValue(reading: LabReading): LabPosition | null {
  if (reading.referenceMin === undefined && reading.referenceMax === undefined) return null;
  if (reading.referenceMin !== undefined && reading.value < reading.referenceMin) return 'below';
  if (reading.referenceMax !== undefined && reading.value > reading.referenceMax) return 'above';
  return 'within';
}

export interface LabSeries {
  analyte: string;
  /** The unit of the most recent reading; earlier ones may differ and are flagged. */
  unit: string;
  readings: LabReading[];
  /** The most recent reading's range, for drawing a band. */
  reference: { min?: number | undefined; max?: number | undefined } | null;
  position: LabPosition | null;
  /**
   * True when the readings are not all in the same unit. Charting mmol/L against mg/dL as
   * one line would draw a cliff that is not in the animal.
   */
  mixedUnits: boolean;
}

/** Groups readings into one series per analyte, oldest first inside each. */
export function groupLabReadings(readings: readonly LabReading[]): LabSeries[] {
  const byAnalyte = new Map<string, LabReading[]>();

  for (const reading of readings) {
    const bucket = byAnalyte.get(reading.analyte) ?? [];
    bucket.push(reading);
    byAnalyte.set(reading.analyte, bucket);
  }

  return [...byAnalyte.entries()]
    .map(([analyte, group]) => {
      const sorted = [...group].sort((a, b) => compareDates(a.measuredOn, b.measuredOn));
      const latest = sorted[sorted.length - 1] as LabReading;
      const units = new Set(sorted.map((reading) => reading.unit));

      const reference =
        latest.referenceMin === undefined && latest.referenceMax === undefined
          ? null
          : { min: latest.referenceMin, max: latest.referenceMax };

      return {
        analyte,
        unit: latest.unit,
        readings: sorted,
        reference,
        position: classifyLabValue(latest),
        mixedUnits: units.size > 1,
      };
    })
    .sort((a, b) => a.analyte.localeCompare(b.analyte));
}

/**
 * Analyte names offered as suggestions, so a chart is not split in two by "ALT" and "АЛТ".
 *
 * Suggestions only: anything a laboratory prints can be typed instead, and no reference
 * range is attached to any of them.
 */
export const COMMON_ANALYTES: readonly string[] = [
  'ALT',
  'AST',
  'ALP',
  'Creatinine',
  'Urea',
  'Glucose',
  'Total protein',
  'Albumin',
  'Bilirubin',
  'Haematocrit',
  'Haemoglobin',
  'Leukocytes',
  'Platelets',
  'T4',
];
