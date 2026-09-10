import { type ReactNode, useRef, useState } from 'react';
import { api } from '../../api/client';
import type { Pet, PetDocument, StoredFileSummary } from '../../api/types';
import { useAction, useResource, useToday } from '../../app/hooks';
import { useSession, useUser } from '../../app/session';
import { documentUrgency, formatDate, formatRelativeDays } from '../../lib/format';
import type { MessageKey } from '../../lib/i18n';
import { CheckIcon, DocumentIcon, PlusIcon, UploadIcon } from '../../ui/icons';
import { Badge, Button, Card, Empty, Field, Input, Select, Sheet } from '../../ui/primitives';

const KINDS = [
  'vet_passport',
  'pedigree',
  'registration',
  'insurance',
  'travel_certificate',
  'purchase_contract',
  'lab_result',
  'other',
] as const;

export function DocumentsTab({ pet }: { pet: Pet }): ReactNode {
  const { t, locale, canWrite } = useSession();
  const user = useUser();
  const today = useToday(user.timeZone);
  const documents = useResource<{ documents: PetDocument[] }>(`/pets/${pet.id}/documents`);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      {canWrite && (
        <Button full onClick={() => setAdding(true)} icon={<PlusIcon />}>
          {t('action.add')}
        </Button>
      )}

      {(documents.data?.documents.length ?? 0) === 0 && !documents.loading && (
        <Empty icon={<DocumentIcon />}>{t('state.empty')}</Empty>
      )}

      <ul className="space-y-3">
        {documents.data?.documents.map((document) => {
          const urgency = documentUrgency(document.expiresOn, today);
          return (
            <li key={document.id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{document.title}</p>
                    <p className="text-sm text-muted">
                      {t(`document.${document.kind}` as MessageKey)}
                      {document.issuedOn ? ` · ${formatDate(document.issuedOn, locale)}` : ''}
                    </p>
                  </div>

                  {/* A document that lapses is only useful as a warning before it lapses. */}
                  {urgency === 'expired' && <Badge tone="alarm">{t('document.expired')}</Badge>}
                  {urgency === 'expiring' && document.expiresOn && (
                    <Badge tone="alarm">
                      {t('document.expiring')}{' '}
                      {formatRelativeDays(document.expiresOn, today, locale)}
                    </Badge>
                  )}
                  {urgency === 'fine' && document.expiresOn && (
                    <Badge>{formatDate(document.expiresOn, locale)}</Badge>
                  )}
                </div>

                {document.fileId && (
                  <a
                    href={`/api/v1/files/${document.fileId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-sm text-brand underline"
                  >
                    {t('document.file')}
                  </a>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      <DocumentSheet
        pet={pet}
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          documents.reload();
        }}
      />
    </div>
  );
}

function DocumentSheet({
  pet,
  open,
  onClose,
  onSaved,
}: {
  pet: Pet;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}): ReactNode {
  const { t } = useSession();
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number]>('vet_passport');
  const [title, setTitle] = useState('');
  const [issuedOn, setIssuedOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const save = useAction(async () => {
    // The file goes first: a document row pointing at nothing would be worse than none.
    let fileId: string | undefined;
    if (file) {
      const uploaded = await api.upload<{ file: StoredFileSummary }>('/files', file);
      fileId = uploaded.file.id;
    }

    await api.post(`/pets/${pet.id}/documents`, {
      kind,
      title,
      issuedOn: issuedOn || undefined,
      expiresOn: expiresOn || undefined,
      fileId,
    });
    setFile(null);
    setTitle('');
    onSaved();
  });

  return (
    <Sheet title={t('tab.documents')} open={open} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('document.kind')}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {t(`document.${value}` as MessageKey)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('document.title')} error={save.error?.fieldError('title')}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('document.issuedOn')}>
            <Input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
          </Field>
          <Field label={t('document.expiresOn')} error={save.error?.fieldError('expiresOn')}>
            <Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
          </Field>
        </div>

        <Field label={t('document.file')}>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              tone="quiet"
              onClick={() => fileInput.current?.click()}
              icon={<UploadIcon />}
            >
              {t('action.choose')}
            </Button>
            <span className="truncate text-sm text-muted">{file?.name ?? '—'}</span>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </Field>

        <Button
          full
          disabled={save.pending || title.trim() === ''}
          onClick={() => void save.run()}
          icon={<CheckIcon />}
        >
          {t('action.save')}
        </Button>
      </div>
    </Sheet>
  );
}
