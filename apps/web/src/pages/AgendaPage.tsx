import { addMonths } from '@pet-care-tracker/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AgendaItem } from '../api/types';
import { useResource, useToday } from '../app/hooks';
import { useSession, useUser } from '../app/session';
import { formatDate, formatRelativeDays, splitAgenda } from '../lib/format';
import type { MessageKey } from '../lib/i18n';
import {
  BowlIcon,
  CakeIcon,
  DocumentIcon,
  PawIcon,
  PillIcon,
  ShieldIcon,
  SyringeIcon,
} from '../ui/icons';
import { Badge, Button, Card, Empty, SectionTitle } from '../ui/primitives';
import { PasskeyOffer } from './PasskeyOffer';

const SOURCE_ICON: Record<string, (props: { className?: string }) => ReactNode> = {
  vaccination: SyringeIcon,
  parasite_treatment: ShieldIcon,
  document_expiry: DocumentIcon,
  medication_dose: PillIcon,
  food_low: BowlIcon,
  birthday: CakeIcon,
  event: PawIcon,
};

/**
 * Some titles are the owner's own words and some are keys the server sends for the
 * interface to translate. Showing `parasite.internal` to a person would be a bug they
 * could see, so the untranslatable cases are named explicitly rather than guessed at.
 */
function itemLabel(item: AgendaItem, t: (key: MessageKey) => string): string {
  switch (item.source) {
    case 'event':
    case 'document_expiry':
    case 'medication_dose':
    case 'food_low':
      return item.title;
    case 'birthday':
      return t('agenda.source.birthday');
    case 'parasite_treatment':
      return t(item.title as MessageKey);
    case 'vaccination': {
      const translated = t(`vaccine.${item.title}` as MessageKey);
      // A vaccine outside the catalogue keeps whatever the owner typed.
      return translated.startsWith('vaccine.') ? item.title : translated;
    }
    default:
      return item.title;
  }
}

function Row({ item, today }: { item: AgendaItem; today: string }): ReactNode {
  const { t, locale } = useSession();
  const late = item.date < today;
  const Glyph = SOURCE_ICON[item.source] ?? PawIcon;

  return (
    <li className="flex items-center gap-3 border-b border-line py-3 last:border-0">
      <Glyph className={`size-5 shrink-0 ${late ? 'text-alarm' : 'text-muted'}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{itemLabel(item, t)}</p>
        <p className="truncate text-sm text-muted">
          <Link to={`/pets/${item.petId}`} className="underline-offset-2 hover:underline">
            {item.petName}
          </Link>
          {' · '}
          {formatDate(item.date, locale, today)}
        </p>
      </div>
      <Badge tone={late ? 'alarm' : 'neutral'}>
        {formatRelativeDays(item.date, today, locale)}
      </Badge>
    </li>
  );
}

export function AgendaPage(): ReactNode {
  const { t } = useSession();
  const user = useUser();
  const today = useToday(user.timeZone);

  // Three months ahead is what fits on a screen worth scrolling; the calendar feed carries
  // the full year for anything further out.
  const to = addMonths(today, 3);
  const agenda = useResource<{ items: AgendaItem[] }>(`/agenda?from=${today}&to=${to}`);

  const sections = splitAgenda(agenda.data?.items ?? [], today);
  const empty =
    !agenda.loading &&
    sections.overdue.length === 0 &&
    sections.today.length === 0 &&
    sections.upcoming.length === 0;

  return (
    <>
      <PasskeyOffer />

      <h1 className="mb-4 text-2xl font-semibold">{t('nav.agenda')}</h1>

      {agenda.loading && <p className="text-muted">{t('state.loading')}</p>}

      {agenda.error && !agenda.data && (
        <Card>
          <p className="mb-3 text-sm text-muted">{t('state.error')}</p>
          <Button tone="quiet" onClick={agenda.reload}>
            {t('action.retry')}
          </Button>
        </Card>
      )}

      {empty && <Empty>{t('agenda.nothing')}</Empty>}

      <div className="space-y-5">
        {sections.overdue.length > 0 && (
          <section>
            <SectionTitle>{t('agenda.overdue')}</SectionTitle>
            <Card className="border-alarm/40">
              <ul>
                {sections.overdue.map((item) => (
                  <Row key={item.key} item={item} today={today} />
                ))}
              </ul>
            </Card>
          </section>
        )}

        {sections.today.length > 0 && (
          <section>
            <SectionTitle>{t('agenda.today')}</SectionTitle>
            <Card>
              <ul>
                {sections.today.map((item) => (
                  <Row key={item.key} item={item} today={today} />
                ))}
              </ul>
            </Card>
          </section>
        )}

        {sections.upcoming.length > 0 && (
          <section>
            <SectionTitle>{t('agenda.upcoming')}</SectionTitle>
            <Card>
              <ul>
                {sections.upcoming.map((item) => (
                  <Row key={item.key} item={item} today={today} />
                ))}
              </ul>
            </Card>
          </section>
        )}
      </div>
    </>
  );
}
