/**
 * Seeds a demo household and photographs the result.
 *
 * Used for the README screenshots and as a smoke test of the built application: it drives
 * the real front end against the real API, so a screen that throws on render fails here
 * rather than in front of someone.
 *
 * Usage: start the server with WEB_DIST pointing at a built apps/web, then
 *   node tools/capture.mjs [http://127.0.0.1:5199] [docs/screenshots]
 *
 * COLOR_SCHEME=dark photographs the dark palette into docs/screenshots/dark instead.
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:5199';
const SCHEME = process.env.COLOR_SCHEME === 'dark' ? 'dark' : 'light';

// The default output follows the scheme. When it did not, a dark run with no path argument
// quietly wrote dark images over the light set, and the difference is only visible by
// opening them.
const OUT = process.argv[3] ?? (SCHEME === 'dark' ? 'docs/screenshots/dark' : 'docs/screenshots');

const account = {
  email: `demo+${Date.now()}@example.com`,
  password: 'a long enough passphrase',
  displayName: 'Демо',
};

/** Dates relative to today, so the seeded household always looks alive. */
const today = new Date();
const shift = (days) => {
  const date = new Date(today);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

let cookie = '';

async function call(path, options = {}) {
  const response = await fetch(`${BASE}/api/v1${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];

  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} → ${response.status} ${await response.text()}`,
    );
  }
  return response.status === 204 ? null : response.json();
}

async function seed() {
  await call('/auth/register', { method: 'POST', body: account });

  const { pet: rex } = await call('/pets', {
    method: 'POST',
    body: {
      name: 'Рекс',
      species: 'dog',
      breed: 'Лабрадор-ретривер',
      sex: 'male',
      colour: 'Палевый',
      birthDate: shift(-2158),
      microchip: '643094100123456',
      neutered: true,
      neuteredOn: shift(-1800),
    },
  });

  const { pet: musya } = await call('/pets', {
    method: 'POST',
    body: {
      name: 'Муся',
      species: 'cat',
      breed: 'British shorthair',
      sex: 'female',
      birthDate: shift(-1100),
      birthPrecision: 'month',
    },
  });

  await call(`/pets/${rex.id}/health-flags`, {
    method: 'POST',
    body: { kind: 'allergy', label: 'Курица', severity: 'high' },
  });

  await call(`/pets/${rex.id}/vaccinations`, {
    method: 'POST',
    body: { vaccineCode: 'rabies', administeredOn: shift(-340), productName: 'Нобивак Rabies' },
  });
  await call(`/pets/${rex.id}/vaccinations`, {
    method: 'POST',
    body: { vaccineCode: 'dhppi', administeredOn: shift(-340) },
  });
  await call(`/pets/${rex.id}/parasite-treatments`, {
    method: 'POST',
    body: { target: 'internal', administeredOn: shift(-95), productName: 'Мильбемакс' },
  });
  await call(`/pets/${rex.id}/parasite-treatments`, {
    method: 'POST',
    body: { target: 'external', administeredOn: shift(-20), productName: 'Бравекто' },
  });

  await call(`/pets/${rex.id}/visits`, {
    method: 'POST',
    body: {
      visitedOn: shift(-60),
      reason: 'Хромота на переднюю лапу',
      findings: 'Растяжение связок, перелома нет',
      treatment: 'Покой 10 дней, противовоспалительное',
      cost: 4200,
    },
  });

  await call(`/pets/${rex.id}/medications`, {
    method: 'POST',
    body: {
      name: 'Синулокс',
      dose: '250 мг',
      timesPerDay: 2,
      startsOn: shift(-3),
      endsOn: shift(4),
    },
  });

  const weights = [
    [-370, 29.4],
    [-280, 30.1],
    [-190, 31.6],
    [-120, 32.8],
    [-60, 33.9],
    [-5, 34.4],
  ];
  for (const [days, value] of weights) {
    await call(`/pets/${rex.id}/measurements`, {
      method: 'POST',
      body: { metric: 'weight', measuredOn: shift(days), value },
    });
  }
  await call(`/pets/${rex.id}/targets`, {
    method: 'PUT',
    body: { metric: 'weight', min: 29, max: 33 },
  });

  for (const [metric, value, days] of [
    ['chest_girth', 78, -30],
    ['neck_girth', 48, -30],
    ['back_length', 62, -200],
    ['bcs', 6, -5],
  ]) {
    await call(`/pets/${rex.id}/measurements`, {
      method: 'POST',
      body: { metric, measuredOn: shift(days), value },
    });
  }

  await call(`/pets/${rex.id}/food`, {
    method: 'POST',
    body: {
      brand: 'Acana',
      name: 'Adult Large Breed',
      weightGrams: 11400,
      dailyGrams: 420,
      openedOn: shift(-19),
      price: 6800,
    },
  });

  for (const [category, amount, days, note] of [
    ['grooming', 2500, -12, 'Стрижка когтей и уши'],
    ['accessories', 3400, -40, 'Шлейка'],
    ['medication', 1250, -3, 'Синулокс'],
    ['insurance', 9600, -120, 'Полис на год'],
  ]) {
    await call('/expenses', {
      method: 'POST',
      body: { category, amount, spentOn: shift(days), petId: rex.id, note },
    });
  }

  for (const [analyte, unit, refMin, refMax, points] of [
    [
      'Creatinine',
      'µmol/L',
      44,
      159,
      [
        [-400, 88],
        [-190, 104],
        [-30, 143],
      ],
    ],
    [
      'Urea',
      'mmol/L',
      2.5,
      9.6,
      [
        [-400, 5.1],
        [-190, 6.4],
        [-30, 8.2],
      ],
    ],
  ]) {
    for (const [days, value] of points) {
      await call(`/pets/${rex.id}/labs`, {
        method: 'POST',
        body: {
          analyte,
          value,
          unit,
          measuredOn: shift(days),
          referenceMin: refMin,
          referenceMax: refMax,
        },
      });
    }
  }

  await call(`/pets/${rex.id}/documents`, {
    method: 'POST',
    body: { kind: 'vet_passport', title: 'Ветпаспорт', expiresOn: shift(38) },
  });

  await call('/events', {
    method: 'POST',
    body: {
      petId: rex.id,
      type: 'nail_trim',
      title: 'Постричь когти',
      scheduledOn: shift(-2),
      recurrence: { kind: 'after_completion', interval: 6, unit: 'week', anchor: shift(-2) },
    },
  });
  await call('/events', {
    method: 'POST',
    body: {
      petId: musya.id,
      type: 'grooming',
      title: 'Вычесать подшёрсток',
      scheduledOn: shift(6),
    },
  });
  await call('/events', {
    method: 'POST',
    body: {
      petId: rex.id,
      type: 'checkup',
      title: 'Годовая диспансеризация',
      scheduledOn: shift(21),
      recurrence: { kind: 'fixed_calendar', interval: 1, unit: 'year', anchor: shift(21) },
    },
  });

  const tag = await call(`/pets/${rex.id}/lost-tag`, {
    method: 'PUT',
    body: {
      contactName: 'Алек',
      contactPhone: '+7 999 123-45-67',
      note: 'Боится людей — не ловите, позвоните',
    },
  });

  await call('/contacts', {
    method: 'POST',
    body: {
      kind: 'clinic',
      name: 'Ветклиника «Айболит»',
      phone: '+7 999 123-45-67',
      address: 'ул. Ленина, 14',
      favourite: true,
    },
  });
  await call('/contacts', {
    method: 'POST',
    body: { kind: 'groomer', name: 'Салон «Пушистик»', phone: '+7 999 765-43-21' },
  });

  const sitter = await call('/sitter-links', {
    method: 'POST',
    body: { label: 'Соседка Ира', expiresOn: shift(12), petIds: [rex.id] },
  });

  return { rex, musya, tag, sitter };
}

