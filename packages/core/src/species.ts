export type Species = 'dog' | 'cat' | 'other';

/**
 * The species the built-in schedules cover. Anything else keeps every date by hand —
 * inventing a vaccination interval for a species nobody wrote guidance for would be worse
 * than offering nothing.
 */
export const SPECIES_WITH_SCHEDULES = ['dog', 'cat'] as const satisfies readonly Species[];

export function hasBuiltInSchedules(species: Species): boolean {
  return (SPECIES_WITH_SCHEDULES as readonly Species[]).includes(species);
}
