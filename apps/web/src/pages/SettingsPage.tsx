import { startRegistration } from '@simplewebauthn/browser';
import { type ReactNode, useState } from 'react';
import { api } from '../api/client';
import type { Passkey } from '../api/types';
import { useAction, useResource } from '../app/hooks';
import { useSession, useUser } from '../app/session';
import { formatDate } from '../lib/format';
import { LOCALES, type MessageKey } from '../lib/i18n';
import { SitterLinksSection } from './SitterLinksSection';
import { Button, Card, Field, Input, Select, SectionTitle } from '../ui/primitives';

interface HouseholdDetail {
  household: {
    id: string;
    name: string;
    reminderLeadDays: number;
    reminderHour: number;
    calendarUrl: string;
  };
  role: string;
  members: { userId: string; role: string; displayName: string; email: string }[];
}

export function SettingsPage(): ReactNode {
  const { t, signOut, refresh, household } = useSession();
  const user = useUser();

  const detail = useResource<HouseholdDetail>(household ? `/households/${household.id}` : null);
  const passkeys = useResource<{ passkeys: Passkey[] }>('/auth/passkeys');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('nav.settings')}</h1>

      <ProfileCard onSaved={refresh} />

      {detail.data && (
        <>
          <RemindersCard detail={detail.data} onSaved={detail.reload} />
          <CalendarCard detail={detail.data} onRotated={detail.reload} />
          <MembersCard detail={detail.data} onChanged={detail.reload} />
        </>
      )}

      <SitterLinksSection />

      <section>
        <SectionTitle>{t('settings.passkeys')}</SectionTitle>
        <Card>
          <PasskeyList passkeys={passkeys.data?.passkeys ?? []} onChanged={passkeys.reload} />
        </Card>
      </section>

      <section>
        <SectionTitle>{t('settings.install')}</SectionTitle>
        <Card>
          <p className="text-sm text-muted">{t('settings.installIos')}</p>
          <p className="mt-2 text-sm text-muted">{t('settings.installAndroid')}</p>
        </Card>
      </section>

      <section>
        <SectionTitle>{t('settings.export')}</SectionTitle>
        <Card>
          <p className="mb-3 text-sm text-muted">{t('settings.exportHint')}</p>
          <a
            href="/api/v1/export"
            download
            className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 text-sm font-medium"
          >
            {t('settings.export')}
          </a>
        </Card>
      </section>

      <Button tone="danger" full onClick={() => void signOut()}>
        {t('action.signOut')} · {user.email}
      </Button>
    </div>
  );
}

