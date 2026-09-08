import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asUser, makeApp, signUp, type TestApp } from './helpers';

let test: TestApp;
let cookie: string;

const barsik = {
  name: 'Барсик',
  species: 'cat',
  breed: 'Британская короткошёрстная',
  sex: 'male',
  birthDate: '2020-09-08',
  microchip: '643 094 100 123 456',
};

beforeEach(async () => {
  test = await makeApp();
  ({ cookie } = await signUp(test));
});

afterEach(async () => {
  await test.close();
});

const createPet = (payload: Record<string, unknown> = barsik) =>
  asUser(test, cookie, { method: 'POST', url: '/api/v1/pets', payload });

describe('creating a pet', () => {
  it('stores the record and computes the age', async () => {
    const response = await createPet();
    expect(response.statusCode).toBe(201);

    const { pet } = response.json();
    expect(pet.name).toBe('Барсик');
    expect(pet.age).toMatchObject({ years: 6, months: 0, approximate: false });
    expect(pet.nextBirthday).toBe('2026-09-08');
  });

  it('normalises a microchip typed with spaces', async () => {
    const { pet } = (await createPet()).json();
    expect(pet.microchip).toBe('643 094 100 123 456');

    const rejected = await createPet({ ...barsik, microchip: '64309410012345' });
    expect(rejected.statusCode).toBe(422);
    expect(rejected.json().error.details.fields[0].path).toBe('microchip');
  });

  it('hedges the age when the birth date is only known by year', async () => {
    const { pet } = (
      await createPet({ ...barsik, birthDate: '2019-06-15', birthPrecision: 'year' })
    ).json();

    expect(pet.age).toMatchObject({ years: 7, months: 0, approximate: true, resolution: 'year' });
    expect(pet.nextBirthday).toBeNull();
  });

  it('leaves the age unknown when there is no birth date', async () => {
    const { pet } = (await createPet({ name: 'Найдёныш', species: 'dog' })).json();
    expect(pet.age).toBeNull();
  });

  it('insists on naming a species outside the built-in list', async () => {
    const response = await createPet({ name: 'Кеша', species: 'other' });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.details.fields[0].path).toBe('speciesLabel');
  });

  it('accepts a named other species', async () => {
    const response = await createPet({ name: 'Кеша', species: 'other', speciesLabel: 'Попугай' });
    expect(response.statusCode).toBe(201);
    expect(response.json().pet.speciesLabel).toBe('Попугай');
  });

  it('refuses a birth date that does not exist', async () => {
    const response = await createPet({ ...barsik, birthDate: '2021-02-30' });
    expect(response.statusCode).toBe(422);
  });
});

describe('listing and reading', () => {
  it('lists a household’s pets by name', async () => {
    await createPet();
    await createPet({ name: 'Аврора', species: 'dog' });

    const response = await asUser(test, cookie, { method: 'GET', url: '/api/v1/pets' });
    expect(response.json().pets.map((pet: { name: string }) => pet.name)).toEqual([
      'Аврора',
      'Барсик',
    ]);
  });

  it('requires a session', async () => {
    const response = await test.app.inject({ method: 'GET', url: '/api/v1/pets' });
    expect(response.statusCode).toBe(401);
  });

  it('hides another household’s pet behind a 404, not a 403', async () => {
    const { pet } = (await createPet()).json();
    const stranger = await signUp(test, { email: 'stranger@example.com' });

    const response = await asUser(test, stranger.cookie, {
      method: 'GET',
      url: `/api/v1/pets/${pet.id}`,
    });
    // Confirming the id exists would itself leak something.
    expect(response.statusCode).toBe(404);
  });
});

describe('archiving', () => {
  it('keeps the record but drops it from the default list', async () => {
    const { pet } = (await createPet()).json();
    await asUser(test, cookie, { method: 'POST', url: `/api/v1/pets/${pet.id}/archive` });

    const listed = await asUser(test, cookie, { method: 'GET', url: '/api/v1/pets' });
    expect(listed.json().pets).toHaveLength(0);

    const withArchived = await asUser(test, cookie, {
      method: 'GET',
      url: '/api/v1/pets?includeArchived=true',
    });
    expect(withArchived.json().pets).toHaveLength(1);

    const stillThere = await asUser(test, cookie, { method: 'GET', url: `/api/v1/pets/${pet.id}` });
    expect(stillThere.statusCode).toBe(200);
  });

  it('restores an archived pet', async () => {
    const { pet } = (await createPet()).json();
    await asUser(test, cookie, { method: 'POST', url: `/api/v1/pets/${pet.id}/archive` });
    await asUser(test, cookie, { method: 'POST', url: `/api/v1/pets/${pet.id}/restore` });

    const listed = await asUser(test, cookie, { method: 'GET', url: '/api/v1/pets' });
    expect(listed.json().pets).toHaveLength(1);
  });
});

