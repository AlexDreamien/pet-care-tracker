import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asUser, makeApp, signUp, type TestApp } from './helpers';

let test: TestApp;
let cookie: string;
let dogId: string;
let catId: string;

beforeEach(async () => {
  test = await makeApp();
  ({ cookie } = await signUp(test));

  const dog = await asUser(test, cookie, {
    method: 'POST',
    url: '/api/v1/pets',
    payload: { name: 'Рекс', species: 'dog' },
  });
  dogId = dog.json().pet.id;

  const cat = await asUser(test, cookie, {
    method: 'POST',
    url: '/api/v1/pets',
    payload: { name: 'Муся', species: 'cat' },
  });
  catId = cat.json().pet.id;
});

afterEach(async () => {
  await test.close();
});

const post = (url: string, payload: Record<string, unknown>) =>
  asUser(test, cookie, { method: 'POST', url: `/api/v1${url}`, payload });

const makeLink = (over: Record<string, unknown> = {}) =>
  post('/sitter-links', {
    label: 'Соседка Ира',
    expiresOn: '2026-09-20',
    petIds: [dogId],
    ...over,
  });

const tokenFrom = (url: string) => url.split('/').pop() as string;

describe('creating a link', () => {
  it('hands back a URL to send', async () => {
    const response = await makeLink();
    expect(response.statusCode).toBe(201);
    expect(response.json().url).toMatch(/\/sitter\/[A-Za-z0-9_-]{20,}$/);
  });

  it('refuses a date that has already passed', async () => {
    // A link that expired before it was sent is a mistake worth catching at the door.
    const response = await makeLink({ expiresOn: '2026-01-01' });
    expect(response.statusCode).toBe(400);
  });

  it('refuses a pet from another household', async () => {
    const stranger = await signUp(test, { email: 'stranger@example.com' });
    const theirs = await asUser(test, stranger.cookie, {
      method: 'POST',
      url: '/api/v1/pets',
      payload: { name: 'Чужой', species: 'dog' },
    });

    const response = await makeLink({ petIds: [dogId, theirs.json().pet.id] });
    expect(response.statusCode).toBe(404);
  });

  it('needs at least one pet', async () => {
    expect((await makeLink({ petIds: [] })).statusCode).toBe(422);
  });
});

