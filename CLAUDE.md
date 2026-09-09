# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

Self-hosted web application for pet owners: identity papers, medical record, body
measurements and care schedule. TypeScript monorepo on npm workspaces, served as one
origin (Fastify serves both the API and the built SPA). **`docs/SPEC.md` is the contract**
— read it before adding anything, and update it when a decision changes.

## Build & test

```bash
npm install
npm test                  # vitest
npm run typecheck         # tsc --build across the workspace
npm run format:check      # prettier
npm run api:dev           # Fastify with reload
npm run web               # Vite dev server, proxying /api to the backend
npm run build             # production bundle of apps/web
npm run local             # one process, one origin — the shape production runs in
npm run capture           # seed a demo household and photograph every screen
```

`npm run local` is worth using before a deploy: development runs two servers behind a
proxy, which is convenient but not what ships, and the single-origin path has broken on its
own before. `npm run capture` needs `npm run local` already running.

Run one test: `npx vitest run -t "<name>"`.

TypeScript runs unbundled through `tsx`: imports inside the workspace are extensionless,
which plain `node` cannot resolve. Use the scripts, not `node src/…`.

## Architecture invariant

"Clean core + thin layer", as in the sibling projects in this workspace.

- **Core (unit-tested, no I/O):** `packages/core` — dates and recurrence, scheduling,
  validation, unit conversion, measurement series, ICS generation, and the zod schemas
  shared by the API and the web client. `packages/catalog` — reference data only, no
  computation. Neither may import a DOM, a network client, a database or `node:fs`.
  New rules belong here.
- **Thin layer:** `apps/api/src/routes` and `apps/web/src/{components,pages}`. Routes
  parse, call a domain function and map errors; components render and delegate.
- **Between the two:** `apps/api/src/domain` owns session state and file storage,
  `apps/web/src/lib` owns presentation logic. Both are unit-tested and both delegate every
  domain question to `packages/core`.

## Gotchas — do not regress

- **Two kinds of recurrence, and they are not interchangeable.** `fixed_calendar` repeats
  from an anchor date; `after_completion` repeats from when the event was actually marked
  done. Antiparasitic treatment and nail trims need the second — scheduling them from the
  planned date silently drifts wrong. An `after_completion` rule cannot be expressed as an
  ICS `RRULE`; it is emitted as a single dated event on purpose.
- **`GET /agenda` and the ICS feed must both go through `collectSeries`.** Merging
  scheduled events with dates derived from `next_due_at` and document expiry happens once,
  in `packages/core/src/agenda.ts`; `buildAgenda` and `buildCalendarEvents` are two
  projections of its output. Two merges would let the calendar and the app disagree, and
  `agenda.test.ts` asserts they produce the same dates for a rule that has to be expanded.
- **Derived reminders are not rows.** A document expiry and a `next_due_at` produce agenda
  items by computation, not by inserting a `CareEvent`. Materialising them creates
  duplicates that outlive the record they came from.
- **Dates without a time stay strings.** Birthdays and expiry dates are `YYYY-MM-DD` and
  are never round-tripped through a `Date` in a local time zone — that is how a birthday
  moves by a day.
- **Month arithmetic must be end-of-month safe.** "Three months after 31 August" is
  30 November, not 1 December. `29 February` anniversaries fall on 28 February in common
  years. Both are unit-tested; keep them so.
- **The agenda window starts today, so anything overdue must be carried into it.**
  `datesInWindow` pulls an unmet date forward — at most one occurrence per recurring
  series. Without it the home screen looks reassuringly empty while hiding exactly what is
  late.
- **`@theme` cannot be nested in a media query.** Tailwind 4 hoists the declarations out,
  so a `@theme` inside `prefers-color-scheme: dark` silently overwrites the light palette
  instead of qualifying it, and light mode ceases to exist. Dark mode overrides the emitted
  variables with ordinary CSS in `styles.css`.
- **`CREATE TABLE IF NOT EXISTS` never alters an existing table.** Adding a column to the
  DDL alone does nothing to a deployed database, and the first index or query touching it
  fails at boot — that took the live instance down once. `migrate` runs tables, then
  `ensureColumns` (derived from the Drizzle schema), then indexes. Tests that start from an
  empty database cannot catch this; `tests/migrate.test.ts` starts from an older one.
- **Fastify allows one not-found handler per prefix.** `buildApp` owns it, and decides
  between a JSON 404 and the SPA shell by looking at `WEB_DIST` and the path. Registering a
  second one anywhere crashes the server at boot — a path that only runs in production,
  which is why `tests/spa.test.ts` exists.
- **Uploaded images are stripped of EXIF, GPS included, before storage.** A pet photo
  taken at home carries the owner's address.
- **Three public surfaces, three disclosure levels, all deliberate.** Calendar feed: titles
  and dates. Lost tag: what the owner typed, no medical record, no microchip. Sitter link:
  allergies, ration and doses, because somebody is holding the animal — read-only, scoped to
  chosen pets, and expiring. Widening any of them is a decision, not a convenience.
- **The lost tag and the emergency card disclose different things on purpose.** The tag is
  public and shows only what the owner typed; nothing is read from the medical record and
  the microchip is omitted. The card is handed over in person and carries all of it. Do not
  "helpfully" add allergies to the public page — a free-text note is the owner's choice and
  the only thing that belongs there.
- **A public page serves its photo by token, never by file id.** Handing out a file id lets
  a stranger walk the household's other files.
- **Printing is the browser's job.** The print routes render a sheet and call `window.print`;
  `?preview` suppresses the dialog. A PDF library would have to be taught to embed Cyrillic
  fonts and would get it subtly wrong.
- **A `<select>` must contain the value it is bound to.** `Intl.supportedValuesOf('timeZone')`
  omits `UTC`, which is what every household starts on, so the control displayed its first
  entry — Africa/Abidjan — and saving the form without touching the field would have moved
  the household there. `optionsIncluding` in `apps/web/src/lib/format.ts` is the guard;
  use it for anything filled from an `Intl` list.
- **Storage is raw, presentation converts.** Weights are stored in kilograms and lengths in
  centimetres; kg/lb and cm/in are a display concern in `packages/core` formatters. Storing
  a converted value breaks every past reading.
- **Deploy by pushing to `main`.** A manual `flyctl deploy` races the CI deployment — the
  sibling bot in this workspace lost its machine to exactly that.
- **Reference ranges come from the laboratory's form, never from the application.** They
  differ between laboratories, species and machines. `lab_values` stores the range per
  reading for that reason, and a value with no range gets no verdict rather than a guessed
  one.
- **Push is the second reminder channel and must stay optional.** No VAPID keys means no
  push and no error. The sweep only runs while the process is awake, which a suspending
  machine is not, so `POST /push/dispatch` exists for an external scheduler. A reminder is
  written to `push_log` once per user per item per day: sending twice teaches the owner to
  ignore the first one.
- **The app does not give medical advice.** No symptom checking, no diagnosis, no dosage
  recommendation. Built-in schedules are reminder defaults the owner can edit.

## Repository language

English for everything repository-facing: code, identifiers, comments, README, commit
messages. UI strings are localised — Russian by default, English available.
