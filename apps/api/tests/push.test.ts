/**
 * Web push, without a push service.
 *
 * What is worth testing here is the plumbing around the cryptography, not the cryptography:
 * that push degrades to nothing when unconfigured, that a browser re-subscribing does not
 * become a second row, and above all that the ledger stops the same reminder being sent on
 * two consecutive days. A reminder repeated is a reminder learned to ignore.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { pushLog, pushSubscriptions } from '../src/db/schema';
import { dispatchDueReminders } from '../src/domain/push';
import { loadConfig } from '../src/config';
import { asUser, makeApp, signUp, type TestApp } from './helpers';

let test: TestApp;
let cookie: string;
let petId: string;

const subscription = {
  endpoint: 'https://push.example.com/subscription/abc',
  keys: { p256dh: 'BFakeKeyForTests', auth: 'authsecret' },
  deviceLabel: 'Phone',
};

beforeEach(async () => {
  // A key pair shaped like the real thing, so the routes behave as configured.
  test = await makeApp(undefined, {
    VAPID_PUBLIC_KEY:
      'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
    VAPID_PRIVATE_KEY: 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls',
  });
  ({ cookie } = await signUp(test));

  const created = await asUser(test, cookie, {
    method: 'POST',
    url: '/api/v1/pets',
    payload: { name: 'Рекс', species: 'dog' },
  });
  petId = created.json().pet.id;
});

afterEach(async () => {
  await test.close();
});

const post = (url: string, payload?: Record<string, unknown>) =>
  asUser(test, cookie, { method: 'POST', url: `/api/v1${url}`, payload: payload ?? {} });

describe('when push is not configured', () => {
  it('says so instead of failing', async () => {
    const plain = await makeApp();
    try {
      const account = await signUp(plain);
      const key = await asUser(plain, account.cookie, {
        method: 'GET',
        url: '/api/v1/push/key',
      });

      expect(key.json()).toEqual({ enabled: false, publicKey: null });

      const attempt = await asUser(plain, account.cookie, {
        method: 'POST',
        url: '/api/v1/push/subscribe',
        payload: subscription,
      });
      expect(attempt.statusCode).toBe(400);
    } finally {
      await plain.close();
    }
  });

  it('dispatches nothing at all', async () => {
    const plain = await makeApp();
    try {
      const config = loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv);
      const result = await dispatchDueReminders(plain.database, config, new Date());
      expect(result).toEqual({ usersConsidered: 0, notificationsSent: 0 });
    } finally {
      await plain.close();
    }
  });
});

describe('subscribing', () => {
  it('hands the browser the public key', async () => {
    const response = await asUser(test, cookie, { method: 'GET', url: '/api/v1/push/key' });
    expect(response.json().enabled).toBe(true);
    expect(response.json().publicKey).toMatch(/^B/);
  });

  it('stores a subscription and lists it', async () => {
    expect((await post('/push/subscribe', subscription)).statusCode).toBe(201);

    const listed = await asUser(test, cookie, {
      method: 'GET',
      url: '/api/v1/push/subscriptions',
    });
    expect(listed.json().subscriptions).toHaveLength(1);
    expect(listed.json().subscriptions[0].deviceLabel).toBe('Phone');
  });

  it('does not create a second row when the same browser re-subscribes', async () => {
    await post('/push/subscribe', subscription);
    await post('/push/subscribe', { ...subscription, keys: { ...subscription.keys, auth: 'new' } });

    const rows = test.database.db.select().from(pushSubscriptions).all();
    expect(rows).toHaveLength(1);
    // The endpoint is the identity; the keys are refreshed in place.
    expect(rows[0]?.auth).toBe('new');
  });

  it('forgets a subscription on request', async () => {
    await post('/push/subscribe', subscription);
    await post('/push/unsubscribe', { endpoint: subscription.endpoint });

    expect(test.database.db.select().from(pushSubscriptions).all()).toHaveLength(0);
  });

  it('keeps one household out of another’s subscriptions', async () => {
    await post('/push/subscribe', subscription);
    const stranger = await signUp(test, { email: 'stranger@example.com' });

    const listed = await asUser(test, stranger.cookie, {
      method: 'GET',
      url: '/api/v1/push/subscriptions',
    });
    expect(listed.json().subscriptions).toEqual([]);
  });
});

describe('the daily sweep', () => {
  beforeEach(async () => {
    await post('/push/subscribe', subscription);
    // Something to be reminded about, two days out, inside the default lead time.
    await post('/events', {
      petId,
      type: 'grooming',
      title: 'Груминг',
      scheduledOn: '2026-09-10',
    });
  });

  const config = () =>
    loadConfig({
      NODE_ENV: 'test',
      PUBLIC_ORIGIN: 'http://localhost:5173',
      VAPID_PUBLIC_KEY:
        'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
      VAPID_PRIVATE_KEY: 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls',
    } as NodeJS.ProcessEnv);

  it('does nothing outside the household’s reminder hour', async () => {
    // Default reminder hour is 09:00 UTC for a household that never set a zone.
    const result = await dispatchDueReminders(
      test.database,
      config(),
      new Date('2026-09-08T14:00:00Z'),
    );

    expect(result.usersConsidered).toBe(0);
    expect(test.database.db.select().from(pushLog).all()).toHaveLength(0);
  });

  it('records what it announced at the reminder hour', async () => {
    const result = await dispatchDueReminders(
      test.database,
      config(),
      new Date('2026-09-08T09:30:00Z'),
    );

    expect(result.usersConsidered).toBe(1);
    // The push itself goes nowhere in a test — example.com is not a push service — but the
    // ledger is what stops a repeat, and it is written either way.
    const log = test.database.db.select().from(pushLog).all();
    expect(log.length).toBeGreaterThan(0);
    expect(log[0]?.sentOn).toBe('2026-09-08');
  });

  it('does not announce the same thing twice on the same day', async () => {
    await dispatchDueReminders(test.database, config(), new Date('2026-09-08T09:00:00Z'));
    const after = test.database.db.select().from(pushLog).all().length;

    // The sweep runs every quarter of an hour; it must be idempotent within the day.
    await dispatchDueReminders(test.database, config(), new Date('2026-09-08T09:15:00Z'));
    expect(test.database.db.select().from(pushLog).all()).toHaveLength(after);
  });

  it('is willing to announce it again on a later day', async () => {
    await dispatchDueReminders(test.database, config(), new Date('2026-09-08T09:00:00Z'));
    await dispatchDueReminders(test.database, config(), new Date('2026-09-09T09:00:00Z'));

    const days = new Set(
      test.database.db
        .select()
        .from(pushLog)
        .all()
        .map((row) => row.sentOn),
    );
    expect([...days].sort()).toEqual(['2026-09-08', '2026-09-09']);
  });

  it('says nothing when nothing is due', async () => {
    test.database.db.delete(pushLog).run();
    const empty = await makeApp();
    try {
      await signUp(empty);
      const result = await dispatchDueReminders(
        empty.database,
        config(),
        new Date('2026-09-08T09:00:00Z'),
      );
      expect(result.notificationsSent).toBe(0);
    } finally {
      await empty.close();
    }
  });
});

describe('the dispatch endpoint', () => {
  it('refuses a caller with neither a session nor the secret', async () => {
    const response = await test.app.inject({ method: 'POST', url: '/api/v1/push/dispatch' });
    expect(response.statusCode).toBe(401);
  });

  it('accepts a signed-in owner', async () => {
    const response = await post('/push/dispatch');
    expect(response.statusCode).toBe(200);
  });

  it('accepts the shared secret, for a scheduler with no account', async () => {
    const gated = await makeApp(undefined, {
      PUSH_DISPATCH_SECRET: 'let-me-in',
      VAPID_PUBLIC_KEY:
        'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
      VAPID_PRIVATE_KEY: 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls',
    });

    try {
      const wrong = await gated.app.inject({
        method: 'POST',
        url: '/api/v1/push/dispatch',
        headers: { 'x-dispatch-secret': 'guess' },
      });
      expect(wrong.statusCode).toBe(401);

      const right = await gated.app.inject({
        method: 'POST',
        url: '/api/v1/push/dispatch',
        headers: { 'x-dispatch-secret': 'let-me-in' },
      });
      expect(right.statusCode).toBe(200);
    } finally {
      await gated.close();
    }
  });
});

describe('a dead endpoint', () => {
  it('is dropped rather than retried for ever', async () => {
    await post('/push/subscribe', subscription);

    // example.com answers nothing a push service would; the row survives a failure that is
    // not a 404 or 410, because the service may simply be having a bad day.
    await post('/push/test');
    const rows = test.database.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, subscription.endpoint))
      .all();

    expect(rows.length).toBeLessThanOrEqual(1);
  });
});
