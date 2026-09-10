import type { RecurrenceRule, RecurrenceUnit } from '@pet-care-tracker/core';
import { type ReactNode, useState } from 'react';
import { api } from '../../api/client';
import type { CareEvent, Pet } from '../../api/types';
import { useAction, useResource, useToday } from '../../app/hooks';
import { useSession, useUser } from '../../app/session';
import { formatDate, formatRelativeDays } from '../../lib/format';
import type { MessageKey } from '../../lib/i18n';
import { CheckIcon, ClockIcon, PlusIcon } from '../../ui/icons';
import { Badge, Button, Card, Empty, Field, Input, Select, Sheet } from '../../ui/primitives';

const EVENT_TYPES = [
  'checkup',
  'grooming',
  'nail_trim',
  'teeth',
  'ears',
  'bath',
  'training',
  'boarding',
  'parasite_treatment',
  'vaccination',
  'other',
] as const;

type RepeatMode = 'none' | 'fixed_calendar' | 'after_completion';

export function ScheduleTab({ pet }: { pet: Pet }): ReactNode {
  const { t, locale, canWrite } = useSession();
  const user = useUser();
  const today = useToday(user.timeZone);
  const events = useResource<{ events: CareEvent[] }>(`/pets/${pet.id}/events`);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      {canWrite && (
        <Button full onClick={() => setAdding(true)} icon={<PlusIcon />}>
          {t('event.new')}
        </Button>
      )}

      {(events.data?.events.length ?? 0) === 0 && !events.loading && (
        <Empty icon={<ClockIcon />}>{t('state.empty')}</Empty>
      )}

      <ul className="space-y-3">
        {events.data?.events.map((event) => (
          <li key={event.id}>
            <EventRow event={event} today={today} onChanged={events.reload} />
          </li>
        ))}
      </ul>

      <EventSheet
        pet={pet}
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          events.reload();
        }}
      />
      <p className="text-xs text-muted">{formatDate(today, locale)}</p>
    </div>
  );
}

function EventRow({
  event,
  today,
  onChanged,
}: {
  event: CareEvent;
  today: string;
  onChanged: () => void;
}): ReactNode {
  const { t, locale, canWrite } = useSession();

  const complete = useAction(async () => {
    await api.post(`/events/${event.id}/complete`, { completedOn: today });
    onChanged();
  });

  const late = event.scheduledOn < today;
  const repeat = event.recurrence;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{event.title}</p>
          <p className="text-sm text-muted">
            {t(`event.${event.type}` as MessageKey)} · {formatDate(event.scheduledOn, locale)}
            {event.startTime ? ` · ${event.startTime}` : ''}
          </p>
          {repeat && (
            <p className="mt-1 text-xs text-muted">
              {t('event.every')} {repeat.interval} {t(`unit.${repeat.unit}` as MessageKey)}
              {' · '}
              {repeat.kind === 'fixed_calendar' ? t('event.repeatFixed') : t('event.repeatAfter')}
            </p>
          )}
        </div>
        <Badge tone={late ? 'alarm' : 'neutral'}>
          {formatRelativeDays(event.scheduledOn, today, locale)}
        </Badge>
      </div>

      {canWrite && (
        <Button
          tone="quiet"
          className="mt-3"
          disabled={complete.pending}
          onClick={() => void complete.run()}
          icon={<CheckIcon />}
        >
          {t('action.done')}
        </Button>
      )}
    </Card>
  );
}

function EventSheet({
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
  const user = useUser();
  const today = useToday(user.timeZone);

  const [type, setType] = useState<(typeof EVENT_TYPES)[number]>('checkup');
  const [title, setTitle] = useState('');
  const [scheduledOn, setScheduledOn] = useState(today);
  const [startTime, setStartTime] = useState('');
  const [repeat, setRepeat] = useState<RepeatMode>('none');
  const [interval, setInterval] = useState(1);
  const [unit, setUnit] = useState<RecurrenceUnit>('month');

  const create = useAction(async () => {
    const recurrence: RecurrenceRule | undefined =
      repeat === 'none'
        ? undefined
        : // The anchor must be the first scheduled date; the API rejects anything else.
          { kind: repeat, interval, unit, anchor: scheduledOn };

    await api.post('/events', {
      petId: pet.id,
      type,
      title,
      scheduledOn,
      startTime: startTime || undefined,
      recurrence,
    });
    setTitle('');
    onSaved();
  });

  return (
    <Sheet title={t('event.new')} open={open} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('document.kind')}>
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            {EVENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`event.${value}` as MessageKey)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('event.title')} error={create.error?.fieldError('title')}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('event.scheduledOn')}>
            <Input
              type="date"
              value={scheduledOn}
              onChange={(e) => setScheduledOn(e.target.value)}
            />
          </Field>
          <Field label={t('event.startTime')}>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
        </div>

        <Field
          label={t('event.repeat')}
          hint={
            repeat === 'fixed_calendar'
              ? t('event.repeatFixedHint')
              : repeat === 'after_completion'
                ? t('event.repeatAfterHint')
                : undefined
          }
        >
          <Select value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatMode)}>
            <option value="none">{t('event.repeatNever')}</option>
            <option value="fixed_calendar">{t('event.repeatFixed')}</option>
            <option value="after_completion">{t('event.repeatAfter')}</option>
          </Select>
        </Field>

        {repeat !== 'none' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('event.every')}>
              <Input
                type="number"
                min={1}
                max={365}
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value))}
              />
            </Field>
            <Field label=" ">
              <Select value={unit} onChange={(e) => setUnit(e.target.value as RecurrenceUnit)}>
                {(['day', 'week', 'month', 'year'] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`unit.${value}` as MessageKey)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        <Button
          full
          disabled={create.pending || title.trim() === ''}
          onClick={() => void create.run()}
          icon={<CheckIcon />}
        >
          {t('action.save')}
        </Button>
      </div>
    </Sheet>
  );
}
