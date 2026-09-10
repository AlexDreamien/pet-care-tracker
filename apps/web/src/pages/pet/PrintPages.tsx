import { formatMicrochip } from '@pet-care-tracker/core';
import { type ReactNode, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import type {
  MedicationCourse,
  ParasiteTreatment,
  Pet,
  Vaccination,
  Contact,
} from '../../api/types';
import { useResource, useToday } from '../../app/hooks';
import { useSession, useUser } from '../../app/session';
import { BackHome } from '../../components/BackHome';
import { QrCode } from '../../components/QrCode';
import { formatAge, formatDate } from '../../lib/format';
import type { MessageKey } from '../../lib/i18n';

/**
 * Two pages meant for paper.
 *
 * A print stylesheet rather than a PDF library: the browser's own "Save as PDF" produces a
 * correct file with the system's Cyrillic fonts already embedded, which a JavaScript PDF
 * writer would have to be taught to do and would get subtly wrong.
 */

/**
 * Opens the print dialog once the sheet is on screen.
 *
 * `?preview` suppresses it, which is how the screenshot tool photographs these pages —
 * and how anyone can look at the layout before committing paper to it.
 */
function usePrintOnLoad(ready: boolean): void {
  useEffect(() => {
    if (!ready) return;
    if (new URLSearchParams(window.location.search).has('preview')) return;
    // One frame, so the layout and the QR are painted before the dialog freezes the page.
    const id = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(id);
  }, [ready]);
}

/** The collar tag: a QR code, a name, a number. Nothing a finder does not need. */
export function TagPrintPage(): ReactNode {
  const { petId } = useParams<{ petId: string }>();
  const { t } = useSession();

  const pet = useResource<{ pet: Pet }>(petId ? `/pets/${petId}` : null);
  const tag = useResource<{ enabled: boolean; url: string | null; contactPhone: string | null }>(
    petId ? `/pets/${petId}/lost-tag` : null,
  );

  const ready = Boolean(pet.data && tag.data?.url);
  usePrintOnLoad(ready);

  if (!ready) return <p className="p-8 text-muted">{t('state.loading')}</p>;

  return (
    <div className="print-sheet mx-auto max-w-md p-8 text-center">
      {/* On screen only: the print stylesheet drops it, so it never lands on the tag. */}
      <BackHome className="text-left" />
      {/* Two copies: one for the collar, one for the carrier or the lead. */}
      {[0, 1].map((copy) => (
        <div key={copy} className="mb-10 rounded-2xl border-2 border-black p-5">
          <p className="text-xs tracking-widest uppercase">{t('found.title')}</p>
          <p className="mt-1 text-2xl font-bold">{pet.data!.pet.name}</p>
          <QrCode value={tag.data!.url as string} size={180} className="mx-auto my-3" />
          <p className="text-sm">{t('found.call')}</p>
          <p className="text-lg font-semibold">{tag.data!.contactPhone}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * The emergency card, for a consulting room.
 *
 * The opposite disclosure choice from the lost tag: this one is handed over by the owner,
 * in person, to someone treating the animal — so it carries the chip, the allergies and
 * what the animal is currently taking.
 */
export function CardPrintPage(): ReactNode {
  const { petId } = useParams<{ petId: string }>();
  const { t, locale } = useSession();
  const user = useUser();
  const today = useToday(user.timeZone);

  const pet = useResource<{ pet: Pet }>(petId ? `/pets/${petId}` : null);
  const vaccinations = useResource<{ vaccinations: Vaccination[] }>(
    petId ? `/pets/${petId}/vaccinations` : null,
  );
  const parasites = useResource<{ treatments: ParasiteTreatment[] }>(
    petId ? `/pets/${petId}/parasite-treatments` : null,
  );
  const medications = useResource<{ medications: MedicationCourse[] }>(
    petId ? `/pets/${petId}/medications` : null,
  );
  const contacts = useResource<{ contacts: Contact[] }>('/contacts');

  const ready = Boolean(pet.data && vaccinations.data && medications.data);
  usePrintOnLoad(ready);

  if (!ready) return <p className="p-8 text-muted">{t('state.loading')}</p>;

  const record = pet.data!.pet;
  const vet = contacts.data?.contacts.find(
    (contact) => contact.kind === 'vet' || contact.kind === 'clinic',
  );
  const ongoing = medications.data!.medications.filter(
    (course) => course.endsOn === null || course.endsOn >= today,
  );
  const latestVaccinations = vaccinations.data!.vaccinations.slice(0, 6);

  return (
    <div className="print-sheet mx-auto max-w-2xl p-8">
      <BackHome />
      <header className="mb-4 flex items-baseline justify-between border-b-2 border-black pb-2">
        <h1 className="text-2xl font-bold">{record.name}</h1>
        <p className="text-sm">{formatDate(today, locale)}</p>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <Row
          label={t('pet.species')}
          value={record.speciesLabel ?? t(`species.${record.species}` as MessageKey)}
        />
        <Row label={t('pet.breed')} value={record.breed} />
        <Row label={t('pet.sex')} value={t(`sex.${record.sex}` as MessageKey)} />
        <Row label="" value={record.age ? formatAge(record.age, locale) : null} />
        <Row
          label={t('pet.microchip')}
          value={record.microchip ? formatMicrochip(record.microchip) : null}
        />
        <Row label={t('pet.neutered')} value={record.neutered ? '✓' : null} />
      </dl>

      {/* The reason this sheet exists: what must be said before anything is administered. */}
      {record.flags.length > 0 && (
        <section className="mt-5 rounded-lg border-2 border-black p-3">
          <h2 className="text-sm font-bold tracking-wide uppercase">{t('medical.flags')}</h2>
          <ul className="mt-1">
            {record.flags.map((flag) => (
              <li key={flag.id} className="text-lg font-semibold">
                {t(`flag.${flag.kind}` as MessageKey)}: {flag.label}
                {flag.severity === 'high' ? ' (!)' : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {ongoing.length > 0 && (
        <Section title={t('medical.medications')}>
          {ongoing.map((course) => (
            <li key={course.id}>
              {course.name}
              {course.dose ? ` — ${course.dose}` : ''} · {course.timesPerDay}×
            </li>
          ))}
        </Section>
      )}

      {latestVaccinations.length > 0 && (
        <Section title={t('medical.vaccinations')}>
          {latestVaccinations.map((row) => (
            <li key={row.id}>
              {row.vaccineCode ? t(`vaccine.${row.vaccineCode}` as MessageKey) : row.productName}
              {' — '}
              {formatDate(row.administeredOn, locale)}
            </li>
          ))}
        </Section>
      )}

      {(parasites.data?.treatments.length ?? 0) > 0 && (
        <Section title={t('medical.parasites')}>
          {parasites.data!.treatments.slice(0, 3).map((row) => (
            <li key={row.id}>
              {t(`parasite.${row.target}` as MessageKey)} — {formatDate(row.administeredOn, locale)}
            </li>
          ))}
        </Section>
      )}

      {vet && (
        <Section title={t('contact.vet')}>
          <li>
            {vet.name}
            {vet.phone ? ` · ${vet.phone}` : ''}
          </li>
        </Section>
      )}

      <p className="mt-6 border-t border-black pt-2 text-xs">{t('medical.notAdvice')}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }): ReactNode {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex gap-2">
      {label && <dt className="font-medium">{label}:</dt>}
      <dd>{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="mt-4">
      <h2 className="text-sm font-bold tracking-wide uppercase">{title}</h2>
      <ul className="mt-1 text-sm">{children}</ul>
    </section>
  );
}
