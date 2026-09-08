import type { ParasiteProtocol, Species, VaccineDefinition } from '@pet-care-tracker/core';
import { CAT_VACCINES, DOG_VACCINES } from './vaccines';
import { CAT_PARASITE_PROTOCOLS, DOG_PARASITE_PROTOCOLS } from './parasites';

export * from './vaccines';
export * from './parasites';
export * from './bcs';

/**
 * The defaults for a species. A species without published guidance gets empty lists rather
 * than a borrowed schedule — the owner enters the dates their veterinarian gave them.
 */
export function vaccinesFor(species: Species): readonly VaccineDefinition[] {
  switch (species) {
    case 'dog':
      return DOG_VACCINES;
    case 'cat':
      return CAT_VACCINES;
    case 'other':
      return [];
  }
}

export function parasiteProtocolsFor(species: Species): readonly ParasiteProtocol[] {
  switch (species) {
    case 'dog':
      return DOG_PARASITE_PROTOCOLS;
    case 'cat':
      return CAT_PARASITE_PROTOCOLS;
    case 'other':
      return [];
  }
}

export function findVaccine(species: Species, code: string): VaccineDefinition | null {
  return vaccinesFor(species).find((vaccine) => vaccine.code === code) ?? null;
}

export function findParasiteProtocol(species: Species, code: string): ParasiteProtocol | null {
  return parasiteProtocolsFor(species).find((protocol) => protocol.code === code) ?? null;
}
