import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asUser, makeApp, signUp, type TestApp } from './helpers';

let test: TestApp;
let cookie: string;
let petId: string;

beforeEach(async () => {
  test = await makeApp();
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

const post = (url: string, payload: Record<string, unknown>) =>
  asUser(test, cookie, { method: 'POST', url: `/api/v1${url}`, payload });
const get = (url: string) => asUser(test, cookie, { method: 'GET', url: `/api/v1${url}` });

const creatinine = {
  analyte: 'Creatinine',
  value: 96,
  unit: 'µmol/L',
  measuredOn: '2026-03-01',
  referenceMin: 44,
  referenceMax: 159,
};

describe('recording a result', () => {
  it('stores the value with the range from the form', async () => {
    const response = await post(`/pets/${petId}/labs`, creatinine);
    expect(response.statusCode).toBe(201);
    expect(response.json().value).toMatchObject({ analyte: 'Creatinine', referenceMax: 159 });
  });

  it('accepts a result with no range at all', async () => {
    // Plenty of forms print a value and no range; refusing it would lose the number.
    const response = await post(`/pets/${petId}/labs`, {
      analyte: 'Fructosamine',
      value: 320,
      unit: 'µmol/L',
      measuredOn: '2026-03-01',
    });
    expect(response.statusCode).toBe(201);
  });

  it('refuses a range that is the wrong way round', async () => {
    const response = await post(`/pets/${petId}/labs`, {
      ...creatinine,
      referenceMin: 200,
      referenceMax: 10,
    });
    expect(response.statusCode).toBe(422);
  });

  it('refuses a document belonging to a different animal', async () => {
    const other = await asUser(test, cookie, {
      method: 'POST',
      url: '/api/v1/pets',
      payload: { name: 'Муся', species: 'cat' },
    });
    const document = await post(`/pets/${other.json().pet.id}/documents`, {
      kind: 'lab_result',
      title: 'Биохимия',
    });

    const response = await post(`/pets/${petId}/labs`, {
      ...creatinine,
      documentId: document.json().document.id,
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('reading them back', () => {
  it('groups by analyte and judges the latest against its own range', async () => {
    await post(`/pets/${petId}/labs`, creatinine);
    await post(`/pets/${petId}/labs`, { ...creatinine, value: 180, measuredOn: '2026-09-01' });
    await post(`/pets/${petId}/labs`, {
      analyte: 'Urea',
      value: 6.2,
      unit: 'mmol/L',
      measuredOn: '2026-09-01',
    });

    const response = await get(`/pets/${petId}/labs`);
    const series = response.json().series;

    expect(series.map((entry: { analyte: string }) => entry.analyte)).toEqual([
      'Creatinine',
      'Urea',
    ]);
    expect(series[0].readings).toHaveLength(2);
    expect(series[0].position).toBe('above');
    expect(series[0].reference).toEqual({ min: 44, max: 159 });
    // No range on the form, so no verdict.
    expect(series[1].position).toBeNull();
  });

  it('flags a series recorded in two different units', async () => {
    await post(`/pets/${petId}/labs`, {
      analyte: 'Glucose',
      value: 5.1,
      unit: 'mmol/L',
      measuredOn: '2026-03-01',
    });
    await post(`/pets/${petId}/labs`, {
      analyte: 'Glucose',
      value: 92,
      unit: 'mg/dL',
      measuredOn: '2026-09-01',
    });

    const response = await get(`/pets/${petId}/labs`);
    expect(response.json().series[0].mixedUnits).toBe(true);
  });

  it('offers analyte names so one measure does not become two charts', async () => {
    const response = await get(`/pets/${petId}/labs`);
    expect(response.json().suggestions).toContain('Creatinine');
  });

  it('keeps another household out', async () => {
    await post(`/pets/${petId}/labs`, creatinine);
    const stranger = await signUp(test, { email: 'stranger@example.com' });

    const response = await asUser(test, stranger.cookie, {
      method: 'GET',
      url: `/api/v1/pets/${petId}/labs`,
    });
    expect(response.statusCode).toBe(404);
  });

  it('deletes a value that was typed wrong', async () => {
    const created = await post(`/pets/${petId}/labs`, creatinine);
    await asUser(test, cookie, {
      method: 'DELETE',
      url: `/api/v1/labs/${created.json().value.id}`,
    });

    expect((await get(`/pets/${petId}/labs`)).json().series).toEqual([]);
  });
});