describe('what the sitter sees', () => {
  beforeEach(async () => {
    await post(`/pets/${dogId}/health-flags`, {
      kind: 'allergy',
      label: 'Курица',
      severity: 'high',
    });
    await post(`/pets/${dogId}/food`, {
      name: 'Adult Large Breed',
      brand: 'Acana',
      weightGrams: 12_000,
      dailyGrams: 400,
      openedOn: '2026-09-01',
    });
    await post(`/pets/${dogId}/medications`, {
      name: 'Синулокс',
      dose: '250 мг',
      timesPerDay: 2,
      startsOn: '2026-09-06',
      endsOn: '2026-09-12',
    });
    await post('/events', {
      petId: dogId,
      type: 'grooming',
      title: 'Груминг',
      scheduledOn: '2026-09-12',
    });
    await post('/contacts', {
      kind: 'clinic',
      name: 'Ветклиника «Айболит»',
      phone: '+7 999 123-45-67',
    });
  });

  it('answers the questions somebody in a kitchen actually has', async () => {
    const url = (await makeLink()).json().url;
    const response = await test.app.inject({
      method: 'GET',
      url: `/api/v1/sitter/${tokenFrom(url)}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const dog = body.pets[0];

    expect(body.label).toBe('Соседка Ира');
    expect(body.vet.phone).toBe('+7 999 123-45-67');

    // What it must never be offered.
    expect(dog.flags).toEqual([{ kind: 'allergy', label: 'Курица', severity: 'high' }]);
    // What it eats.
    expect(dog.food).toMatchObject({ brand: 'Acana', dailyGrams: 400 });
    expect(dog.food.forecast.emptyOn).toBe('2026-10-01');
    // What to give today, twice.
    expect(dog.dosesToday).toHaveLength(2);
    expect(dog.dosesToday[0]).toMatchObject({ course: 'Синулокс', dose: '250 мг', taken: false });
    // What is coming while they have it.
    expect(dog.upcoming).toHaveLength(1);
  });

  it('covers only the pets that were handed over', async () => {
    const url = (await makeLink({ petIds: [dogId] })).json().url;
    const response = await test.app.inject({
      method: 'GET',
      url: `/api/v1/sitter/${tokenFrom(url)}`,
    });

    // The cat is still at home and is none of the sitter's business.
    expect(response.json().pets.map((pet: { name: string }) => pet.name)).toEqual(['Рекс']);
    expect(JSON.stringify(response.json())).not.toContain('Муся');
  });

  it('covers both when both were handed over', async () => {
    const url = (await makeLink({ petIds: [dogId, catId] })).json().url;
    const response = await test.app.inject({
      method: 'GET',
      url: `/api/v1/sitter/${tokenFrom(url)}`,
    });
    expect(response.json().pets).toHaveLength(2);
  });

  it('needs no session', async () => {
    const url = (await makeLink()).json().url;
    expect(
      (await test.app.inject({ method: 'GET', url: `/api/v1/sitter/${tokenFrom(url)}` }))
        .statusCode,
    ).toBe(200);
  });

  it('is read-only: there is no way to change anything through it', async () => {
    const url = (await makeLink()).json().url;
    const token = tokenFrom(url);

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const response = await test.app.inject({ method, url: `/api/v1/sitter/${token}` });
      expect(response.statusCode).toBe(404);
    }
  });
});

describe('the limits that make it reasonable', () => {
  it('stops working the day after it expires', async () => {
    const url = (await makeLink({ expiresOn: '2026-09-10' })).json().url;
    const token = tokenFrom(url);

    expect(
      (await test.app.inject({ method: 'GET', url: `/api/v1/sitter/${token}` })).statusCode,
    ).toBe(200);

    test.setNow('2026-09-10T23:00:00Z');
    expect(
      (await test.app.inject({ method: 'GET', url: `/api/v1/sitter/${token}` })).statusCode,
    ).toBe(200);

    test.setNow('2026-09-11T09:00:00Z');
    expect(
      (await test.app.inject({ method: 'GET', url: `/api/v1/sitter/${token}` })).statusCode,
    ).toBe(404);
  });

  it('can be revoked before it expires', async () => {
    const created = await makeLink();
    const token = tokenFrom(created.json().url);

    await asUser(test, cookie, {
      method: 'DELETE',
      url: `/api/v1/sitter-links/${created.json().id}`,
    });

    expect(
      (await test.app.inject({ method: 'GET', url: `/api/v1/sitter/${token}` })).statusCode,
    ).toBe(404);
  });

  it('keeps the revoked link in the list, because who had access is worth knowing', async () => {
    const created = await makeLink();
    await asUser(test, cookie, {
      method: 'DELETE',
      url: `/api/v1/sitter-links/${created.json().id}`,
    });

    const listed = await asUser(test, cookie, { method: 'GET', url: '/api/v1/sitter-links' });
    expect(listed.json().links).toHaveLength(1);
    expect(listed.json().links[0]).toMatchObject({ label: 'Соседка Ира', active: false });
    expect(listed.json().links[0].revokedAt).not.toBeNull();
  });

  it('will not let another household list or revoke it', async () => {
    const created = await makeLink();
    const stranger = await signUp(test, { email: 'stranger@example.com' });

    const listed = await asUser(test, stranger.cookie, {
      method: 'GET',
      url: '/api/v1/sitter-links',
    });
    expect(listed.json().links).toEqual([]);

    const revoked = await asUser(test, stranger.cookie, {
      method: 'DELETE',
      url: `/api/v1/sitter-links/${created.json().id}`,
    });
    expect(revoked.statusCode).toBe(404);
  });

  it('does not resolve a token nobody issued', async () => {
    expect(
      (await test.app.inject({ method: 'GET', url: '/api/v1/sitter/made-up' })).statusCode,
    ).toBe(404);
  });
});
