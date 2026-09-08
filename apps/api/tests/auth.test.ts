import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { sessions, users } from '../src/db/schema';
import { asUser, CREDENTIALS, makeApp, signUp, type TestApp } from './helpers';

let test: TestApp;

beforeEach(async () => {
  test = await makeApp();
});

afterEach(async () => {
  await test.close();
});

describe('registration', () => {
  it('creates the account, its household and a session', async () => {
    const response = await test.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: CREDENTIALS,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.householdId).toBeTruthy();
    expect(body.recoveryCode).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);
    expect(response.cookies.some((cookie) => cookie.name === 'pct_session')).toBe(true);
  });

  it('makes the registering user the owner of their household', async () => {
    const { cookie } = await signUp(test);
    const me = await asUser(test, cookie, { method: 'GET', url: '/api/v1/auth/me' });
    expect(me.json().households).toHaveLength(1);
    expect(me.json().households[0].role).toBe('owner');
  });

  it('never stores the password or the recovery code in the clear', async () => {
    const { recoveryCode } = await signUp(test);
    const row = test.database.db
      .select()
      .from(users)
      .where(eq(users.email, CREDENTIALS.email))
      .get();

    expect(row?.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(row?.passwordHash).not.toContain(CREDENTIALS.password);
    expect(row?.recoveryCodeHash).not.toContain(recoveryCode.replace(/-/g, ''));
  });

  it('refuses a second account on the same email', async () => {
    await signUp(test);
    const again = await test.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: CREDENTIALS,
    });

    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('email_taken');
  });

  it('treats the email case-insensitively', async () => {
    await signUp(test);
    const again = await test.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { ...CREDENTIALS, email: 'Owner@Example.com' },
    });
    expect(again.statusCode).toBe(409);
  });

  it('rejects a short password with a field-level message', async () => {
    const response = await test.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { ...CREDENTIALS, password: 'short' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('validation_failed');
    expect(response.json().error.details.fields[0].path).toBe('password');
  });
});

describe('login', () => {
  it('accepts the right password and sets a session', async () => {
    await signUp(test);
    const response = await test.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: CREDENTIALS.email, password: CREDENTIALS.password },
    });

    expect(response.statusCode).toBe(200);
    expect(response.cookies.some((cookie) => cookie.name === 'pct_session')).toBe(true);
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    await signUp(test);
    const wrongPassword = await test.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: CREDENTIALS.email, password: 'not the passphrase' },
    });
    const unknownAccount = await test.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'nobody@example.com', password: 'not the passphrase' },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownAccount.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownAccount.json());
  });
});

describe('sessions', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await test.app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('unauthenticated');
  });

  it('stores only a hash of the session token', async () => {
    const { cookie } = await signUp(test);
    const token = cookie.split('=')[1];
    const row = test.database.db.select().from(sessions).get();

    expect(row?.tokenHash).toHaveLength(64);
    expect(row?.tokenHash).not.toBe(token);
  });

  it('stops accepting a session once it expires', async () => {
    const { cookie } = await signUp(test);
    expect((await asUser(test, cookie, { method: 'GET', url: '/api/v1/auth/me' })).statusCode).toBe(
      200,
    );

    test.setNow('2026-12-31T12:00:00Z');
    expect((await asUser(test, cookie, { method: 'GET', url: '/api/v1/auth/me' })).statusCode).toBe(
      401,
    );
  });

  it('invalidates the session on logout', async () => {
    const { cookie } = await signUp(test);
    await asUser(test, cookie, { method: 'POST', url: '/api/v1/auth/logout' });

    const after = await asUser(test, cookie, { method: 'GET', url: '/api/v1/auth/me' });
    expect(after.statusCode).toBe(401);
  });

  it('signs out everywhere', async () => {
    const first = await signUp(test);
    const second = await test.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: CREDENTIALS.email, password: CREDENTIALS.password },
    });
    const secondCookie = `pct_session=${second.cookies.find((c) => c.name === 'pct_session')!.value}`;

    await asUser(test, first.cookie, { method: 'DELETE', url: '/api/v1/auth/sessions' });

    expect(
      (await asUser(test, secondCookie, { method: 'GET', url: '/api/v1/auth/me' })).statusCode,
    ).toBe(401);
  });
});

describe('recovery', () => {
  it('sets a new password with the recovery code and drops every session', async () => {
    const { cookie, recoveryCode } = await signUp(test);

    const recovered = await test.app.inject({
      method: 'POST',
      url: '/api/v1/auth/recovery',
      payload: {
        email: CREDENTIALS.email,
        recoveryCode,
        newPassword: 'a different long passphrase',
      },
    });
    expect(recovered.statusCode).toBe(200);

    expect((await asUser(test, cookie, { method: 'GET', url: '/api/v1/auth/me' })).statusCode).toBe(
      401,
    );

    const login = await test.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: CREDENTIALS.email, password: 'a different long passphrase' },
    });
    expect(login.statusCode).toBe(200);
  });

  it('accepts the code however it was written down', async () => {
    const { recoveryCode } = await signUp(test);
    const response = await test.app.inject({
      method: 'POST',
      url: '/api/v1/auth/recovery',
      payload: {
        email: CREDENTIALS.email,
        recoveryCode: recoveryCode.toLowerCase().replace(/-/g, ' '),
        newPassword: 'a different long passphrase',
      },
    });
    expect(response.statusCode).toBe(200);
  });

  it('spends the code, so it cannot be used twice', async () => {
    const { recoveryCode } = await signUp(test);
    const payload = {
      email: CREDENTIALS.email,
      recoveryCode,
      newPassword: 'a different long passphrase',
    };

    await test.app.inject({ method: 'POST', url: '/api/v1/auth/recovery', payload });
    const again = await test.app.inject({
      method: 'POST',
      url: '/api/v1/auth/recovery',
      payload: { ...payload, newPassword: 'yet another long passphrase' },
    });

    expect(again.statusCode).toBe(401);
  });
});

describe('profile', () => {
  it('updates the settings that change what the app computes', async () => {
    const { cookie } = await signUp(test);
    const response = await asUser(test, cookie, {
      method: 'PATCH',
      url: '/api/v1/auth/me',
      payload: { unitSystem: 'imperial', timeZone: 'Europe/Moscow', locale: 'en' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({
      unitSystem: 'imperial',
      timeZone: 'Europe/Moscow',
      locale: 'en',
    });
  });

  it('refuses a time zone that would silently become UTC', async () => {
    const { cookie } = await signUp(test);
    const response = await asUser(test, cookie, {
      method: 'PATCH',
      url: '/api/v1/auth/me',
      payload: { timeZone: 'Middle/Earth' },
    });

    expect(response.statusCode).toBe(400);
  });
});
