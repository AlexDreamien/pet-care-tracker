import { addDays } from '@pet-care-tracker/core';
import { type ReactNode, useState } from 'react';
import { api } from '../api/client';
import type { Pet } from '../api/types';
import { useAction, useResource, useToday } from '../app/hooks';
import { useSession, useUser } from '../app/session';
import { formatDate } from '../lib/format';
import { Badge, Button, Card, Empty, Field, Input, SectionTitle } from '../ui/primitives';

interface SitterLink {
  id: string;
  label: string;
  expiresOn: string;
  url: string;
  revokedAt: string | null;
  active: boolean;
  petIds: string[];
}

/**
 * Making and revoking handover links, in settings.
 *
 * The list keeps revoked links rather than hiding them: who was given access to the
 * animals, and when it stopped, is the sort of thing worth being able to look up.
 */
export function SitterLinksSection(): ReactNode {
  const { t, locale, canWrite } = useSession();
  const user = useUser();
  const today = useToday(user.timeZone);

  const links = useResource<{ links: SitterLink[] }>('/sitter-links');
  const pets = useResource<{ pets: Pet[] }>('/pets');

  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [expiresOn, setExpiresOn] = useState(() => addDays(today, 14));
  const [selected, setSelected] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const create = useAction(async () => {
    await api.post('/sitter-links', { label, expiresOn, petIds: selected });
    setLabel('');
    setSelected([]);
    setCreating(false);
    links.reload();
  });

  const revoke = useAction(async (id: string) => {
    await api.delete(`/sitter-links/${id}`);
    links.reload();
  });

  const toggle = (petId: string) =>
    setSelected((current) =>
      current.includes(petId) ? current.filter((id) => id !== petId) : [...current, petId],
    );

  return (
    <section>
      <SectionTitle>{t('sitter.title')}</SectionTitle>
      <Card>
        <p className="mb-3 text-sm text-muted">{t('sitter.body')}</p>

        {(links.data?.links.length ?? 0) === 0 && !creating && <Empty>{t('sitter.none')}</Empty>}

        <ul className="space-y-3">
          {links.data?.links.map((link) => (
            <li key={link.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{link.label}</p>
                  <p className="text-sm text-muted">
                    {t('sitter.expiresOn')} {formatDate(link.expiresOn, locale)}
                  </p>
                </div>
                <Badge tone={link.active ? 'brand' : 'neutral'}>
                  {link.revokedAt
                    ? t('sitter.revoked')
                    : link.active
                      ? t('sitter.active')
                      : t('sitter.expired')}
                </Badge>
              </div>

              {link.active && (
                <>
                  <p className="mt-2 overflow-x-auto rounded-xl bg-canvas px-3 py-2 font-mono text-xs whitespace-nowrap select-all">
                    {link.url}
                  </p>
                  {canWrite && (
                    <div className="mt-2 flex gap-2">
                      <Button
                        tone="quiet"
                        onClick={() => {
                          void navigator.clipboard.writeText(link.url);
                          setCopied(link.id);
                        }}
                      >
                        {copied === link.id ? t('action.copied') : t('action.copy')}
                      </Button>
                      <Button
                        tone="danger"
                        disabled={revoke.pending}
                        onClick={() => void revoke.run(link.id)}
                      >
                        {t('sitter.revoke')}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>

        {canWrite &&
          (creating ? (
            <div className="mt-4 space-y-3 border-t border-line pt-4">
              <Field
                label={t('sitter.label')}
                hint={t('sitter.labelHint')}
                error={create.error?.fieldError('label')}
              >
                <Input value={label} onChange={(e) => setLabel(e.target.value)} required />
              </Field>

              <Field label={t('sitter.expiresOn')} error={create.error?.fieldError('expiresOn')}>
                <Input
                  type="date"
                  value={expiresOn}
                  onChange={(e) => setExpiresOn(e.target.value)}
                />
              </Field>

              <fieldset>
                <legend className="mb-1 text-sm font-medium text-muted">{t('sitter.pets')}</legend>
                <div className="space-y-1">
                  {pets.data?.pets.map((pet) => (
                    <label key={pet.id} className="flex min-h-11 items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-5 accent-[var(--color-brand)]"
                        checked={selected.includes(pet.id)}
                        onChange={() => toggle(pet.id)}
                      />
                      <span>{pet.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="flex gap-2">
                <Button
                  disabled={create.pending || label.trim() === '' || selected.length === 0}
                  onClick={() => void create.run()}
                >
                  {t('action.save')}
                </Button>
                <Button tone="quiet" onClick={() => setCreating(false)}>
                  {t('action.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <Button className="mt-3" onClick={() => setCreating(true)}>
              {t('sitter.create')}
            </Button>
          ))}
      </Card>
    </section>
  );
}
