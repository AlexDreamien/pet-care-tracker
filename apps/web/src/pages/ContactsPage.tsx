import { type ReactNode, useState } from 'react';
import { api } from '../api/client';
import type { Contact } from '../api/types';
import { useAction, useResource } from '../app/hooks';
import { useSession } from '../app/session';
import { BackHome } from '../components/BackHome';
import type { MessageKey } from '../lib/i18n';
import { CheckIcon, ContactsIcon, GlobeIcon, PhoneIcon, PlusIcon, StarIcon } from '../ui/icons';
import {
  Button,
  Card,
  Empty,
  Field,
  Input,
  PageHeader,
  Select,
  Sheet,
  TextArea,
  buttonClasses,
} from '../ui/primitives';

const KINDS = ['clinic', 'vet', 'groomer', 'trainer', 'sitter', 'taxi', 'other'] as const;

export function ContactsPage(): ReactNode {
  const { t, canWrite } = useSession();
  const contacts = useResource<{ contacts: Contact[] }>('/contacts');
  const [adding, setAdding] = useState(false);

  return (
    <>
      <BackHome />

      <PageHeader
        icon={<ContactsIcon />}
        title={t('nav.contacts')}
        action={
          canWrite && (
            <Button onClick={() => setAdding(true)} icon={<PlusIcon />}>
              {t('action.add')}
            </Button>
          )
        }
      />

      {contacts.loading && <p className="text-muted">{t('state.loading')}</p>}
      {(contacts.data?.contacts.length ?? 0) === 0 && !contacts.loading && (
        <Empty icon={<ContactsIcon />}>{t('state.empty')}</Empty>
      )}

      <ul className="space-y-3">
        {contacts.data?.contacts.map((contact) => (
          <li key={contact.id}>
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-medium">
                    {contact.favourite && (
                      <StarIcon className="size-4 shrink-0 fill-current text-brand" />
                    )}
                    {contact.name}
                  </p>
                  <p className="text-sm text-muted">{t(`contact.${contact.kind}` as MessageKey)}</p>
                  {contact.address && <p className="mt-1 text-sm text-muted">{contact.address}</p>}
                </div>

                {/* A phone number on a phone should be one tap from a call. */}
                {contact.phone && (
                  <a
                    href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`}
                    className={buttonClasses('primary')}
                  >
                    <PhoneIcon />
                    {t('contact.call')}
                  </a>
                )}
              </div>

              {contact.website && (
                <a
                  href={contact.website}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex max-w-full items-center gap-1.5 text-sm text-brand underline underline-offset-2"
                >
                  <GlobeIcon className="size-4 shrink-0" />
                  <span className="truncate">{contact.website}</span>
                </a>
              )}
              {contact.notes && <p className="mt-2 text-sm text-muted">{contact.notes}</p>}
            </Card>
          </li>
        ))}
      </ul>

      <ContactSheet
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          contacts.reload();
        }}
      />
    </>
  );
}

function ContactSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}): ReactNode {
  const { t } = useSession();
  const [kind, setKind] = useState<(typeof KINDS)[number]>('clinic');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [favourite, setFavourite] = useState(false);
  const [notes, setNotes] = useState('');

  const save = useAction(async () => {
    await api.post('/contacts', {
      kind,
      name,
      phone: phone || undefined,
      address: address || undefined,
      website: website || undefined,
      favourite,
      notes: notes || undefined,
    });
    setName('');
    setPhone('');
    onSaved();
  });

  return (
    <Sheet title={t('contact.new')} open={open} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('document.kind')}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {t(`contact.${value}` as MessageKey)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('document.title')} error={save.error?.fieldError('name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>

        <Field label={t('contact.phone')}>
          <Input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>

        <Field label={t('contact.address')}>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>

        <Field label={t('contact.website')} error={save.error?.fieldError('website')}>
          <Input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://"
          />
        </Field>

        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="size-5 accent-[var(--color-brand)]"
            checked={favourite}
            onChange={(e) => setFavourite(e.target.checked)}
          />
          <span>{t('contact.favourite')}</span>
        </label>

        <Field label={t('pet.notes')}>
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

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
