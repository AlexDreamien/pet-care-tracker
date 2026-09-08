import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asUser, makeApp, signUp, type TestApp } from './helpers';

let test: TestApp;
let cookie: string;
let petId: string;
let householdId: string;

const REX = {
  name: 'Рекс',
  species: 'dog',
  breed: 'Лабрадор',
  sex: 'male',
  birthDate: '2020-10-15',
};

beforeEach(async () => {
  test = await makeApp();
  ({ cookie } = await signUp(test));

  const created = await asUser(test, cookie, {
    method: 'POST',
    url: '/api/v1/pets',
    payload: REX,
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

describe('vaccinations', () => {
  it('proposes the next due date from the catalogue', async () => {
    const response = await post(`/pets/${petId}/vaccinations`, {
      vaccineCode: 'dhppi',
      administeredOn: '2026-09-01',
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().dueDateProposed).toBe(true);
    // A grown dog's combined booster runs on the three-year interval.
    expect(response.json().vaccination.nextDueOn).toBe('2029-09-01');
  });

  it('lets the owner’s own date win over the default', async () => {
    const response = await post(`/pets/${petId}/vaccinations`, {
      vaccineCode: 'dhppi',
      administeredOn: '2026-09-01',
      nextDueOn: '2028-03-01',
    });

    expect(response.json().dueDateProposed).toBe(false);
    expect(response.json().vaccination.nextDueOn).toBe('2028-03-01');
  });

  it('proposes nothing for a vaccine outside the catalogue', async () => {
    const response = await post(`/pets/${petId}/vaccinations`, {
      productName: 'Что-то импортное',
      administeredOn: '2026-09-01',
    });

    expect(response.json().vaccination.nextDueOn).toBeNull();
    expect(response.json().dueDateProposed).toBe(false);
  });

  it('offers the catalogue for the pet’s species', async () => {
    const response = await get(`/pets/${petId}/vaccine-catalogue`);
    const codes = response.json().vaccines.map((vaccine: { code: string }) => vaccine.code);

    expect(codes).toContain('rabies');
    expect(codes).toContain('leptospirosis');
    expect(response.json().vaccines[0].guidance).not.toBe('');
  });
});

describe('antiparasitic treatment', () => {
  it('proposes the adult interval from the day it was given', async () => {
    const response = await post(`/pets/${petId}/parasite-treatments`, {
      target: 'internal',
      administeredOn: '2026-06-01',
    });

    expect(response.json().treatment.nextDueOn).toBe('2026-09-01');
  });

  it('pushes the schedule out when a dose was given late', async () => {
    const onTime = await post(`/pets/${petId}/parasite-treatments`, {
      target: 'internal',
      administeredOn: '2026-06-01',
    });
    const late = await post(`/pets/${petId}/parasite-treatments`, {
      target: 'internal',
      administeredOn: '2026-06-21',
    });

    expect(onTime.json().treatment.nextDueOn).toBe('2026-09-01');
    expect(late.json().treatment.nextDueOn).toBe('2026-09-21');
  });

  it('uses the monthly interval for an external treatment', async () => {
    const response = await post(`/pets/${petId}/parasite-treatments`, {
      target: 'external',
      administeredOn: '2026-08-31',
    });
    // Clamped to the end of the shorter month.
    expect(response.json().treatment.nextDueOn).toBe('2026-09-30');
  });
});

describe('measurements', () => {
  it('records a series and reads a trend against the target', async () => {
    for (const [measuredOn, value] of [
      ['2026-06-01', 30],
      ['2026-07-01', 31],
      ['2026-08-01', 32.5],
      ['2026-09-01', 34],
    ] as const) {
      const created = await post(`/pets/${petId}/measurements`, {
        metric: 'weight',
        measuredOn,
        value,
      });
      expect(created.statusCode).toBe(201);
    }

    await asUser(test, cookie, {
      method: 'PUT',
      url: `/api/v1/pets/${petId}/targets`,
      payload: { metric: 'weight', min: 28, max: 32 },
    });

    const response = await get(`/pets/${petId}/measurements?metric=weight`);
    const series = response.json().series[0];

    expect(series.readings).toHaveLength(4);
    expect(series.trend.direction).toBe('rising');
    expect(series.change.absolute).toBeCloseTo(1.5, 5);
    expect(series.position).toBe('above');
  });

  it('refuses a value that is a misplaced decimal point', async () => {
    const response = await post(`/pets/${petId}/measurements`, {
      metric: 'weight',
      measuredOn: '2026-09-01',
      value: 420,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.details.fields[0].path).toBe('value');
  });

  it('builds a size card with how stale each reading is', async () => {
    await post(`/pets/${petId}/measurements`, {
      metric: 'chest_girth',
      measuredOn: '2026-08-01',
      value: 72,
    });
    await post(`/pets/${petId}/measurements`, {
      metric: 'neck_girth',
      measuredOn: '2026-03-01',
      value: 45,
    });

    const response = await get(`/pets/${petId}/size-card`);
    const entries = response.json().entries;

    expect(entries).toHaveLength(2);
    // Six months old: the number that would buy the wrong harness.
    expect(entries.find((e: { metric: string }) => e.metric === 'neck_girth').ageInDays).toBe(191);
    expect(entries.find((e: { metric: string }) => e.metric === 'chest_girth').ageInDays).toBe(38);
  });
});

describe('care events', () => {
  const nailTrim = {
    type: 'nail_trim',
    title: 'Когти',
    scheduledOn: '2026-09-15',
    recurrence: {
      kind: 'after_completion' as const,
      interval: 6,
      unit: 'week' as const,
      anchor: '2026-09-15',
    },
  };

  const checkup = {
    type: 'checkup',
    title: 'Диспансеризация',
    scheduledOn: '2027-03-01',
    recurrence: {
      kind: 'fixed_calendar' as const,
      interval: 1,
      unit: 'year' as const,
      anchor: '2027-03-01',
    },
  };

  it('restarts an after-completion series from the day it was done', async () => {
    const created = await post('/events', { ...nailTrim, petId });
    const completed = await post(`/events/${created.json().event.id}/complete`, {
      completedOn: '2026-09-20',
    });

    // Done five days late, so the next one moves five days too.
    expect(completed.json().nextScheduledOn).toBe('2026-11-01');
  });

  it('keeps a fixed-calendar series on its grid when done early', async () => {
    const created = await post('/events', { ...checkup, petId });
    const completed = await post(`/events/${created.json().event.id}/complete`, {
      completedOn: '2027-02-14',
    });

    // A fortnight early does not drag next year's checkup forward with it.
    expect(completed.json().nextScheduledOn).toBe('2028-03-01');
  });

  it('leaves a one-off on its date and records the completion', async () => {
    const created = await post('/events', {
      petId,
      type: 'grooming',
      title: 'Груминг',
      scheduledOn: '2026-09-20',
    });
    const completed = await post(`/events/${created.json().event.id}/complete`, {
      completedOn: '2026-09-21',
    });

    expect(completed.json().nextScheduledOn).toBeNull();
    expect(completed.json().event.scheduledOn).toBe('2026-09-20');

    const history = await get(`/events/${created.json().event.id}/completions`);
    expect(history.json().completions).toHaveLength(1);
  });

  it('refuses a recurrence anchored anywhere but the first date', async () => {
    const response = await post('/events', {
      ...nailTrim,
      petId,
      recurrence: { ...nailTrim.recurrence, anchor: '2026-01-01' },
    });
    expect(response.statusCode).toBe(422);
  });
});

describe('the agenda', () => {
  beforeEach(async () => {
    await post(`/pets/${petId}/vaccinations`, {
      vaccineCode: 'rabies',
      administeredOn: '2025-10-01',
    });
    await post(`/pets/${petId}/documents`, {
      kind: 'vet_passport',
      title: 'Ветпаспорт',
      expiresOn: '2026-11-20',
    });
    await post('/events', {
      petId,
      type: 'grooming',
      title: 'Груминг',
      scheduledOn: '2026-09-25',
    });
  });

  it('merges events, derived due dates, expiries and birthdays in date order', async () => {
    const response = await get('/agenda?from=2026-09-01&to=2026-12-31');
    const items = response.json().items;

    expect(items.map((item: { source: string; date: string }) => [item.source, item.date])).toEqual(
      [
        ['event', '2026-09-25'],
        ['vaccination', '2026-10-01'],
        ['birthday', '2026-10-15'],
        ['document_expiry', '2026-11-20'],
      ],
    );
  });

  it('marks a date already past as overdue', async () => {
    await post('/events', {
      petId,
      type: 'teeth',
      title: 'Чистка зубов',
      scheduledOn: '2026-08-20',
    });

    const response = await get('/agenda?from=2026-01-01&to=2026-12-31');
    const items = response.json().items;

    const missed = items.find((item: { title: string }) => item.title === 'Чистка зубов');
    const upcoming = items.find((item: { source: string }) => item.source === 'vaccination');

    expect(missed.overdue).toBe(true);
    expect(upcoming.date).toBe('2026-10-01');
    expect(upcoming.overdue).toBe(false);
  });

  it('narrows to one pet on request', async () => {
    const other = await asUser(test, cookie, {
      method: 'POST',
      url: '/api/v1/pets',
      payload: { name: 'Мурка', species: 'cat' },
    });

    const response = await get(
      `/agenda?from=2026-09-01&to=2026-12-31&petId=${other.json().pet.id}`,
    );
    expect(response.json().items).toHaveLength(0);
  });

  it('drops the older record when a vaccine is given again', async () => {
    await post(`/pets/${petId}/vaccinations`, {
      vaccineCode: 'rabies',
      administeredOn: '2026-09-05',
    });

    const response = await get('/agenda?from=2026-09-01&to=2027-12-31');
    const dues = response
      .json()
      .items.filter((item: { source: string }) => item.source === 'vaccination');

    // The superseded row's due date is a phantom; only the latest still means anything.
    expect(dues).toHaveLength(1);
    expect(dues[0].date).toBe('2027-09-05');
  });
});

describe('the calendar feed', () => {
  async function calendarToken(): Promise<string> {
    const household = await get(`/households/${householdId}`);
    const url: string = household.json().household.calendarUrl;
    return url.split('/').pop()!.replace('.ics', '');
  }

  beforeEach(async () => {
    await post('/events', {
      petId,
      type: 'grooming',
      title: 'Груминг',
      scheduledOn: '2026-09-25',
    });
  });

  it('serves an iCalendar document without a session', async () => {
    const token = await calendarToken();
    const response = await test.app.inject({ method: 'GET', url: `/api/v1/calendar/${token}.ics` });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/calendar');
    expect(response.body).toContain('BEGIN:VCALENDAR');
    expect(response.body).toContain('SUMMARY:Рекс: Груминг');
    expect(response.body).toContain('BEGIN:VALARM');
  });

  it('refuses an unknown token', async () => {
    const response = await test.app.inject({
      method: 'GET',
      url: '/api/v1/calendar/not-a-real-token.ics',
    });
    expect(response.statusCode).toBe(404);
  });

  it('stops working once the token is rotated', async () => {
    const token = await calendarToken();
    await asUser(test, cookie, {
      method: 'POST',
      url: `/api/v1/households/${householdId}/calendar-token`,
    });

    const response = await test.app.inject({ method: 'GET', url: `/api/v1/calendar/${token}.ics` });
    expect(response.statusCode).toBe(404);
  });

  it('carries titles and dates but no medical detail', async () => {
    await post(`/pets/${petId}/health-flags`, {
      kind: 'allergy',
      label: 'Курица',
      severity: 'high',
    });
    await post(`/pets/${petId}/visits`, {
      visitedOn: '2026-08-01',
      reason: 'Хромота',
      findings: 'Растяжение связок',
    });

    const token = await calendarToken();
    const response = await test.app.inject({ method: 'GET', url: `/api/v1/calendar/${token}.ics` });

    expect(response.body).not.toContain('Растяжение');
    expect(response.body).not.toContain('Курица');
  });
});

describe('medication', () => {
  it('expands a course into doses and tracks them', async () => {
    const created = await post(`/pets/${petId}/medications`, {
      name: 'Синулокс',
      dose: '250 мг',
      timesPerDay: 2,
      startsOn: '2026-09-08',
      endsOn: '2026-09-12',
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().doseCount).toBe(10);

    const listed = await get(`/pets/${petId}/medications`);
    const course = listed.json().medications[0];
    expect(course.progress).toMatchObject({ total: 10, taken: 0, missed: 0 });

    const taken = await post(`/medications/${course.id}/doses/${course.doses[0].id}/taken`, {});
    expect(taken.statusCode).toBe(200);

    const after = await get(`/pets/${petId}/medications`);
    expect(after.json().medications[0].progress.taken).toBe(1);
  });

  it('gives an open-ended course no checklist', async () => {
    const created = await post(`/pets/${petId}/medications`, {
      name: 'Кардиопрепарат',
      timesPerDay: 1,
      startsOn: '2026-09-08',
    });
    expect(created.json().doseCount).toBe(0);
  });

  it('lets a dose ticked by mistake be un-ticked', async () => {
    const created = await post(`/pets/${petId}/medications`, {
      name: 'Синулокс',
      timesPerDay: 1,
      startsOn: '2026-09-08',
      endsOn: '2026-09-09',
    });
    const listed = await get(`/pets/${petId}/medications`);
    const course = listed.json().medications[0];

    await post(`/medications/${course.id}/doses/${course.doses[0].id}/taken`, {});
    await asUser(test, cookie, {
      method: 'DELETE',
      url: `/api/v1/medications/${course.id}/doses/${course.doses[0].id}/taken`,
    });

    const after = await get(`/pets/${petId}/medications`);
    expect(after.json().medications[0].progress.taken).toBe(0);
  });
});

describe('export', () => {
  it('hands back everything the household holds', async () => {
    await post(`/pets/${petId}/vaccinations`, {
      vaccineCode: 'rabies',
      administeredOn: '2025-10-01',
    });
    await post('/contacts', { kind: 'clinic', name: 'Ветклиника на Ленина' });

    const response = await get('/export');
    const payload = response.json();

    expect(response.headers['content-disposition']).toContain('attachment');
    expect(payload.pets).toHaveLength(1);
    expect(payload.vaccinations).toHaveLength(1);
    expect(payload.contacts).toHaveLength(1);
    expect(payload.household.id).toBe(householdId);
  });
});
