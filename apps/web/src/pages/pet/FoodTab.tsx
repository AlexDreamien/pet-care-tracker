import type { FoodForecast } from '@pet-care-tracker/core';
import { type ReactNode, useState } from 'react';
import { api } from '../../api/client';
import type { Pet } from '../../api/types';
import { useAction, useResource, useToday } from '../../app/hooks';
import { useSession, useUser } from '../../app/session';
import { formatDate, formatRelativeDays } from '../../lib/format';
import type { Locale } from '../../lib/i18n';
import { BowlIcon, CheckIcon, PlusIcon } from '../../ui/icons';
import { Badge, Button, Card, Empty, Field, Input, SectionTitle, Sheet } from '../../ui/primitives';

interface FoodBag {
  id: string;
  brand: string | null;
  name: string;
  weightGrams: number;
  dailyGrams: number;
  openedOn: string;
  finishedOn: string | null;
  price: number | null;
  forecast: FoodForecast | null;
}

/** Bags are sold in kilograms; grams are a storage detail nobody wants to read. */
function kilograms(grams: number, locale: Locale, unit: string): string {
  const value = new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
    maximumFractionDigits: 1,
  }).format(grams / 1000);
  return `${value} ${unit}`;
}

export function FoodTab({ pet }: { pet: Pet }): ReactNode {
  const { t, locale, canWrite } = useSession();
  const user = useUser();
  const today = useToday(user.timeZone);
  const bags = useResource<{ bags: FoodBag[] }>(`/pets/${pet.id}/food`);
  const [adding, setAdding] = useState(false);

  const open = bags.data?.bags.filter((bag) => bag.finishedOn === null) ?? [];
  const past = bags.data?.bags.filter((bag) => bag.finishedOn !== null) ?? [];

  return (
    <div className="space-y-5">
      {canWrite && (
        <Button full onClick={() => setAdding(true)} icon={<PlusIcon />}>
          {t('food.new')}
        </Button>
      )}

      {open.length === 0 && past.length === 0 && !bags.loading && (
        <Empty icon={<BowlIcon />}>{t('state.empty')}</Empty>
      )}

      {open.length > 0 && (
        <section>
          <SectionTitle>{t('food.open')}</SectionTitle>
          <div className="space-y-3">
            {open.map((bag) => (
              <OpenBag key={bag.id} bag={bag} today={today} onChanged={bags.reload} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <SectionTitle>{t('food.history')}</SectionTitle>
          <Card>
            <ul>
              {past.map((bag) => (
                <li
                  key={bag.id}
                  className="flex items-center justify-between gap-3 border-b border-line py-2 text-sm last:border-0"
                >
                  <span className="min-w-0 truncate">
                    {bag.brand ? `${bag.brand} · ` : ''}
                    {bag.name}
                  </span>
                  <span className="text-muted">
                    {formatDate(bag.openedOn, locale)} — {formatDate(bag.finishedOn!, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <AddBagSheet
        pet={pet}
        open={adding}
        today={today}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          bags.reload();
        }}
      />
    </div>
  );
}

function OpenBag({
  bag,
  today,
  onChanged,
}: {
  bag: FoodBag;
  today: string;
  onChanged: () => void;
}): ReactNode {
  const { t, locale, canWrite } = useSession();
  const forecast = bag.forecast;

  const finish = useAction(async () => {
    await api.post(`/food/${bag.id}/finish`);
    onChanged();
  });

  const remainingShare = forecast
    ? Math.max(0, Math.min(1, forecast.remainingGrams / bag.weightGrams))
    : 0;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{bag.name}</p>
          <p className="truncate text-sm text-muted">
            {bag.brand ? `${bag.brand} · ` : ''}
            {kilograms(bag.weightGrams, locale, t('food.kg'))} · {bag.dailyGrams} {t('food.perDay')}
          </p>
        </div>
        {forecast && (
          <Badge tone={forecast.daysLeft <= 5 ? 'alarm' : 'neutral'}>
            {formatRelativeDays(forecast.emptyOn, today, locale)}
          </Badge>
        )}
      </div>

      {forecast && (
        <>
          {/* A bar rather than a chart: one number over time is not worth axes. */}
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-line"
            role="img"
            aria-label={`${t('food.remaining')}: ${kilograms(forecast.remainingGrams, locale, t('food.kg'))}`}
          >
            <div
              className={`h-full rounded-full ${forecast.daysLeft <= 5 ? 'bg-alarm' : 'bg-brand'}`}
              style={{ width: `${remainingShare * 100}%` }}
            />
          </div>

          <p className="mt-2 text-sm text-muted">
            {t('food.remaining')}: {kilograms(forecast.remainingGrams, locale, t('food.kg'))} ·{' '}
            {t('food.emptyOn')} {formatDate(forecast.emptyOn, locale, today)}
          </p>
          <p className="mt-1 text-xs text-muted">{t('food.estimate')}</p>
        </>
      )}

      {canWrite && (
        <Button
          tone="quiet"
          className="mt-3"
          disabled={finish.pending}
          onClick={() => void finish.run()}
          icon={<CheckIcon />}
        >
          {t('food.finish')}
        </Button>
      )}
    </Card>
  );
}

function AddBagSheet({
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
  const [brand, setBrand] = useState('');
  const [name, setName] = useState('');
  const [weightKg, setWeightKg] = useState('12');
  const [dailyGrams, setDailyGrams] = useState('400');
  const [openedOn, setOpenedOn] = useState(today);
  const [price, setPrice] = useState('');

  const save = useAction(async () => {
    await api.post(`/pets/${pet.id}/food`, {
      brand: brand || undefined,
      name,
      // Bags are sold in kilograms and stored in grams, so the conversion happens here.
      weightGrams: Math.round(Number(weightKg.replace(',', '.')) * 1000),
      dailyGrams: Number(dailyGrams.replace(',', '.')),
      openedOn,
      price: price.trim() === '' ? undefined : Number(price.replace(',', '.')),
    });
    setName('');
    setPrice('');
    onSaved();
  });

  return (
    <Sheet title={t('food.new')} open={open} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('food.brand')}>
          <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
        </Field>

        <Field label={t('food.name')} error={save.error?.fieldError('name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('food.weightKg')} error={save.error?.fieldError('weightGrams')}>
            <Input
              inputMode="decimal"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
            />
          </Field>
          <Field label={t('food.daily')} error={save.error?.fieldError('dailyGrams')}>
            <Input
              inputMode="decimal"
              value={dailyGrams}
              onChange={(e) => setDailyGrams(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('food.openedOn')}>
            <Input type="date" value={openedOn} onChange={(e) => setOpenedOn(e.target.value)} />
          </Field>
          <Field label={t('food.price')}>
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
        </div>

        <Button
          full
          disabled={save.pending || name.trim() === ''}
          onClick={() => void save.run()}
          icon={<CheckIcon />}
        >
          {t('action.save')}
        </Button>
      </div>
    </Sheet>
  );
}
