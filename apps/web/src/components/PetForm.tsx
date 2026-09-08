import { type FormEvent, type ReactNode, useState } from 'react';
import type { ApiError } from '../api/client';
import type { Pet } from '../api/types';
import { useSession } from '../app/session';
import type { MessageKey } from '../lib/i18n';
import { Button, Field, Input, Select, TextArea } from '../ui/primitives';

export interface PetFormValues {
  name: string;
  species: 'dog' | 'cat' | 'other';
  speciesLabel: string;
  breed: string;
  sex: 'male' | 'female' | 'unknown';
  colour: string;
  birthDate: string;
  birthPrecision: 'exact' | 'month' | 'year' | 'approximate';
  acquiredOn: string;
  microchip: string;
  microchipImplantedOn: string;
  tattoo: string;
  pedigreeNumber: string;
  registrationNumber: string;
  neutered: boolean;
  neuteredOn: string;
  notes: string;
}

export function petToValues(pet: Pet | null): PetFormValues {
  return {
    name: pet?.name ?? '',
    species: pet?.species ?? 'dog',
    speciesLabel: pet?.speciesLabel ?? '',
    breed: pet?.breed ?? '',
    sex: pet?.sex ?? 'unknown',
    colour: pet?.colour ?? '',
    birthDate: pet?.birthDate ?? '',
    birthPrecision: pet?.birthPrecision ?? 'exact',
    acquiredOn: pet?.acquiredOn ?? '',
    microchip: pet?.microchip ?? '',
    microchipImplantedOn: pet?.microchipImplantedOn ?? '',
    tattoo: pet?.tattoo ?? '',
    pedigreeNumber: pet?.pedigreeNumber ?? '',
    registrationNumber: pet?.registrationNumber ?? '',
    neutered: pet?.neutered ?? false,
    neuteredOn: pet?.neuteredOn ?? '',
    notes: pet?.notes ?? '',
  };
}

/** Empty strings mean "not filled in" in a form and must not reach the API as values. */
export function valuesToPayload(values: PetFormValues): Record<string, unknown> {
  const optional = (value: string) => (value.trim() === '' ? undefined : value.trim());

  return {
    name: values.name.trim(),
    species: values.species,
    speciesLabel: optional(values.speciesLabel),
    breed: optional(values.breed),
    sex: values.sex,
    colour: optional(values.colour),
    birthDate: optional(values.birthDate),
    birthPrecision: values.birthPrecision,
    acquiredOn: optional(values.acquiredOn),
    microchip: optional(values.microchip),
    microchipImplantedOn: optional(values.microchipImplantedOn),
    tattoo: optional(values.tattoo),
    pedigreeNumber: optional(values.pedigreeNumber),
    registrationNumber: optional(values.registrationNumber),
    neutered: values.neutered,
    neuteredOn: values.neutered ? optional(values.neuteredOn) : undefined,
    notes: optional(values.notes),
  };
}

export function PetForm({
  initial,
  error,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: PetFormValues;
  error: ApiError | null;
  pending: boolean;
  onSubmit: (values: PetFormValues) => void;
  onCancel?: () => void;
}): ReactNode {
  const { t } = useSession();
  const [values, setValues] = useState(initial);

  const set = <K extends keyof PetFormValues>(key: K, value: PetFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(values);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={t('pet.name')} error={error?.fieldError('name')}>
        <Input value={values.name} onChange={(e) => set('name', e.target.value)} required />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('pet.species')}>
          <Select
            value={values.species}
            onChange={(e) => set('species', e.target.value as PetFormValues['species'])}
          >
            {(['dog', 'cat', 'other'] as const).map((species) => (
              <option key={species} value={species}>
                {t(`species.${species}` as MessageKey)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('pet.sex')}>
          <Select
            value={values.sex}
            onChange={(e) => set('sex', e.target.value as PetFormValues['sex'])}
          >
            {(['unknown', 'male', 'female'] as const).map((sex) => (
              <option key={sex} value={sex}>
                {t(`sex.${sex}` as MessageKey)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {values.species === 'other' && (
        <Field label={t('pet.speciesLabel')} error={error?.fieldError('speciesLabel')}>
          <Input
            value={values.speciesLabel}
            onChange={(e) => set('speciesLabel', e.target.value)}
            required
          />
        </Field>
      )}

      <Field label={t('pet.breed')}>
        <Input value={values.breed} onChange={(e) => set('breed', e.target.value)} />
      </Field>

      <Field label={t('pet.colour')}>
        <Input value={values.colour} onChange={(e) => set('colour', e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('pet.birthDate')} error={error?.fieldError('birthDate')}>
          <Input
            type="date"
            value={values.birthDate}
            onChange={(e) => set('birthDate', e.target.value)}
          />
        </Field>

        <Field label={t('pet.birthPrecision')}>
          <Select
            value={values.birthPrecision}
            onChange={(e) =>
              set('birthPrecision', e.target.value as PetFormValues['birthPrecision'])
            }
          >
            {(['exact', 'month', 'year', 'approximate'] as const).map((precision) => (
              <option key={precision} value={precision}>
                {t(`precision.${precision}` as MessageKey)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={t('pet.acquiredOn')}>
        <Input
          type="date"
          value={values.acquiredOn}
          onChange={(e) => set('acquiredOn', e.target.value)}
        />
      </Field>

      <Field
        label={t('pet.microchip')}
        error={error?.fieldError('microchip')}
        hint={t('pet.microchipHint')}
      >
        <Input
          value={values.microchip}
          onChange={(e) => set('microchip', e.target.value)}
          inputMode="numeric"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('pet.tattoo')}>
          <Input value={values.tattoo} onChange={(e) => set('tattoo', e.target.value)} />
        </Field>
        <Field label={t('pet.pedigreeNumber')}>
          <Input
            value={values.pedigreeNumber}
            onChange={(e) => set('pedigreeNumber', e.target.value)}
          />
        </Field>
      </div>

      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          className="size-5 accent-[var(--color-brand)]"
          checked={values.neutered}
          onChange={(e) => set('neutered', e.target.checked)}
        />
        <span>{t('pet.neutered')}</span>
      </label>

      {values.neutered && (
        <Field label={t('pet.neuteredOn')} error={error?.fieldError('neuteredOn')}>
          <Input
            type="date"
            value={values.neuteredOn}
            onChange={(e) => set('neuteredOn', e.target.value)}
          />
        </Field>
      )}

      <Field label={t('pet.notes')}>
        <TextArea value={values.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>

      {error && error.code === 'offline' && (
        <p className="rounded-xl bg-alarm-soft px-3 py-2 text-sm text-alarm">
          {t('state.offlineWrite')}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={pending} full={!onCancel}>
          {t('action.save')}
        </Button>
        {onCancel && (
          <Button type="button" tone="quiet" onClick={onCancel}>
            {t('action.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
