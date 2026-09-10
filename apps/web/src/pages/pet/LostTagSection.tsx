import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { Pet } from '../../api/types';
import { useAction, useResource } from '../../app/hooks';
import { useSession } from '../../app/session';
import { QrCode } from '../../components/QrCode';
import { CheckIcon, PencilIcon, PowerIcon, PrintIcon, RefreshIcon, TagIcon } from '../../ui/icons';
import {
  Button,
  Card,
  Field,
  Input,
  SectionTitle,
  TextArea,
  buttonClasses,
} from '../../ui/primitives';

interface LostTag {
  enabled: boolean;
  url: string | null;
  contactName: string | null;
  contactPhone: string | null;
  note: string | null;
}

/**
 * The lost-pet tag, on the pet's profile.
 *
 * The form says plainly what the public page will show, because an owner deciding whether
 * to put a QR code on a collar is deciding how much of their life a stranger can read.
 */
export function LostTagSection({ pet }: { pet: Pet }): ReactNode {
  const { t, canWrite } = useSession();
  const tag = useResource<LostTag>(`/pets/${pet.id}/lost-tag`);
  const [editing, setEditing] = useState(false);

  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [note, setNote] = useState('');

  const start = () => {
    setContactName(tag.data?.contactName ?? '');
    setContactPhone(tag.data?.contactPhone ?? '');
    setNote(tag.data?.note ?? '');
    setEditing(true);
  };

  const save = useAction(async () => {
    await api.put(`/pets/${pet.id}/lost-tag`, {
      contactName,
      contactPhone,
      note: note || undefined,
    });
    setEditing(false);
    tag.reload();
  });

  const rotate = useAction(async () => {
    await api.post(`/pets/${pet.id}/lost-tag/rotate`);
    tag.reload();
  });

  const disable = useAction(async () => {
    await api.delete(`/pets/${pet.id}/lost-tag`);
    tag.reload();
  });

  return (
    <section>
      <SectionTitle>{t('lost.title')}</SectionTitle>
      <Card>
        <p className="mb-3 text-sm text-muted">{t('lost.body')}</p>

        {editing ? (
          <div className="space-y-3">
            <Field label={t('lost.contactName')} error={save.error?.fieldError('contactName')}>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
              />
            </Field>

            <Field label={t('lost.contactPhone')} error={save.error?.fieldError('contactPhone')}>
              <Input
                type="tel"
                inputMode="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                required
              />
            </Field>

            <Field label={t('lost.note')} hint={t('lost.noteHint')}>
              <TextArea value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>

            <div className="flex gap-2">
              <Button
                disabled={save.pending || contactName.trim() === '' || contactPhone.trim() === ''}
                onClick={() => void save.run()}
                icon={<CheckIcon />}
              >
                {t('action.save')}
              </Button>
              <Button tone="quiet" onClick={() => setEditing(false)}>
                {t('action.cancel')}
              </Button>
            </div>
          </div>
        ) : tag.data?.enabled && tag.data.url ? (
          <div className="space-y-3">
            <QrCode value={tag.data.url} size={180} className="mx-auto rounded-lg" />

            <p className="overflow-x-auto rounded-xl bg-canvas px-3 py-2 font-mono text-xs whitespace-nowrap select-all">
              {tag.data.url}
            </p>

            <p className="text-sm">
              {tag.data.contactName} · {tag.data.contactPhone}
            </p>
            {tag.data.note && <p className="text-sm text-muted">{tag.data.note}</p>}

            {canWrite && (
              <div className="flex flex-wrap gap-2">
                <Link to={`/pets/${pet.id}/print/tag`} className={buttonClasses('primary')}>
                  <PrintIcon />
                  {t('lost.print')}
                </Link>
                <Button tone="quiet" onClick={start} icon={<PencilIcon />}>
                  {t('action.edit')}
                </Button>
                <Button
                  tone="quiet"
                  disabled={rotate.pending}
                  onClick={() => void rotate.run()}
                  icon={<RefreshIcon />}
                >
                  {t('lost.rotate')}
                </Button>
                <Button
                  tone="danger"
                  disabled={disable.pending}
                  onClick={() => void disable.run()}
                  icon={<PowerIcon />}
                >
                  {t('lost.disable')}
                </Button>
              </div>
            )}

            <p className="text-xs text-muted">{t('lost.rotateHint')}</p>
            <p className="text-xs text-muted">{t('lost.printHint')}</p>
          </div>
        ) : (
          canWrite && (
            <Button onClick={start} icon={<TagIcon />}>
              {t('lost.enable')}
            </Button>
          )
        )}
      </Card>
    </section>
  );
}
