/**
 * Web push.
 *
 * The second reminder channel, never the first. A subscribed calendar keeps working when
 * the application has not been opened in six months, on a phone that never granted a
 * notification permission; push does not. So everything here degrades quietly: no VAPID
 * keys means no push and no error, and a dead endpoint is dropped rather than retried
 * forever.
 */

import {
  addDays,
  buildAgenda,
  compareDates,
  daysUntil,
  type IsoDate,
  todayIn,
} from '@pet-care-tracker/core';
import { and, eq } from 'drizzle-orm';
import webpush from 'web-push';
import type { Config } from '../config';
import type { Database } from '../db/client';
import { households, householdMembers, pushLog, pushSubscriptions, users } from '../db/schema';
import { collectAgendaInput } from './agendaSource';
import { uuidv7 } from './ids';

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  deviceLabel?: string | undefined;
}

export function saveSubscription(
  database: Database,
  input: { userId: string; subscription: PushSubscriptionInput; now: Date },
): void {
  const existing = database.db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, input.subscription.endpoint))
    .get();

  // A browser that re-subscribes gets the same row: the endpoint is the identity.
  if (existing) {
    database.db
      .update(pushSubscriptions)
      .set({
        userId: input.userId,
        p256dh: input.subscription.keys.p256dh,
        auth: input.subscription.keys.auth,
        deviceLabel: input.subscription.deviceLabel ?? existing.deviceLabel,
      })
      .where(eq(pushSubscriptions.id, existing.id))
      .run();
    return;
  }

  database.db
    .insert(pushSubscriptions)
    .values({
      id: uuidv7(input.now.getTime()),
      userId: input.userId,
      endpoint: input.subscription.endpoint,
      p256dh: input.subscription.keys.p256dh,
      auth: input.subscription.keys.auth,
      deviceLabel: input.subscription.deviceLabel ?? null,
      createdAt: input.now.toISOString(),
    })
    .run();
}

export function removeSubscription(database: Database, endpoint: string): void {
  database.db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run();
}

export function listSubscriptions(database: Database, userId: string) {
  return database.db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .all();
}

interface Notification {
  title: string;
  body: string;
  url: string;
}

/**
 * Sends one notification to every browser a user has subscribed.
 *
 * A 404 or 410 from the push service means the browser threw the subscription away; the row
 * is deleted rather than retried, because it will never work again.
 */
export async function sendToUser(
  database: Database,
  config: Config,
  userId: string,
  notification: Notification,
  now: Date,
): Promise<number> {
  if (!config.pushEnabled) return 0;

  webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY);

  const subscriptions = listSubscriptions(database, userId);
  let delivered = 0;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(notification),
        { TTL: 12 * 60 * 60 },
      );

      database.db
        .update(pushSubscriptions)
        .set({ lastSentAt: now.toISOString() })
        .where(eq(pushSubscriptions.id, subscription.id))
        .run();
      delivered += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        removeSubscription(database, subscription.endpoint);
      }
      // Anything else is the push service having a bad day; the calendar feed still works.
    }
  }

  return delivered;
}

export interface DispatchResult {
  usersConsidered: number;
  notificationsSent: number;
}

/**
 * The daily sweep.
 *
 * For each household it is currently the reminder hour in, gather what falls due inside the
 * lead time and tell every member once. The ledger is keyed by the agenda item's own stable
 * key, so an item that stays due for three days is announced once, not three times — a
 * reminder repeated is a reminder learned to ignore.
 */
export async function dispatchDueReminders(
  database: Database,
  config: Config,
  now: Date,
): Promise<DispatchResult> {
  if (!config.pushEnabled) return { usersConsidered: 0, notificationsSent: 0 };

  let usersConsidered = 0;
  let notificationsSent = 0;

  for (const household of database.db.select().from(households).all()) {
    const localHour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: household.timeZone,
        hour: '2-digit',
        hour12: false,
      }).format(now),
    );
    if (localHour !== household.reminderHour) continue;

    const today = todayIn(now, household.timeZone);
    const horizon = addDays(today, household.reminderLeadDays);

    const input = collectAgendaInput(database, {
      householdId: household.id,
      from: today,
      to: horizon,
      timeZone: household.timeZone,
      foodLeadDays: household.foodLeadDays,
    });

    const due = buildAgenda(input, { from: today, to: horizon }, today).filter(
      (item) => !item.completed && compareDates(item.date, horizon) <= 0,
    );
    if (due.length === 0) continue;

    const members = database.db
      .select({ userId: householdMembers.userId, locale: users.locale })
      .from(householdMembers)
      .innerJoin(users, eq(users.id, householdMembers.userId))
      .where(eq(householdMembers.householdId, household.id))
      .all();

    for (const member of members) {
      usersConsidered += 1;

      const fresh = due.filter((item) => !alreadySent(database, member.userId, item.key, today));
      if (fresh.length === 0) continue;

      const headline = fresh[0]!;
      const rest = fresh.length - 1;
      const days = daysUntil(headline.date, today);

      const sent = await sendToUser(
        database,
        config,
        member.userId,
        {
          title: `${headline.petName}: ${headline.title}`,
          body:
            rest > 0
              ? `${describeWhen(days, member.locale)} · +${rest}`
              : describeWhen(days, member.locale),
          url: `${config.PUBLIC_ORIGIN}/agenda`,
        },
        now,
      );

      // Recorded whether or not a browser was listening: the owner has been told as far as
      // this application can tell, and telling them again tomorrow would be noise.
      for (const item of fresh) recordSent(database, member.userId, item.key, today, now);
      notificationsSent += sent;
    }
  }

  return { usersConsidered, notificationsSent };
}

function alreadySent(
  database: Database,
  userId: string,
  itemKey: string,
  sentOn: IsoDate,
): boolean {
  return (
    database.db
      .select({ id: pushLog.id })
      .from(pushLog)
      .where(
        and(eq(pushLog.userId, userId), eq(pushLog.itemKey, itemKey), eq(pushLog.sentOn, sentOn)),
      )
      .get() !== undefined
  );
}

function recordSent(
  database: Database,
  userId: string,
  itemKey: string,
  sentOn: IsoDate,
  now: Date,
): void {
  database.db
    .insert(pushLog)
    .values({ id: uuidv7(now.getTime()), userId, itemKey, sentOn })
    .onConflictDoNothing()
    .run();
}

/**
 * Wording for the notification body, in the member's language.
 *
 * A notification is the one string this application writes outside the interface, so it
 * cannot reach for the web layer's dictionary — but it still must not arrive in a language
 * the reader did not choose.
 */
function describeWhen(days: number, locale: string): string {
  const russian = locale === 'ru';
  if (days <= 0) return russian ? 'сегодня' : 'today';
  if (days === 1) return russian ? 'завтра' : 'tomorrow';
  return russian ? `через ${days} дн.` : `in ${days} days`;
}
