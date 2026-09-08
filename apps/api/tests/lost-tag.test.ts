import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asUser, makeApp, signUp, type TestApp } from './helpers';

let test: TestApp;
let cookie: string;
let petId: string;

const tag = {
  contactName: 'Алек',
  contactPhone: '+7 999 123-45-67',
  note: 'Диабетик, нужен инсулин — позвоните срочно',
};

beforeEach(async () => {
  test = await makeApp();
  ({ cookie } = await signUp(test));

  const created = await asUser(test, cookie, {
    method: 'POST',
    url: '/api/v1/pets',
    payload: {
      name: 'Рекс',
      species: 'dog',
      breed: 'Лабрадор',
      colour: 'Палевый',
      microchip: '643094100123456',
    },
  });
  petId = created.json().pet.id;
});

afterEach(async () => {
  await test.close();
});

const enable = () =>
  asUser(test, cookie, { method: 'PUT', url: `/api/v1/pets/${petId}/lost-tag`, payload: tag });

const tokenFrom = (url: string) => url.split('/').pop() as string;

describe('turning the tag on', () => {
  it('hands back a URL to print on a collar', async () => {
    const response = await enable();
    expect(response.statusCode).toBe(200);
    expect(response.json().url).toMatch(/\/found\/[A-Za-z0-9_-]{20,}$/);
  });

  it('keeps the same token when the details are edited', async () => {
    // A collar that has already been printed must not stop working.
    const first = (await enable()).json().url;
    const second = await asUser(test, cookie, {
      method: 'PUT',
      url: `/api/v1/pets/${petId}/lost-tag`,
      payload: { ...tag, note: 'Боится громких звуков' },
    });

    expect(second.json().url).toBe(first);
  });

  it('needs a name and a phone to be of any use', async () => {
    const response = await asUser(test, cookie, {
      method: 'PUT',
      url: `/api/v1/pets/${petId}/lost-tag`,
      payload: { contactName: '', contactPhone: '' },
    });
    expect(response.statusCode).toBe(422);
  });
});

describe('the public page', () => {
  it('shows what a stranger needs and nothing else', async () => {
    const url = (await enable()).json().url;
    const response = await test.app.inject({
      method: 'GET',
      url: `/api/v1/found/${tokenFrom(url)}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body).toMatchObject({
      name: 'Рекс',
      breed: 'Лабрадор',
      colour: 'Палевый',
      contactName: 'Алек',
      contactPhone: '+7 999 123-45-67',
      note: tag.note,
    });

    // The chip is a registry lookup key a finder cannot use and a vet will scan anyway.
    expect(JSON.stringify(body)).not.toContain('643094100123456');
    // Nothing identifies the household or the account behind the animal.
    expect(JSON.stringify(body)).not.toContain('example.com');
    expect(body.id).toBeUndefined();
    expect(body.householdId).toBeUndefined();
  });

  it('needs no session at all', async () => {
    const url = (await enable()).json().url;
    const response = await test.app.inject({
      method: 'GET',
      url: `/api/v1/found/${tokenFrom(url)}`,
    });
    expect(response.statusCode).toBe(200);
  });

  it('does not exist before the owner turns the tag on', async () => {
    const response = await test.app.inject({ method: 'GET', url: '/api/v1/found/never-issued' });
    expect(response.statusCode).toBe(404);
  });

  it('stops resolving once the tag is turned off', async () => {
    const url = (await enable()).json().url;
    await asUser(test, cookie, { method: 'DELETE', url: `/api/v1/pets/${petId}/lost-tag` });

    const response = await test.app.inject({
      method: 'GET',
      url: `/api/v1/found/${tokenFrom(url)}`,
    });
    expect(response.statusCode).toBe(404);
  });

  it('stops resolving once the token is rotated', async () => {
    const first = (await enable()).json().url;
    const rotated = await asUser(test, cookie, {
      method: 'POST',
      url: `/api/v1/pets/${petId}/lost-tag/rotate`,
    });

    // A tag that came off in a park is a URL somebody else now holds.
    expect(rotated.json().url).not.toBe(first);
    expect(
      (await test.app.inject({ method: 'GET', url: `/api/v1/found/${tokenFrom(first)}` }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await test.app.inject({
          method: 'GET',
          url: `/api/v1/found/${tokenFrom(rotated.json().url)}`,
        })
      ).statusCode,
    ).toBe(200);
  });

  it('goes quiet for an archived pet', async () => {
    const url = (await enable()).json().url;
    await asUser(test, cookie, { method: 'POST', url: `/api/v1/pets/${petId}/archive` });

    const response = await test.app.inject({
      method: 'GET',
      url: `/api/v1/found/${tokenFrom(url)}`,
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('access', () => {
  it('will not let another household turn on a tag', async () => {
    const stranger = await signUp(test, { email: 'stranger@example.com' });
    const response = await asUser(test, stranger.cookie, {
      method: 'PUT',
      url: `/api/v1/pets/${petId}/lost-tag`,
      payload: tag,
    });
    expect(response.statusCode).toBe(404);
  });

  it('will not serve a photo by file id through the public route', async () => {
    await enable();
    const response = await test.app.inject({
      method: 'GET',
      url: '/api/v1/found/not-a-real-token/photo',
    });
    expect(response.statusCode).toBe(404);
  });
});
