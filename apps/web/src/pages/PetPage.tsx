import type { ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import type { Pet } from '../api/types';
import { useResource } from '../app/hooks';
import { useSession } from '../app/session';
import { formatAge, formatDate } from '../lib/format';
import type { MessageKey } from '../lib/i18n';
import { Badge, Card } from '../ui/primitives';
import { PetAvatar } from './PetsPage';
import { DocumentsTab } from './pet/DocumentsTab';
import { MeasurementsTab } from './pet/MeasurementsTab';
import { MedicalTab } from './pet/MedicalTab';
import { ProfileTab } from './pet/ProfileTab';
import { ScheduleTab } from './pet/ScheduleTab';

const TABS: { path: string; key: MessageKey }[] = [
  { path: '', key: 'tab.profile' },
  { path: 'medical', key: 'tab.medical' },
  { path: 'measurements', key: 'tab.measurements' },
  { path: 'documents', key: 'tab.documents' },
  { path: 'schedule', key: 'tab.schedule' },
];

/**
 * Health flags sit in the header of every tab.
 *
 * An allergy is the piece of the record someone needs to say out loud in a consulting
 * room, so it does not live behind a tab.
 */
function Flags({ pet }: { pet: Pet }): ReactNode {
  const { t } = useSession();
  if (pet.flags.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {pet.flags.map((flag) => (
        <Badge key={flag.id} tone={flag.severity === 'high' ? 'alarm' : 'calm'}>
          {t(`flag.${flag.kind}` as MessageKey)}: {flag.label}
        </Badge>
      ))}
    </div>
  );
}

export function PetPage(): ReactNode {
  const { petId } = useParams<{ petId: string }>();
  const { t, locale } = useSession();
  const pet = useResource<{ pet: Pet }>(petId ? `/pets/${petId}` : null);

  if (pet.loading) return <p className="text-muted">{t('state.loading')}</p>;
  if (!pet.data) return <p className="text-muted">{t('state.error')}</p>;

  const record = pet.data.pet;

  return (
    <>
      <Card className="mb-4">
        <div className="flex items-center gap-4">
          <PetAvatar pet={record} size={64} />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{record.name}</h1>
            <p className="text-sm text-muted">
              {record.age ? formatAge(record.age, locale) : t('pet.ageUnknown')}
              {record.breed ? ` · ${record.breed}` : ''}
            </p>
            {record.nextBirthday && (
              <p className="text-xs text-muted">
                {t('pet.birthdaySoon')}: {formatDate(record.nextBirthday, locale)}
              </p>
            )}
          </div>
        </div>
        <Flags pet={record} />
      </Card>

      <nav className="mb-4 -mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2">
          {TABS.map((tab) => (
            <li key={tab.path}>
              <NavLink
                to={tab.path === '' ? `/pets/${record.id}` : `/pets/${record.id}/${tab.path}`}
                end={tab.path === ''}
                className={({ isActive }) =>
                  `inline-flex min-h-10 items-center rounded-full px-3.5 text-sm whitespace-nowrap ${
                    isActive ? 'bg-brand text-white' : 'border border-line bg-surface text-muted'
                  }`
                }
              >
                {t(tab.key)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Routes>
        <Route index element={<ProfileTab pet={record} onChanged={pet.reload} />} />
        <Route path="medical" element={<MedicalTab pet={record} onChanged={pet.reload} />} />
        <Route path="measurements" element={<MeasurementsTab pet={record} />} />
        <Route path="documents" element={<DocumentsTab pet={record} />} />
        <Route path="schedule" element={<ScheduleTab pet={record} />} />
        <Route path="*" element={<Navigate to={`/pets/${record.id}`} replace />} />
      </Routes>
    </>
  );
}
