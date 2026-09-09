import { fromDisplay, METRICS, type Metric } from '@pet-care-tracker/core';
import { type ReactNode, useState } from 'react';
import { api } from '../../api/client';
import type { MeasurementSeries, Pet, SizeCardEntry } from '../../api/types';
import { useAction, useResource, useToday } from '../../app/hooks';
import { useSession, useUser } from '../../app/session';
import { ValueChart } from '../../components/MeasurementChart';
import { formatDate, formatMeasurement, isStale } from '../../lib/format';
import type { MessageKey } from '../../lib/i18n';
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Select,
  SectionTitle,
  Sheet,
} from '../../ui/primitives';

const ORDER: Metric[] = [
  'weight',
  'bcs',
  'chest_girth',
  'neck_girth',
  'back_length',
  'height_withers',
  'temperature',
];

export function MeasurementsTab({ pet }: { pet: Pet }): ReactNode {
  const { t, locale, canWrite } = useSession();
  const user = useUser();
  const today = useToday(user.timeZone);

  const series = useResource<{ series: MeasurementSeries[] }>(`/pets/${pet.id}/measurements`);
  const sizeCard = useResource<{ entries: SizeCardEntry[] }>(`/pets/${pet.id}/size-card`);
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState<Metric | null>(null);

  const ordered = [...(series.data?.series ?? [])].sort(
    (a, b) => ORDER.indexOf(a.metric) - ORDER.indexOf(b.metric),
  );

  return (
    <div className="space-y-6">
      {canWrite && (
        <Button full onClick={() => setAdding(true)}>
          {t('measure.add')}
        </Button>
      )}

      {(sizeCard.data?.entries.length ?? 0) > 0 && (
        <section>
          <SectionTitle>{t('measure.sizeCard')}</SectionTitle>
          <Card>
            <p className="mb-2 text-xs text-muted">{t('measure.sizeCardHint')}</p>
            <ul>
              {sizeCard.data?.entries.map((entry) => (
                <li
                  key={entry.metric}
                  className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0"
                >
                  <span className="text-sm">{t(`metric.${entry.metric}` as MessageKey)}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">
                      {formatMeasurement(entry.metric, entry.value, user.unitSystem, locale)}
                    </span>
                    {/* A girth measured on a growing animal months ago buys the wrong harness. */}
                    {isStale(entry.ageInDays) && <Badge tone="alarm">{t('measure.stale')}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {ordered.length === 0 && !series.loading && <Empty>{t('state.empty')}</Empty>}

      {ordered.map((entry) => (
        <section key={entry.metric}>
          <SectionTitle
            action={
              canWrite && (
                <Button tone="quiet" onClick={() => setTarget(entry.metric)}>
                  {t('measure.target')}
                </Button>
              )
            }
          >
            {t(`metric.${entry.metric}` as MessageKey)}
          </SectionTitle>

          <Card>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {entry.trend && (
                <Badge>{t(`measure.trend.${entry.trend.direction}` as MessageKey)}</Badge>
              )}
              {entry.position && (
                <Badge tone={entry.position === 'within' ? 'brand' : 'alarm'}>
                  {t(`measure.${entry.position}` as MessageKey)}
                </Badge>
              )}
              {entry.metric === 'bcs' && (
                <span className="text-xs text-muted">{t('measure.bcsScale')}</span>
              )}
            </div>

            <ValueChart
              readings={entry.readings}
              target={entry.target}
              format={(value) => formatMeasurement(entry.metric, value, user.unitSystem, locale)}
            />

            {/* The table view: every value the chart draws is also readable as text. */}
            <ul className="mt-3 max-h-52 overflow-y-auto">
              {[...entry.readings].reverse().map((reading) => (
                <ReadingRow
                  key={reading.id}
                  reading={reading}
                  metric={entry.metric}
                  onDeleted={() => {
                    series.reload();
                    sizeCard.reload();
                  }}
                />
              ))}
            </ul>
          </Card>
        </section>
      ))}

      <AddReadingSheet
        pet={pet}
        open={adding}
        today={today}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          series.reload();
          sizeCard.reload();
        }}
      />

      <TargetSheet
        pet={pet}
        metric={target}
        onClose={() => setTarget(null)}
        onSaved={() => {
          setTarget(null);
          series.reload();
        }}
      />
    </div>
  );
}

function ReadingRow({
  reading,
  metric,
  onDeleted,
}: {
  reading: { id: string; measuredOn: string; value: number };
  metric: Metric;
  onDeleted: () => void;
}): ReactNode {
  const { locale, canWrite } = useSession();
  const user = useUser();

  const remove = useAction(async () => {
    await api.delete(`/measurements/${reading.id}`);
    onDeleted();
  });

  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0">
      <span className="text-muted">{formatDate(reading.measuredOn, locale)}</span>
      <span className="flex items-center gap-2">
        <span className="tabular-nums">
          {formatMeasurement(metric, reading.value, user.unitSystem, locale)}
        </span>
        {canWrite && (
          <button
            type="button"
            className="px-2 text-muted hover:text-alarm"
            onClick={() => void remove.run()}
            aria-label="delete"
          >
            ✕
          </button>
        )}
      </span>
    </li>
  );
}

function AddReadingSheet({
  pet,
  open,
  today,
  onClose,
  onSaved,
}: {
  pet: Pet;
  open: boolean;
  today: string;
  onClose: () => void;
  onSaved: () => void;
}): ReactNode {
  const { t } = useSession();
  const user = useUser();
  const [metric, setMetric] = useState<Metric>('weight');
  const [measuredOn, setMeasuredOn] = useState(today);
  const [value, setValue] = useState('');

  const save = useAction(async () => {
    const typed = Number(value.replace(',', '.'));
    // Stored metric, always: a value typed in pounds becomes kilograms on the way in, using
    // the same conversion the core uses on the way out.
    const stored = fromDisplay(METRICS[metric].family, typed, user.unitSystem);

    await api.post(`/pets/${pet.id}/measurements`, { metric, measuredOn, value: stored });
    setValue('');
    onSaved();
  });

  return (
    <Sheet title={t('measure.add')} open={open} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('document.kind')}>
          <Select value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
            {ORDER.map((value) => (
              <option key={value} value={value}>
                {t(`metric.${value}` as MessageKey)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('medical.administeredOn')}>
          <Input type="date" value={measuredOn} onChange={(e) => setMeasuredOn(e.target.value)} />
        </Field>

        <Field
          label={t(`metric.${metric}` as MessageKey)}
          error={save.error?.fieldError('value')}
          hint={metric === 'bcs' ? t('measure.bcsScale') : undefined}
        >
          <Input
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </Field>

        <Button full disabled={save.pending || value.trim() === ''} onClick={() => void save.run()}>
          {t('action.save')}
        </Button>
      </div>
    </Sheet>
  );
}

function TargetSheet({
  pet,
  metric,
  onClose,
  onSaved,
}: {
  pet: Pet;
  metric: Metric | null;
  onClose: () => void;
  onSaved: () => void;
}): ReactNode {
  const { t } = useSession();
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');

  const save = useAction(async () => {
    await api.put(`/pets/${pet.id}/targets`, {
      metric,
      min: min.trim() === '' ? undefined : Number(min.replace(',', '.')),
      max: max.trim() === '' ? undefined : Number(max.replace(',', '.')),
    });
    onSaved();
  });

  return (
    <Sheet title={t('measure.target')} open={metric !== null} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('measure.targetMin')}>
            <Input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} />
          </Field>
          <Field label={t('measure.targetMax')} error={save.error?.fieldError('min')}>
            <Input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
          </Field>
        </div>

        <Button full disabled={save.pending} onClick={() => void save.run()}>
          {t('action.save')}
        </Button>
      </div>
    </Sheet>
  );
}
