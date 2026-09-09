import type { FoodForecast } from '@pet-care-tracker/core';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useResource } from '../app/hooks';
import { formatDate, formatRelativeDays } from '../lib/format';
import { type Locale, type MessageKey, translator } from '../lib/i18n';

interface SitterPet {
  id: string;
  name: string;
  species: 'dog' | 'cat' | 'other';
  speciesLabel: string | null;
  breed: string | null;
  photoUrl: string | null;
  flags: { kind: string; label: string; severity: string }[];
  food: {
    brand: string | null;
    name: string;
    dailyGrams: number;
    forecast: FoodForecast;
  } | null;
  dosesToday: { course: string; dose: string | null; sequence: number; taken: boolean }[];
  upcoming: { type: string; title: string; scheduledOn: string; startTime: string | null }[];
  notes: string | null;
}

interface SitterView {
  label: string;
  expiresOn: string;
  today: string;
  vet: { name: string; phone: string | null; address: string | null } | null;
  pets: SitterPet[];
}

/**
 * The page whoever is looking after the animal opens.
 *
 * No session, no account, and nothing to press by mistake — it is a set of notes. The order
 * is the order the questions get asked: what must it never have, what does it eat, what do
 * I give today, what is coming, who do I ring.
 *
 * As on the lost page, the language comes from the reader's browser: they are the one who
 * has to understand it.
 */
export function SitterPage(): ReactNode {
  const { token } = useParams<{ token: string }>();
  const locale: Locale = navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  const t = translator(locale);

  const view = useResource<SitterView>(token ? `/sitter/${token}` : null);

  if (view.loading) {
    return (
      <main className="grid min-h-dvh place-items-center text-muted">{t('state.loading')}</main>
    );
  }

  if (!view.data) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center">
        <p className="text-muted">{t('care.expired')}</p>
      </main>
    );
  }

  const { label, expiresOn, today, vet, pets } = view.data;

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 py-8">
      <header className="mb-6 text-center">
        <p className="text-sm tracking-wide text-muted uppercase">{t('care.title')}</p>
        <h1 className="mt-1 text-2xl font-semibold">{label}</h1>
        <p className="mt-1 text-sm text-muted">
          {t('care.until')} {formatDate(expiresOn, locale)}
        </p>
      </header>

      <div className="space-y-8">
        {pets.map((pet) => (
          <section key={pet.id}>
            <div className="flex items-center gap-3">
              {pet.photoUrl && (
                <img src={pet.photoUrl} alt="" className="size-14 rounded-full object-cover" />
              )}
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold">{pet.name}</h2>
                <p className="truncate text-sm text-muted">
                  {[pet.speciesLabel ?? t(`species.${pet.species}` as MessageKey), pet.breed]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>

            {/* First, and loud: what the animal must never be offered. */}
            {pet.flags.length > 0 && (
              <ul className="mt-3 space-y-1">
                {pet.flags.map((flag) => (
                  <li
                    key={flag.label}
                    className="rounded-(--radius-card) border border-alarm/40 bg-alarm-soft px-3 py-2 font-medium text-alarm"
                  >
                    {t(`flag.${flag.kind}` as MessageKey)}: {flag.label}
                  </li>
                ))}
              </ul>
            )}

            {pet.food && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">
                  {t('care.eat')}
                </h3>
                <p className="mt-1">
                  {pet.food.brand ? `${pet.food.brand} · ` : ''}
                  {pet.food.name}
                </p>
                <p className="text-lg font-semibold">
                  {pet.food.dailyGrams} {t('food.grams')} {t('care.perDay')}
                </p>
              </div>
            )}

            <div className="mt-4">
              <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">
                {t('care.today')}
              </h3>
              {pet.dosesToday.length === 0 ? (
                <p className="mt-1 text-sm text-muted">{t('care.nothingToday')}</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {pet.dosesToday.map((dose) => (
                    <li
                      key={`${dose.course}-${dose.sequence}`}
                      className="flex items-baseline justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2"
                    >
                      <span>
                        {dose.course}
                        {dose.dose ? ` — ${dose.dose}` : ''}
                        {/* Two identical rows would look like a duplicate, not two doses. */}
                        <span className="ml-2 text-sm text-muted">
                          {t('care.dose')} {dose.sequence}
                        </span>
                      </span>
                      {dose.taken && <span className="text-sm text-muted">{t('care.taken')}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {pet.upcoming.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">
                  {t('care.upcoming')}
                </h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {pet.upcoming.map((event) => (
                    <li
                      key={`${event.title}-${event.scheduledOn}`}
                      className="flex justify-between gap-3"
                    >
                      <span>{event.title}</span>
                      <span className="text-muted">
                        {formatRelativeDays(event.scheduledOn, today, locale)}
                        {event.startTime ? `, ${event.startTime}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {pet.notes && (
              <p className="mt-4 text-sm whitespace-pre-wrap text-muted">{pet.notes}</p>
            )}
          </section>
        ))}
      </div>

      {vet && (
        <section className="mt-8 rounded-(--radius-card) border border-line bg-surface p-4">
          <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">
            {t('care.vet')}
          </h3>
          <p className="mt-1 font-medium">{vet.name}</p>
          {vet.address && <p className="text-sm text-muted">{vet.address}</p>}
          {vet.phone && (
            <a
              href={`tel:${vet.phone.replace(/[^+\d]/g, '')}`}
              className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-brand px-4 font-semibold text-white"
            >
              {vet.phone}
            </a>
          )}
        </section>
      )}

      <p className="mt-6 text-center text-xs text-muted">{t('care.readOnly')}</p>
    </main>
  );
}
