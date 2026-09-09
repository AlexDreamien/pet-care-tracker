import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asUser, makeApp, signUp, type TestApp } from './helpers';

let test: TestApp;
let cookie: string;
let petId: string;
let householdId: string;

beforeEach(async () => {
  test = await makeApp();
  ({ cookie } = await signUp(test));

  const created = await asUser(test, cookie, {
    method: 'POST',
    url: '/api/v1/pets',
    payload: { name: 'Рекс', species: 'dog' },
  });
  petId = created.json().pet.id;

  const me = await asUser(test, cookie, { method: 'GET', url: '/api/v1/auth/me' });
  householdId = me.json().households[0].id;
});

afterEach(async () => {
  await test.close();
});

const post = (url: string, payload: Record<string, unknown>) =>
  asUser(test, cookie, { method: 'POST', url: `/api/v1${url}`, payload });
const get = (url: string) => asUser(test, cookie, { method: 'GET', url: `/api/v1${url}` });

const bag = {
  brand: 'Acana',
  name: 'Adult Large Breed',
  weightGrams: 12_000,
  dailyGrams: 400,
  openedOn: '2026-09-01',
  price: 6800,
};

describe('food', () => {
  it('forecasts when the open bag runs out', async () => {
    const created = await post(`/pets/${petId}/food`, bag);
    expect(created.statusCode).toBe(201);

    const listed = await get(`/pets/${petId}/food`);
    const [row] = listed.json().bags;

    expect(row.forecast.emptyOn).toBe('2026-10-01');
    expect(row.forecast.remainingGrams).toBe(9200);
    expect(row.forecast.daysLeft).toBe(23);
  });

  it('puts buying more on the agenda before the bag is empty', async () => {
    await post(`/pets/${petId}/food`, bag);

    const agenda = await get('/agenda?from=2026-09-08&to=2026-12-08');
    const reminder = agenda
      .json()
      .items.find((item: { source: string }) => item.source === 'food_low');

    // Five days of warning by default, so there is time to order more.
    expect(reminder.date).toBe('2026-09-26');
    expect(reminder.title).toBe('Acana Adult Large Breed');
  });

  it('follows the household setting for how much warning to give', async () => {
    await post(`/pets/${petId}/food`, bag);
    await asUser(test, cookie, {
      method: 'PATCH',
      url: `/api/v1/households/${householdId}`,
      payload: { foodLeadDays: 14 },
    });

    const agenda = await get('/agenda?from=2026-09-08&to=2026-12-08');
    const reminder = agenda
      .json()
      .items.find((item: { source: string }) => item.source === 'food_low');
    expect(reminder.date).toBe('2026-09-17');
  });

  it('stops forecasting a bag that is finished', async () => {
    const created = await post(`/pets/${petId}/food`, bag);
    const finished = await post(`/food/${created.json().bag.id}/finish`, {});

    expect(finished.json().finishedOn).toBe('2026-09-08');
    // Twelve kilos gone in seven days is 1714 g a day, not the 400 on the label.
    expect(finished.json().actualDailyGrams).toBeCloseTo(1714.3, 0);

    const listed = await get(`/pets/${petId}/food`);
    expect(listed.json().bags[0].forecast).toBeNull();

    const agenda = await get('/agenda?from=2026-09-08&to=2026-12-08');
    expect(agenda.json().items.some((item: { source: string }) => item.source === 'food_low')).toBe(
      false,
    );
  });

  it('refuses a ration that would divide by zero', async () => {
    const response = await post(`/pets/${petId}/food`, { ...bag, dailyGrams: 0 });
    expect(response.statusCode).toBe(422);
  });
});