function ProfileCard({ onSaved }: { onSaved: () => Promise<void> }): ReactNode {
  const { t } = useSession();
  const user = useUser();
  const [locale, setLocale] = useState(user.locale);
  const [unitSystem, setUnitSystem] = useState(user.unitSystem);
  const [timeZone, setTimeZone] = useState(user.timeZone);

  const save = useAction(async () => {
    await api.patch('/auth/me', { locale, unitSystem, timeZone });
    await onSaved();
  });

  // The zones the browser knows, so nothing unresolvable can be chosen.
  const zones = Intl.supportedValuesOf('timeZone');

  return (
    <section>
      <SectionTitle>{t('settings.profile')}</SectionTitle>
      <Card className="space-y-3">
        <Field label={t('settings.language')}>
          <Select value={locale} onChange={(e) => setLocale(e.target.value as typeof locale)}>
            {LOCALES.map((value) => (
              <option key={value} value={value}>
                {value === 'ru' ? 'Русский' : 'English'}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('settings.units')}>
          <Select
            value={unitSystem}
            onChange={(e) => setUnitSystem(e.target.value as typeof unitSystem)}
          >
            <option value="metric">{t('settings.units.metric')}</option>
            <option value="imperial">{t('settings.units.imperial')}</option>
          </Select>
        </Field>

        <Field label={t('settings.timeZone')} error={save.error?.fieldError('timeZone')}>
          <Select value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </Select>
        </Field>

        <Button disabled={save.pending} onClick={() => void save.run()}>
          {t('action.save')}
        </Button>
      </Card>
    </section>
  );
}

function RemindersCard({
  detail,
  onSaved,
}: {
  detail: HouseholdDetail;
  onSaved: () => void;
}): ReactNode {
  const { t } = useSession();
  const [leadDays, setLeadDays] = useState(detail.household.reminderLeadDays);
  const [hour, setHour] = useState(detail.household.reminderHour);

  const save = useAction(async () => {
    await api.patch(`/households/${detail.household.id}`, { leadDays, hour });
    onSaved();
  });

  return (
    <section>
      <SectionTitle>{t('settings.reminders')}</SectionTitle>
      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('settings.leadDays')}>
            <Input
              type="number"
              min={0}
              max={60}
              value={leadDays}
              onChange={(e) => setLeadDays(Number(e.target.value))}
            />
          </Field>
          <Field label={t('settings.reminderHour')}>
            <Input
              type="number"
              min={0}
              max={23}
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
            />
          </Field>
        </div>

        <Button disabled={save.pending} onClick={() => void save.run()}>
          {t('action.save')}
        </Button>
      </Card>
    </section>
  );
}

function CalendarCard({
  detail,
  onRotated,
}: {
  detail: HouseholdDetail;
  onRotated: () => void;
}): ReactNode {
  const { t } = useSession();
  const [copied, setCopied] = useState(false);

  const rotate = useAction(async () => {
    await api.post(`/households/${detail.household.id}/calendar-token`);
    onRotated();
  });

  return (
    <section>
      <SectionTitle>{t('settings.calendar')}</SectionTitle>
      <Card>
        <p className="mb-3 text-sm text-muted">{t('settings.calendarBody')}</p>

        <p className="mb-3 overflow-x-auto rounded-xl bg-canvas px-3 py-2 font-mono text-xs whitespace-nowrap select-all">
          {detail.household.calendarUrl}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            tone="quiet"
            onClick={() => {
              void navigator.clipboard.writeText(detail.household.calendarUrl);
              setCopied(true);
            }}
          >
            {copied ? t('action.copied') : t('action.copy')}
          </Button>

          {detail.role === 'owner' && (
            <Button tone="danger" disabled={rotate.pending} onClick={() => void rotate.run()}>
              {t('settings.calendarRotate')}
            </Button>
          )}
        </div>

        <p className="mt-2 text-xs text-muted">{t('settings.calendarRotateHint')}</p>
      </Card>
    </section>
  );
}

function MembersCard({
  detail,
  onChanged,
}: {
  detail: HouseholdDetail;
  onChanged: () => void;
}): ReactNode {
  const { t } = useSession();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');

  const invite = useAction(async () => {
    await api.post(`/households/${detail.household.id}/members`, { email, role });
    setEmail('');
    onChanged();
  });

  return (
    <section>
      <SectionTitle>{t('settings.members')}</SectionTitle>
      <Card>
        <ul className="mb-3">
          {detail.members.map((member) => (
            <li
              key={member.userId}
              className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{member.displayName}</p>
                <p className="truncate text-sm text-muted">{member.email}</p>
              </div>
              <span className="text-sm text-muted">
                {t(`settings.role.${member.role}` as MessageKey)}
              </span>
            </li>
          ))}
        </ul>

        {detail.role === 'owner' && (
          <div className="space-y-2">
            <Field label={t('settings.addMember')} error={invite.error?.fieldError('email')}>
              <Input
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              <option value="editor">{t('settings.role.editor')}</option>
              <option value="viewer">{t('settings.role.viewer')}</option>
            </Select>
            <Button
              disabled={invite.pending || email.trim() === ''}
              onClick={() => void invite.run()}
            >
              {t('action.add')}
            </Button>
            {invite.error?.code === 'not_found' && (
              <p className="text-sm text-muted">{t('state.error')}</p>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}

function PasskeyList({
  passkeys,
  onChanged,
}: {
  passkeys: Passkey[];
  onChanged: () => void;
}): ReactNode {
  const { t, locale } = useSession();

  const enrol = useAction(async () => {
    const options = await api.post<Parameters<typeof startRegistration>[0]['optionsJSON']>(
      '/auth/passkey/register/options',
    );
    const attestation = await startRegistration({ optionsJSON: options });
    await api.post('/auth/passkey/register/verify', {
      response: attestation,
      deviceLabel: navigator.platform || 'device',
    });
    onChanged();
  });

  const remove = useAction(async (id: string) => {
    await api.delete(`/auth/passkeys/${id}`);
    onChanged();
  });

  return (
    <>
      <ul className="mb-3">
        {passkeys.map((passkey) => (
          <li
            key={passkey.id}
            className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{passkey.deviceLabel ?? '—'}</p>
              <p className="text-sm text-muted">
                {passkey.lastUsedAt
                  ? formatDate(passkey.lastUsedAt.slice(0, 10), locale)
                  : t('settings.passkeyNever')}
              </p>
            </div>
            <Button tone="quiet" className="px-3" onClick={() => void remove.run(passkey.id)}>
              ✕
            </Button>
          </li>
        ))}
      </ul>

      <Button tone="quiet" disabled={enrol.pending} onClick={() => void enrol.run()}>
        {t('settings.passkeyAdd')}
      </Button>
      {enrol.error && <p className="mt-2 text-sm text-alarm">{t('auth.passkeyFailed')}</p>}
    </>
  );
}