async function main() {
  const { rex, tag, sitter } = await seed();
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 2,
    locale: 'ru-RU',
    colorScheme: SCHEME,
    // A phone is where this application is actually used.
    isMobile: true,
    hasTouch: true,
  });

  await context.addCookies([
    { name: cookie.split('=')[0], value: cookie.split('=')[1], url: BASE },
  ]);

  const page = await context.newPage();
  const problems = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(String(error)));

  const shoot = async (path, name, waitFor) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    if (waitFor) await page.waitForSelector(waitFor, { timeout: 10_000 });
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log(`${name}.png`);
  };

  await shoot('/', 'agenda', 'text=Просрочено');
  await shoot('/pets', 'pets', 'text=Рекс');
  await shoot(`/pets/${rex.id}`, 'pet-profile', 'text=Курица');
  await shoot(`/pets/${rex.id}/medical`, 'medical', 'text=Прививки');
  await shoot(`/pets/${rex.id}/measurements`, 'measurements', 'svg');
  await shoot(`/pets/${rex.id}/food`, 'food', 'text=Открытая пачка');
  await shoot('/expenses', 'expenses', 'text=Всего');
  await shoot('/settings', 'settings', 'text=Подписка на календарь');
  await shoot(`/pets/${rex.id}/labs`, 'labs', 'text=Creatinine');
  await shoot(`/pets/${rex.id}/print/card?preview`, 'emergency-card', 'text=Аллергия');
  await shoot(`/pets/${rex.id}/print/tag?preview`, 'lost-tag', 'svg');

  // The public page, seen by a stranger with no session at all.
  const anonymous = await browser.newContext({
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 2,
    locale: 'ru-RU',
    colorScheme: SCHEME,
    isMobile: true,
    hasTouch: true,
  });
  const strangerPage = await anonymous.newPage();
  strangerPage.on('pageerror', (error) => problems.push(String(error)));
  await strangerPage.goto(new URL(tag.url).pathname.replace(/^/, BASE), {
    waitUntil: 'networkidle',
  });
  await strangerPage.waitForSelector('text=Я потерялся', { timeout: 10_000 });
  await strangerPage.screenshot({ path: `${OUT}/found.png` });
  console.log('found.png');

  await strangerPage.goto(new URL(sitter.url).pathname.replace(/^/, BASE), {
    waitUntil: 'networkidle',
  });
  await strangerPage.waitForSelector('text=Чем кормить', { timeout: 10_000 });
  await strangerPage.screenshot({ path: `${OUT}/sitter.png`, fullPage: true });
  console.log('sitter.png');

  await anonymous.close();

  await browser.close();

  if (problems.length > 0) {
    console.error(`\n${problems.length} console problems:`);
    for (const problem of problems.slice(0, 10)) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log('\nno console errors');
}

await main();