describe('sharing a household', () => {
  it('lets a viewer read but not write', async () => {
    const { pet } = (await createPet()).json();
    const partner = await signUp(test, { email: 'partner@example.com' });
    const me = await asUser(test, cookie, { method: 'GET', url: '/api/v1/auth/me' });
    const householdId = me.json().households[0].id;

    const invited = await asUser(test, cookie, {
      method: 'POST',
      url: `/api/v1/households/${householdId}/members`,
      payload: { email: 'partner@example.com', role: 'viewer' },
    });
    expect(invited.statusCode).toBe(201);

    const read = await asUser(test, partner.cookie, {
      method: 'GET',
      url: `/api/v1/pets/${pet.id}`,
    });
    expect(read.statusCode).toBe(200);

    const write = await asUser(test, partner.cookie, {
      method: 'PATCH',
      url: `/api/v1/pets/${pet.id}`,
      payload: { ...barsik, name: 'Renamed' },
    });
    expect(write.statusCode).toBe(403);
  });

  it('lets an editor write', async () => {
    const { pet } = (await createPet()).json();
    const partner = await signUp(test, { email: 'editor@example.com' });
    const me = await asUser(test, cookie, { method: 'GET', url: '/api/v1/auth/me' });
    const householdId = me.json().households[0].id;

    await asUser(test, cookie, {
      method: 'POST',
      url: `/api/v1/households/${householdId}/members`,
      payload: { email: 'editor@example.com', role: 'editor' },
    });

    const write = await asUser(test, partner.cookie, {
      method: 'PATCH',
      url: `/api/v1/pets/${pet.id}`,
      payload: { ...barsik, name: 'Барс' },
    });
    expect(write.statusCode).toBe(200);
    expect(write.json().pet.name).toBe('Барс');
  });

  it('reserves deleting a pet for the owner', async () => {
    const { pet } = (await createPet()).json();
    const partner = await signUp(test, { email: 'editor2@example.com' });
    const me = await asUser(test, cookie, { method: 'GET', url: '/api/v1/auth/me' });
    const householdId = me.json().households[0].id;

    await asUser(test, cookie, {
      method: 'POST',
      url: `/api/v1/households/${householdId}/members`,
      payload: { email: 'editor2@example.com', role: 'editor' },
    });

    const byEditor = await asUser(test, partner.cookie, {
      method: 'DELETE',
      url: `/api/v1/pets/${pet.id}`,
    });
    expect(byEditor.statusCode).toBe(403);

    const byOwner = await asUser(test, cookie, { method: 'DELETE', url: `/api/v1/pets/${pet.id}` });
    expect(byOwner.statusCode).toBe(200);
  });

  it('asks which household when the user belongs to more than one', async () => {
    const partner = await signUp(test, { email: 'multi@example.com' });
    const me = await asUser(test, cookie, { method: 'GET', url: '/api/v1/auth/me' });
    const householdId = me.json().households[0].id;

    await asUser(test, cookie, {
      method: 'POST',
      url: `/api/v1/households/${householdId}/members`,
      payload: { email: 'multi@example.com', role: 'editor' },
    });

    const ambiguous = await asUser(test, partner.cookie, {
      method: 'POST',
      url: '/api/v1/pets',
      payload: barsik,
    });
    expect(ambiguous.statusCode).toBe(403);

    const explicit = await asUser(test, partner.cookie, {
      method: 'POST',
      url: '/api/v1/pets',
      payload: { ...barsik, householdId },
    });
    expect(explicit.statusCode).toBe(201);
  });

  it('will not leave a household without its owner', async () => {
    const me = await asUser(test, cookie, { method: 'GET', url: '/api/v1/auth/me' });
    const household = me.json().households[0];

    const response = await asUser(test, cookie, {
      method: 'DELETE',
      url: `/api/v1/households/${household.id}/members/${me.json().user.id}`,
    });
    expect(response.statusCode).toBe(409);
  });
});

describe('the calendar subscription URL', () => {
  it('is shown to a member and can be rotated', async () => {
    const me = await asUser(test, cookie, { method: 'GET', url: '/api/v1/auth/me' });
    const householdId = me.json().households[0].id;

    const before = await asUser(test, cookie, {
      method: 'GET',
      url: `/api/v1/households/${householdId}`,
    });
    expect(before.json().household.calendarUrl).toMatch(/\/api\/v1\/calendar\/.+\.ics$/);

    const rotated = await asUser(test, cookie, {
      method: 'POST',
      url: `/api/v1/households/${householdId}/calendar-token`,
    });
    expect(rotated.json().calendarUrl).not.toBe(before.json().household.calendarUrl);
  });
});