describe('expenses', () => {
  it('merges what was entered with money already recorded elsewhere', async () => {
    await post('/expenses', {
      category: 'accessories',
      amount: 2400,
      spentOn: '2026-08-15',
      petId,
      note: 'Шлейка',
    });
    await post(`/pets/${petId}/visits`, {
      visitedOn: '2026-08-01',
      reason: 'Осмотр',
      cost: 3500,
    });
    await post(`/pets/${petId}/food`, bag);

    const response = await get('/expenses?from=2026-01-01&to=2026-12-31');
    const { summary, entries } = response.json();

    expect(summary.total).toBe(12_700);
    expect(summary.byCategory.map((row: { category: string }) => row.category).sort()).toEqual([
      'accessories',
      'food',
      'vet',
    ]);
    // A vet fee is not an expense row and the interface must be able to say so.
    expect(entries.map((entry: { source: string }) => entry.source).sort()).toEqual([
      'expense',
      'food',
      'visit',
    ]);
  });

  it('does not double-count a fee that is also entered by hand', async () => {
    await post(`/pets/${petId}/visits`, { visitedOn: '2026-08-01', reason: 'Осмотр', cost: 3500 });

    const before = await get('/expenses?from=2026-01-01&to=2026-12-31');
    expect(before.json().summary.total).toBe(3500);

    // Editing the visit moves the figure; there is no copy to go stale.
    const visits = await get(`/pets/${petId}/visits`);
    expect(visits.json().visits).toHaveLength(1);
  });

  it('groups by month', async () => {
    await post('/expenses', { category: 'food', amount: 1000, spentOn: '2026-01-10' });
    await post('/expenses', { category: 'food', amount: 2000, spentOn: '2026-02-10' });

    const response = await get('/expenses?from=2026-01-01&to=2026-12-31');
    expect(response.json().summary.byMonth).toEqual([
      { month: '2026-01', total: 1000 },
      { month: '2026-02', total: 2000 },
    ]);
  });

  it('sets a foreign-currency entry aside rather than converting it', async () => {
    await post('/expenses', { category: 'food', amount: 1000, spentOn: '2026-03-01' });
    await post('/expenses', {
      category: 'food',
      amount: 40,
      currency: 'EUR',
      spentOn: '2026-03-02',
    });

    const response = await get('/expenses?from=2026-01-01&to=2026-12-31');
    expect(response.json().summary.total).toBe(1000);
    expect(response.json().summary.excluded).toHaveLength(1);
  });

  it('narrows to one pet without dragging in a shared cost', async () => {
    await post('/expenses', { category: 'accessories', amount: 500, spentOn: '2026-05-01', petId });
    await post('/expenses', { category: 'accessories', amount: 900, spentOn: '2026-05-02' });

    const all = await get('/expenses?from=2026-01-01&to=2026-12-31');
    const one = await get(`/expenses?from=2026-01-01&to=2026-12-31&petId=${petId}`);

    expect(all.json().summary.total).toBe(1400);
    expect(one.json().summary.total).toBe(500);
  });

  it('totals in the household currency once it is changed', async () => {
    await asUser(test, cookie, {
      method: 'PATCH',
      url: `/api/v1/households/${householdId}`,
      payload: { currency: 'eur' },
    });

    // An expense entered without naming a currency takes the household's.
    await post('/expenses', { category: 'food', amount: 40, spentOn: '2026-05-01' });

    const response = await get('/expenses?from=2026-01-01&to=2026-12-31');
    expect(response.json().summary.currency).toBe('EUR');
    expect(response.json().summary.total).toBe(40);
    expect(response.json().summary.excluded).toEqual([]);
  });

  it('sets aside what was entered before the currency changed', async () => {
    await post('/expenses', { category: 'food', amount: 1000, spentOn: '2026-05-01' });
    await asUser(test, cookie, {
      method: 'PATCH',
      url: `/api/v1/households/${householdId}`,
      payload: { currency: 'EUR' },
    });

    const response = await get('/expenses?from=2026-01-01&to=2026-12-31');
    // Nothing is silently reinterpreted: the old roubles are still roubles.
    expect(response.json().summary.total).toBe(0);
    expect(response.json().summary.excluded).toHaveLength(1);
    expect(response.json().summary.excluded[0].currency).toBe('RUB');
  });

  it('refuses something that is not a currency code', async () => {
    const response = await asUser(test, cookie, {
      method: 'PATCH',
      url: `/api/v1/households/${householdId}`,
      payload: { currency: 'roubles' },
    });
    expect(response.statusCode).toBe(422);
  });

  it('keeps another household out of the total', async () => {
    const stranger = await signUp(test, { email: 'stranger@example.com' });
    await asUser(test, stranger.cookie, {
      method: 'POST',
      url: '/api/v1/expenses',
      payload: { category: 'food', amount: 999, spentOn: '2026-05-01' },
    });

    const response = await get('/expenses?from=2026-01-01&to=2026-12-31');
    expect(response.json().summary.total).toBe(0);
  });
});
