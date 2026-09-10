import { formatMicrochip } from '@pet-care-tracker/core';
import { type ReactNode, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { Pet, StoredFileSummary } from '../../api/types';
import { useAction } from '../../app/hooks';
import { useSession } from '../../app/session';
import { PetForm, petToValues, valuesToPayload } from '../../components/PetForm';
import { formatDate } from '../../lib/format';
import type { MessageKey } from '../../lib/i18n';
import {
  ArchiveIcon,
  CameraIcon,
  HeartIcon,
  PencilIcon,
  PrintIcon,
  RefreshIcon,
} from '../../ui/icons';
import { Button, Card, SectionTitle, Sheet, buttonClasses } from '../../ui/primitives';
import { LostTagSection } from './LostTagSection';

function Row({ label, value }: { label: string; value: ReactNode }): ReactNode {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm">{value}</dd>
    </div>
  );
}

export function ProfileTab({ pet, onChanged }: { pet: Pet; onChanged: () => void }): ReactNode {
  const { t, locale, canWrite } = useSession();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const save = useAction(async (payload: Record<string, unknown>) => {
    await api.patch(`/pets/${pet.id}`, payload);
    setEditing(false);
    onChanged();
  });

  const uploadAvatar = useAction(async (file: File) => {
    const uploaded = await api.upload<{ file: StoredFileSummary }>('/files', file);
    await api.patch(`/pets/${pet.id}`, {
      ...valuesToPayload(petToValues(pet)),
      avatarFileId: uploaded.file.id,
    });
    onChanged();
  });

  const archive = useAction(async () => {
    await api.post(`/pets/${pet.id}/${pet.archivedAt ? 'restore' : 'archive'}`);
    onChanged();
    if (!pet.archivedAt) navigate('/');
  });

  return (
    <div className="space-y-4">
      <Card>
        <dl>
          <Row
            label={t('pet.species')}
            value={pet.speciesLabel ?? t(`species.${pet.species}` as MessageKey)}
          />
          <Row label={t('pet.sex')} value={t(`sex.${pet.sex}` as MessageKey)} />
          <Row label={t('pet.breed')} value={pet.breed} />
          <Row label={t('pet.colour')} value={pet.colour} />
          <Row
            label={t('pet.birthDate')}
            value={pet.birthDate ? formatDate(pet.birthDate, locale) : null}
          />
          <Row
            label={t('pet.acquiredOn')}
            value={pet.acquiredOn ? formatDate(pet.acquiredOn, locale) : null}
          />
          <Row
            label={t('pet.microchip')}
            value={
              pet.microchip ? (
                <span className="font-mono">{formatMicrochip(pet.microchip)}</span>
              ) : null
            }
          />
          <Row label={t('pet.tattoo')} value={pet.tattoo} />
          <Row label={t('pet.pedigreeNumber')} value={pet.pedigreeNumber} />
          <Row label={t('pet.registrationNumber')} value={pet.registrationNumber} />
          <Row
            label={t('pet.neutered')}
            value={
              pet.neutered ? (pet.neuteredOn ? formatDate(pet.neuteredOn, locale) : '✓') : null
            }
          />
        </dl>

        {pet.notes && <p className="mt-3 text-sm whitespace-pre-wrap text-muted">{pet.notes}</p>}
      </Card>

      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setEditing(true)} icon={<PencilIcon />}>
            {t('action.edit')}
          </Button>

          <Button
            tone="quiet"
            onClick={() => fileInput.current?.click()}
            disabled={uploadAvatar.pending}
            icon={<CameraIcon />}
          >
            {t('action.photo')}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadAvatar.run(file);
              event.target.value = '';
            }}
          />

          <Button
            tone="quiet"
            icon={pet.archivedAt ? <RefreshIcon /> : <ArchiveIcon />}
            onClick={() => void archive.run()}
          >
            {pet.archivedAt ? t('action.restore') : t('action.archive')}
          </Button>
        </div>
      )}

      <section>
        <SectionTitle icon={<HeartIcon />}>{t('card.title')}</SectionTitle>
        <Card>
          <p className="mb-3 text-sm text-muted">{t('card.body')}</p>
          <Link to={`/pets/${pet.id}/print/card`} className={buttonClasses('quiet')}>
            <PrintIcon />
            {t('card.print')}
          </Link>
        </Card>
      </section>

      <LostTagSection pet={pet} />

      <Sheet title={t('action.edit')} open={editing} onClose={() => setEditing(false)}>
        <PetForm
          initial={petToValues(pet)}
          error={save.error}
          pending={save.pending}
          onCancel={() => setEditing(false)}
          onSubmit={(values) => void save.run(valuesToPayload(values))}
        />
      </Sheet>
    </div>
  );
}
