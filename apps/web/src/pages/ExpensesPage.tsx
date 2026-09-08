import { addMonths, type ExpenseCategory, type ExpenseSummary } from '@pet-care-tracker/core';
import { type ReactNode, useState } from 'react';
import { api } from '../api/client';
import type { Pet } from '../api/types';
import { useAction, useResource, useToday } from '../app/hooks';
import { useSession, useUser } from '../app/session';
import { formatDate } from '../lib/format';
import type { MessageKey } from '../lib/i18n';
import { Button, Card, Empty, Field, Input, Select, SectionTitle, Sheet } from '../ui/primitives';

interface ExpenseEntry {
  id: string;
  petId: string | null;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  spentOn: string;
  source: 'expense' | 'visit' | 'food';
  note?: string;
}

const CATEGORIES: ExpenseCategory[] = [
  'food',
  'vet',
  'medication',
  'grooming',
  'accessories',
  'insurance',
  'training',
  'boarding',
  'other',
];

type Period = 'month' | 'quarter' | 'year';
const PERIOD_MONTHS: Record<Period, number> = { month: 1, quarter: 3, year: 12 };

function useMoney(currency: string, locale: string) {
  return (amount: number) =>
    new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
}

export function ExpensesPage(): ReactNode {
  const { t, locale, canWrite } = useSession();
  const user = useUser();
  const today = useToday(user.timeZone);

  const [period, setPeriod] = useState<Period>('year');
  const [adding, setAdding] = useState(false);

  const from = addMonths(today, -PERIOD_MONTHS[period]);
  const data = useResource<{ summary: ExpenseSummary; entries: ExpenseEntry[] }>(
    `/expenses?from=${from}&to=${today}`,
  );
  const pets = useResource<{ pets: Pet[] }>('/pets');

  const summary = data.data?.summary;
  const money = useMoney(summary?.currency ?? 'RUB', locale);
  const biggest = summary?.byCategory[0]?.total ?? 0;
  const busiestMonth = Math.max(0, ...(summary?.byMonth ?? []).map((row) => row.total));

  return (
    <>
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('nav.expenses')}</h1>
        {canWrite && <Button onClick={() => setAdding(true)}>{t('action.add')}</Button>}
      </header>

      {/* One filter row above everything it scopes. */}
      <div className="mb-4 flex gap-2">
        {(['month', 'quarter', 'year'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setPeriod(option)}
            className={`min-h-10 flex-1 rounded-xl px-3 text-sm ${
              period === option ? 'bg-brand text-white' : 'border border-line bg-surface text-muted'
            }`}
          >
            {t(`money.period.${option}` as MessageKey)}
          </button>
        ))}
      </div>

      {data.loading && <p className="text-muted">{t('state.loading')}</p>}

      {summary && (
        <div className="space-y-5">
          {/* The story is one number, so it is a number and not a chart. */}
          <Card className="text-center">
            <p className="text-sm text-muted">{t('money.total')}</p>
            <p className="mt-1 text-4xl font-semibold">{money(summary.total)}</p>
            <p className="mt-1 text-xs text-muted">
              {formatDate(from, locale)} — {formatDate(today, locale)}
            </p>
          </Card>

          {summary.byCategory.length === 0 && <Empty>{t('state.empty')}</Empty>}

          {summary.byCategory.length > 0 && (
            <section>
              <SectionTitle>{t('money.byCategory')}</SectionTitle>
              <Card>
                <ul className="space-y-2">
                  {summary.byCategory.map((row) => (
                    <li key={row.category}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span>{t(`category.${row.category}` as MessageKey)}</span>
                        <span className="font-medium tabular-nums">{money(row.total)}</span>
                      </div>
                      {/* One series, one colour: length already encodes the size. */}
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${biggest > 0 ? (row.total / biggest) * 100 : 0}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}

          {summary.byPet.length > 1 && (
            <section>
              <SectionTitle>{t('money.byPet')}</SectionTitle>
              <Card>
                <ul>
                  {summary.byPet.map((row) => (
                    <li
                      key={row.petId ?? 'shared'}
                      className="flex justify-between border-b border-line py-2 text-sm last:border-0"
                    >
                      <span>
                        {row.petId
                          ? (pets.data?.pets.find((pet) => pet.id === row.petId)?.name ?? '—')
                          : t('money.shared')}
                      </span>
                      <span className="tabular-nums">{money(row.total)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}

          {summary.excluded.length > 0 && (
            <Card className="border-calm/40">
              <p className="text-sm text-muted">{t('money.excluded')}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {summary.excluded.map((entry) => (
                  <li key={entry.id} className="flex justify-between">
                    <span>{formatDate(entry.spentOn, locale)}</span>
                    <span className="tabular-nums">
                      {entry.amount} {entry.currency}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {summary.byMonth.length > 1 && (
            <section>
              <SectionTitle>{t('money.byMonth')}</SectionTitle>
              <Card>
                <ul className="space-y-2">
                  {summary.byMonth.map((row) => (
                    <li key={row.month}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="tabular-nums">{row.month}</span>
                        <span className="font-medium tabular-nums">{money(row.total)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{
                            width: `${busiestMonth > 0 ? (row.total / busiestMonth) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}

          <section>
            {/* The table view: every figure the bars draw, readable as text. */}
            <SectionTitle>{t('money.entries')}</SectionTitle>
            <Card>
              <p className="mb-2 text-xs text-muted">{t('money.sourceHint')}</p>
              <ul>
                {data.data?.entries.map((entry) => (
                  <li
                    key={`${entry.source}-${entry.id}`}
                    className="flex items-center justify-between gap-3 border-b border-line py-2 text-sm last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate">
                        {entry.note ?? t(`category.${entry.category}` as MessageKey)}
                      </p>
                      <p className="text-xs text-muted">
                        {formatDate(entry.spentOn, locale, today)}
                        {entry.source === 'visit' ? ` · ${t('money.fromVisit')}` : ''}
                        {entry.source === 'food' ? ` · ${t('money.fromFood')}` : ''}
                      </p>
                    </div>
                    <span className="tabular-nums whitespace-nowrap">
                      {entry.currency === summary.currency
                        ? money(entry.amount)
                        : `${entry.amount} ${entry.currency}`}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        </div>
      )}

      <AddExpenseSheet
        open={adding}
        today={today}
        pets={pets.data?.pets ?? []}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          data.reload();
        }}
      />
    </>
  );
}

function AddExpenseSheet({
  open,
  today,
  pets,
  onClose,
  onSaved,
}: {
  open: boolean;
  today: string;
  pets: Pet[];
  onClose: () => void;
  onSaved: () => void;
}): ReactNode {
  const { t } = useSession();
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [amount, setAmount] = useState('');
  const [spentOn, setSpentOn] = useState(today);
  const [petId, setPetId] = useState('');
  const [note, setNote] = useState('');

  const save = useAction(async () => {
    await api.post('/expenses', {
      category,
      amount: Number(amount.replace(',', '.')),
      spentOn,
      petId: petId || undefined,
      note: note || undefined,
    });
    setAmount('');
    setNote('');
    onSaved();
  });

  return (
    <Sheet title={t('money.new')} open={open} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('money.category')}>
          <Select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {t(`category.${value}` as MessageKey)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('money.amount')} error={save.error?.fieldError('amount')}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>

        <Field label={t('money.spentOn')}>
          <Input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
        </Field>

        <Field label={t('nav.pets')}>
          <Select value={petId} onChange={(e) => setPetId(e.target.value)}>
            <option value="">{t('money.shared')}</option>
            {pets.map((pet) => (
              <option key={pet.id} value={pet.id}>
                {pet.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('money.note')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <Button
          full
          disabled={save.pending || amount.trim() === ''}
          onClick={() => void save.run()}
        >
          {t('action.save')}
        </Button>
      </div>
    </Sheet>
  );
}
