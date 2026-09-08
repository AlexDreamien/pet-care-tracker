# pet-care-tracker

A self-hosted web application for pet owners: identity papers, medical record, body
measurements and care schedule in one place — installable to a phone's home screen and
readable without a network connection.

> **Status: in development.** Phase 1 is being built block by block. See
> [`docs/SPEC.md`](docs/SPEC.md) for the full specification and the current scope
> boundary.

## Why

A pet's history is normally scattered across a paper vaccination booklet, a folder of
scans, a notes app and someone's memory. The parts that recur — revaccination,
antiparasitic treatment, document expiry, grooming — are exactly the parts that get
forgotten. This application stores the record and turns the recurring parts into calendar
reminders that arrive whether or not the app is opened.

## Features

- **Profile and documents** — several pets per household, full identity data
  (microchip with format validation, tattoo, pedigree and registration numbers), photos,
  and document files that warn before they expire.
- **Medical record** — vaccinations and antiparasitic treatments with computed next-due
  dates, visits, allergies and chronic conditions flagged on the pet card, medication
  courses with dose tracking.
- **Measurements** — weight, body condition score and girths charted over time against a
  target corridor, plus a size card for buying a harness or a coat.
- **Calendar and reminders** — care events with two kinds of recurrence (fixed calendar
  interval, and interval measured from the last completion), a contact book of vets,
  groomers and trainers, and an ICS feed to subscribe to from a phone's calendar.
- **Works on a phone** — a PWA added to the home screen on iOS and Android; the pet card
  opens offline.

## Not medical advice

The application stores and reminds. It does not diagnose, does not check symptoms and does
not recommend dosages. Built-in vaccination and antiparasitic schedules are defaults for a
reminder, not a medical protocol — the veterinarian decides and the owner edits.

## Tech stack

TypeScript monorepo on npm workspaces.

| Layer          | Stack                                                                |
| -------------- | -------------------------------------------------------------------- |
| Domain logic   | `packages/core` — pure functions, zero I/O, unit-tested              |
| Reference data | `packages/catalog` — vaccine and antiparasitic schedules, BCS scales |
| Backend        | Fastify 5, better-sqlite3, Drizzle ORM, zod, Argon2id, WebAuthn      |
| Front end      | React 19, Vite, Tailwind 4, `vite-plugin-pwa`                        |
| Tests          | Vitest                                                               |
| Deployment     | Fly.io, one machine with a persistent volume                         |

## Development

```bash
npm install
npm test           # vitest
npm run typecheck  # tsc --build across the workspace
npm run api:dev    # Fastify with reload
npm run web        # Vite dev server
npm run build      # production bundle
```

Run a single test: `npx vitest run -t "<name>"`.

## Licence

MIT — see [LICENSE](LICENSE).
