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
```

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
- **Uploaded images are stripped of EXIF, GPS included, before storage.** A pet photo
  taken at home carries the owner's address.
- **Storage is raw, presentation converts.** Weights are stored in kilograms and lengths in
  centimetres; kg/lb and cm/in are a display concern in `packages/core` formatters. Storing
  a converted value breaks every past reading.
- **Deploy by pushing to `main`.** A manual `flyctl deploy` races the CI deployment — the
  sibling bot in this workspace lost its machine to exactly that.
- **The app does not give medical advice.** No symptom checking, no diagnosis, no dosage
  recommendation. Built-in schedules are reminder defaults the owner can edit.

## Repository language

English for everything repository-facing: code, identifiers, comments, README, commit
messages. UI strings are localised — Russian by default, English available.
