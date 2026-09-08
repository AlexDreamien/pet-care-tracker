import { type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useResource } from '../app/hooks';
import { type Locale, type MessageKey, translator } from '../lib/i18n';

interface FoundPet {
  name: string;
  species: 'dog' | 'cat' | 'other';
  speciesLabel: string | null;
  breed: string | null;
  colour: string | null;
  sex: 'male' | 'female' | 'unknown';
  photoUrl: string | null;
  contactName: string | null;
  contactPhone: string | null;
  note: string | null;
}

/**
 * What someone sees after scanning the tag on a collar.
 *
 * There is no session here and there never will be, so the language comes from the
 * stranger's own browser rather than from the owner's settings — they are the ones who
 * have to read it.
 *
 * The page is deliberately one screen with one action: call the number. Anyone standing in
 * the street holding an anxious animal should not have to navigate anything.
 */
export function FoundPage(): ReactNode {
  const { token } = useParams<{ token: string }>();
  const locale: Locale = navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  const t = translator(locale);

  const pet = useResource<FoundPet>(token ? `/found/${token}` : null);

  if (pet.loading) {
    return (
      <main className="grid min-h-dvh place-items-center text-muted">{t('state.loading')}</main>
    );
  }

  if (!pet.data) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center">
        <p className="text-muted">{t('found.unknown')}</p>
      </main>
    );
  }

  const found = pet.data;
  const description = [
    found.speciesLabel ?? t(`species.${found.species}` as MessageKey),
    found.breed,
    found.colour,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 py-8">
      <p className="text-center text-sm tracking-wide text-muted uppercase">{t('found.title')}</p>
      <h1 className="mt-1 text-center text-3xl font-semibold">{found.name}</h1>
      {description && <p className="mt-1 text-center text-muted">{description}</p>}

      {found.photoUrl && (
        <img
          src={found.photoUrl}
          alt={found.name}
          className="mx-auto mt-5 size-44 rounded-full object-cover"
        />
      )}

      {found.note && (
        <p className="mt-6 rounded-(--radius-card) border border-alarm/40 bg-alarm-soft px-4 py-3 text-center text-alarm">
          {found.note}
        </p>
      )}

      {found.contactPhone && (
        <a
          href={`tel:${found.contactPhone.replace(/[^+\d]/g, '')}`}
          className="mt-6 flex min-h-14 items-center justify-center rounded-(--radius-card) bg-brand px-6 text-lg font-semibold text-white"
        >
          {t('found.call')}
        </a>
      )}

      {found.contactPhone && (
        <p className="mt-2 text-center text-lg tracking-wide select-all">
          {found.contactPhone}
          {/* The name goes beside the number, not inside the button: "Позвонить Алек" is
              the wrong case in Russian and there is no reason to inflect a name here. */}
          {found.contactName ? ` · ${found.contactName}` : ''}
        </p>
      )}

      <p className="mt-8 text-center text-sm text-muted">{t('found.thanks')}</p>
    </main>
  );
}
