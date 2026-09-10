import type { LabSeries } from '@pet-care-tracker/core';
import { type ReactNode, useState } from 'react';
import { api } from '../../api/client';
import type { Pet } from '../../api/types';
import { useAction, useResource, useToday } from '../../app/hooks';
import { useSession, useUser } from '../../app/session';
import { ValueChart } from '../../components/MeasurementChart';
import { formatDate } from '../../lib/format';
import type { MessageKey } from '../../lib/i18n';
import { CheckIcon, FlaskIcon, PlusIcon, TrashIcon } from '../../ui/icons';
import { Badge, Button, Card, Empty, Field, Input, SectionTitle, Sheet } from '../../ui/primitives';

/**
 * Laboratory results.
 *
 * The band on each chart is the range the laboratory printed, not one the application
 * decided. Where a form gave no range there is no band and no verdict — an empty chart is
 * more honest than an invented normal.
 */
export function LabTab({ pet }: { pet: Pet }): ReactNode {
  const { t, locale, canWrite } = useSession();
  const user = useUser();
  const today = useToday(user.timeZone);

  const labs = useResource<{ series: LabSeries[]; suggestions: string[] }>(`/pets/${pet.id}/labs`);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-6">
      {canWrite && (
        <Button full onClick={() => setAdding(true)} icon={<PlusIcon />}>
          {t('lab.add')}
        </Button>
      )}

      <p className="rounded-xl border border-line bg-surface px-3 py-2 text-xs text-muted">
        {t('lab.notAdvice')}
      </p>

      {(labs.data?.series.length ?? 0) === 0 && !labs.loading && (
        <Empty icon={<FlaskIcon />}>{t('state.empty')}</Empty>
      )}

      {labs.data?.series.map((series) => (
        <section key={series.analyte}>
          <SectionTitle>{series.analyte}</SectionTitle>
          <Card>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">{series.unit}</span>
              {series.position && (
                <Badge tone={series.position === 'within' ? 'brand' : 'alarm'}>
                  {t(`lab.${series.position}` as MessageKey)}
                </Badge>
              )}
              {series.reference && (
                <span className="text-xs text-muted">
                  {t('lab.reference')} {series.reference.min ?? '—'} … {series.reference.max ?? '—'}
                </span>
              )}
              {/* Two units on one line would draw a cliff that is not in the animal. */}
              {series.mixedUnits && <Badge tone="alarm">{t('lab.mixedUnits')}</Badge>}
            </div>

            {!series.mixedUnits && (
              <ValueChart
                readings={series.readings}
                target={
                  series.reference
                    ? { min: series.reference.min ?? null, max: series.reference.max ?? null }
                    : null
                }
                format={(value) =>
                  `${new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
                    maximumFractionDigits: 2,
                  }).format(value)} ${series.unit}`
                }
              />
            )}

            {/* The table view: every value the chart draws, readable as text. */}
            <ul className="mt-3">
              {[...series.readings].reverse().map((reading) => (
                <LabRow key={reading.id} reading={reading} onDeleted={labs.reload} />
              ))}
            </ul>
          </Card>
        </section>
      ))}

      <AddLabSheet
        pet={pet}
        open={adding}
        today={today}
        suggestions={labs.data?.suggestions ?? []}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          labs.reload();
        }}
      />
    </div>
  );
}

function LabRow({
  reading,
  onDeleted,
}: {
  reading: LabSeries['readings'][number];
  onDeleted: () => void;
}): ReactNode {
  const { t, locale, canWrite } = useSession();

  const remove = useAction(async () => {
    await api.delete(`/labs/${reading.id}`);
    onDeleted();
  });

  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0">
      <span className="text-muted">{formatDate(reading.measuredOn, locale)}</span>
      <span className="flex items-center gap-2">
        <span className="tabular-nums">
          {reading.value} {reading.unit}
        </span>
        {canWrite && (
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-alarm-soft hover:text-alarm"
            onClick={() => void remove.run()}
            aria-label={t('action.delete')}
          >
            <TrashIcon className="size-4.5" />
          </button>
        )}
      </span>
    </li>
  );
}

function AddLabSheet({
  pet,
  open,
  today,
  suggestions,
  onClose,
  onSaved,
}: {
  pet: Pet;
  open: boolean;
  today: string;
  suggestions: string[];
  onClose: () => void;
  onSaved: () => void;
}): ReactNode {
  const { t } = useSession();
  const [analyte, setAnalyte] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [measuredOn, setMeasuredOn] = useState(today);
  const [referenceMin, setReferenceMin] = useState('');
  const [referenceMax, setReferenceMax] = useState('');

  const number = (raw: string) => (raw.trim() === '' ? undefined : Number(raw.replace(',', '.')));

  const save = useAction(async () => {
    await api.post(`/pets/${pet.id}/labs`, {
      analyte: analyte.trim(),
      value: Number(value.replace(',', '.')),
      unit: unit.trim(),
      measuredOn,
      referenceMin: number(referenceMin),
      referenceMax: number(referenceMax),
    });
    setValue('');
    onSaved();
  });

  return (
    <Sheet title={t('lab.add')} open={open} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('lab.analyte')} error={save.error?.fieldError('analyte')}>
          <Input
            value={analyte}
            onChange={(e) => setAnalyte(e.target.value)}
            list="analyte-suggestions"
            required
          />
          {/* Suggestions, not a closed list: a laboratory prints what it prints. */}
          <datalist id="analyte-suggestions">
            {suggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('lab.value')} error={save.error?.fieldError('value')}>
            <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field label={t('lab.unit')} error={save.error?.fieldError('unit')}>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} required />
          </Field>
        </div>

        <Field label={t('medical.administeredOn')}>
          <Input type="date" value={measuredOn} onChange={(e) => setMeasuredOn(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t('lab.referenceMin')}
            hint={t('lab.referenceHint')}
            error={save.error?.fieldError('referenceMin')}
          >
            <Input
              inputMode="decimal"
              value={referenceMin}
              onChange={(e) => setReferenceMin(e.target.value)}
            />
          </Field>
          <Field label={t('lab.referenceMax')}>
            <Input
              inputMode="decimal"
              value={referenceMax}
              onChange={(e) => setReferenceMax(e.target.value)}
            />
          </Field>
        </div>

        <Button
          full
          disabled={
            save.pending || analyte.trim() === '' || unit.trim() === '' || value.trim() === ''
          }
          onClick={() => void save.run()}
          icon={<CheckIcon />}
        >
          {t('action.save')}
        </Button>
      </div>
    </Sheet>
  );
}
