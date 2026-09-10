# pet-care-tracker — specification

A self-hosted web application for pet owners: one place for a pet's identity papers,
medical history, body measurements and care schedule. Installable to a phone's home
screen as a PWA; readable without a network connection.

This document is the contract the implementation follows. It is written before the code
and updated when a decision changes.

---

## 1. Purpose and non-purpose

**Purpose.** Record what a pet owner would otherwise keep across a paper vaccination
booklet, a folder of scanned documents, a notes app and a calendar — and make the
recurring parts (revaccination, antiparasitic treatment, document expiry, grooming)
arrive as reminders instead of being remembered.

**Non-purpose.** The application stores and reminds. It does not advise. It contains no
symptom checker, no diagnosis, no dosage recommendation and no AI interpretation of
medical data. Built-in vaccination schedules are _defaults for a reminder_, not a
medical protocol; the veterinarian decides, the owner edits. This boundary is stated in
the README and in the UI where schedules are proposed.

---

## 2. Decisions already taken

| Question            | Decision                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data location       | Client + server. SQLite on the server, one deployment, accounts.                                                                                                                            |
| Front end           | React 19 + TypeScript + Vite, Tailwind 4.                                                                                                                                                   |
| Authentication      | Email + password. After the first successful login on a mobile device, the app offers to add a passkey (WebAuthn platform authenticator, Face ID / fingerprint) for fast subsequent logins. |
| Offline             | Read offline, write online. App shell and last-seen data are cached; creating or editing requires connectivity. No write queue, no sync conflicts.                                          |
| Reminders           | ICS calendar feed as the primary channel (subscribed in Google/Apple Calendar); in-app due list as the second. Web push is a later addition, not a dependency.                              |
| Deployment          | Fly.io, one machine with a persistent volume, deployed by pushing to `main`.                                                                                                                |
| Repository language | English — code, identifiers, comments, README, commit messages. UI strings are localised (RU default, EN available).                                                                        |
| Licence             | MIT.                                                                                                                                                                                        |

---

## 3. Scope

### Phase 1 — the four blocks, built in order

1. **Profile and documents** — pets, identity fields, photos, document files with expiry.
2. **Medical record** — vaccinations, antiparasitic treatments, visits, health flags,
   medication courses.
3. **Measurements** — weight, body condition score, girths, charts, target range.
4. **Calendar and reminders** — care events, two kinds of recurrence, ICS feed,
   contacts and appointments.

Each block ships complete: schema, pure domain logic with unit tests, API routes with
route tests, UI, and a README section. Block N is finished before block N+1 starts.

### Phase 2 — shipped

Food tracking with bag-depletion forecasting; expense summaries merged from expense rows,
vet fees and food prices; the QR lost-pet tag with its public page; the printable emergency
card; the temporary sitter link; laboratory results charted against the range printed on
the form; web push as a second reminder channel. PDFs come from the browser's print dialog
rather than a PDF library — "Save as PDF"
embeds the system's Cyrillic fonts correctly, which a JavaScript PDF writer would have to
be taught to do and would get subtly wrong.

### Later — still ahead

Heat and pregnancy cycles.

### Out of scope — not planned

Social feed, chat with a veterinarian, AI symptom checking or diagnosis, breed
recognition from photos, marketplace or affiliate links, GPS tracking, integrations with
specific clinic systems.

---

## 4. Domain model

Identifiers are UUIDv7 strings. Timestamps are stored as UTC ISO-8601. Dates without a
time (a birthday, a document expiry) are stored as `YYYY-MM-DD` and never converted
across time zones.

### Accounts and sharing

- **User** — email, password hash (Argon2id), display name, locale, created at.
- **Credential** — a registered passkey: credential id, public key, signature counter,
  transports, device label, last used at. A user may have several.
- **Session** — hashed token, user, expiry, user agent. Delivered as an `HttpOnly`,
  `Secure`, `SameSite=Lax` cookie.
- **Household** — the ownership boundary. Every pet, contact and uploaded file belongs
  to exactly one household.
- **HouseholdMember** — user × household with a role: `owner`, `editor`, `viewer`.
  Sharing a pet with a partner means adding them to the household.

### Pet

Name, species (`dog`, `cat`, `other` — free-text label for `other`), breed, sex,
colour and markings, date of birth with a precision flag (`exact`, `month`, `year`,
`approximate`), date acquired, microchip number and implant date, tattoo, pedigree
number, registration number, neuter status and date, avatar file, notes,
`archived_at`, `deceased_at`.

Species drives which built-in schedules and which body-condition scale apply. A pet with
species `other` gets no built-in schedules — every recurrence is entered by hand.

### Documents and files

- **StoredFile** — household, original filename, MIME type, size, SHA-256, path on the
  volume, created at. Uploaded images are re-encoded and stripped of EXIF (including GPS)
  on the way in; a thumbnail is generated.
- **Document** — pet, kind (`vet_passport`, `pedigree`, `registration`, `insurance`,
  `travel_certificate`, `purchase_contract`, `lab_result`, `other`), title, issued on,
  **expires on**, file, notes. A document with an expiry date generates a derived
  reminder — it is not duplicated as a calendar row in the database.

### Medical record

- **HealthFlag** — pet, kind (`allergy`, `chronic_condition`, `drug_intolerance`),
  label, severity, notes. Flags are surfaced on the pet header and in the emergency card;
  they are the one piece of medical data shown without being asked for.
- **Vaccination** — pet, vaccine code (from the built-in catalogue) or free text, product
  name, batch number, administered on, **next due on**, administering contact, document,
  notes.
- **ParasiteTreatment** — pet, target (`internal`, `external`, `both`), product,
  administered on, next due on, notes. Modelled separately from vaccination because its
  cadence is short and relative, not annual.
- **VetVisit** — pet, visited on, reason, findings, treatment, cost and currency,
  contact, documents, notes.
- **MedicationCourse** — pet, name, dose text, schedule (times per day, or every N hours),
  start date, end date or duration, notes.
- **MedicationDose** — course, due at, taken at. Doses are generated from the course by
  a pure function and persisted so that "taken" is recordable.

### Measurements

One narrow table, **Measurement** — pet, measured on, metric, value, unit, notes — with
metrics `weight`, `height_withers`, `neck_girth`, `chest_girth`, `back_length`,
`bcs`, `temperature`. A single table keeps charting, export and the addition of a new
metric uniform.

**MeasurementTarget** — pet, metric, target value, acceptable minimum and maximum. Used
to draw the corridor on the chart and to flag a reading outside it.

The current neck girth, chest girth and back length together form the **size card**, the
one screen an owner opens in a shop when buying a harness or a coat.

### The three public surfaces

Each is reached by an opaque token and none needs a session. They exist for different
readers and therefore disclose different things — which is the whole design, not an
oversight.

- **Calendar feed** (`households.calendar_token`) — titles and dates for a calendar client.
  No medical detail.
- **Lost tag** (`pets.lost_token`) — a name, a photo, the owner's chosen contact and a note
  they wrote themselves. Nothing is read from the medical record, and the microchip is
  omitted: a finder cannot use it, a vet scans the animal anyway, and it is a lookup key in
  national registries. The photo is served by tag token, never by file id, so the URL
  cannot be walked into the household's other files.

- **Sitter link** (`sitter_links.token`) — the widest, because someone is holding the
  animal: allergies, the ration, today's doses, upcoming care and the vet. Read-only, scoped
  to the pets the owner selected, dead the day after an expiry date they chose, and
  revocable before then. Those four limits are what make handing it over reasonable.

Every token is replaceable, and replacing one invalidates what was printed, sent or
subscribed — the honest cost of revocation.

### Calendar and contacts

- **Contact** — household, kind (`clinic`, `vet`, `groomer`, `trainer`, `sitter`,
  `taxi`, `other`), name, phone, email, address, website, notes, favourite.
- **CareEvent** — pet, type (`checkup`, `vaccination`, `parasite_treatment`, `grooming`,
  `nail_trim`, `teeth`, `ears`, `bath`, `training`, `boarding`, `other`), title,
  scheduled at, all-day flag, duration, contact, notes, `completed_at`, recurrence.
- **RecurrenceRule** — the part worth getting right. Two kinds:
  - `fixed_calendar` — every N days/weeks/months/years from an anchor date. Used for
    annual revaccination and scheduled appointments.
  - `after_completion` — N days/weeks/months **after the event was last marked done**.
    Used for antiparasitic treatment, nail trims, grooming: what matters is the interval
    since it actually happened, not since it was planned.

  A completed `after_completion` event schedules its successor at completion time. A
  `fixed_calendar` series is expanded on read, never materialised for years ahead.

- **ReminderPreference** — per household and event type: how many days ahead to warn.
- **CalendarFeed** — household, opaque token, revocable. Backs the ICS subscription URL.

---

## 5. Architecture

"Clean core + thin layer", the pattern the sibling projects in this workspace use.

```
packages/core        pure domain logic and shared zod schemas — no I/O, unit-tested
packages/catalog     built-in reference data: vaccines, parasite protocols, BCS scales
apps/api             Fastify + better-sqlite3 + drizzle — thin routes over the core
apps/web             React PWA — thin components over a small presentation-logic layer
```

**`packages/core` may not import a DOM, a network client, a database or `node:fs`.** It is
where every rule lives:

- date arithmetic with precision-aware age, month-end-safe month stepping;
- recurrence: next occurrence for both rule kinds, expansion over a window;
- vaccination and antiparasitic scheduling from species, age and history;
- microchip validation (15-digit ISO 11784/11785, plus legacy 9- and 10-digit formats,
  each labelled by the standard it matches);
- unit conversion and display formatting (kg/lb, cm/in), locale-aware;
- measurement series: latest value, delta since previous, trend, out-of-target detection;
- medication course expansion into doses;
- derived reminders from document expiry and from `next_due_at` fields;
- **ICS generation** — `VEVENT`, `VALARM`, `RRULE`, text escaping, 75-octet line folding,
  UTC stamps. Pure string output, therefore fully testable;
- the zod schemas shared by the API and the web client, so validation cannot drift.

**`apps/api`** parses a request, calls a core function, maps the result. A route holds no
rule of its own. Session state and file storage live in `apps/api/src/domain` and are
unit-tested against a temporary database.

**`apps/web`** keeps presentation logic (pagination, grouping, tone, chart scaling,
formatting) in `src/lib`, unit-tested; components render and delegate. When a component
starts deciding something, the decision moves into `lib`.

The web bundle is served as static files by the same Fastify instance. One origin means
no CORS, a straightforward session cookie, and a service worker with full scope.

---

## 6. Authentication in detail

1. **Registration** — email and password. Password hashed with Argon2id. Minimum length
   12, checked against a small list of the most common passwords; no composition rules.
2. **Login** — email and password, rate-limited per IP and per account, with a growing
   delay after failures. On success a session cookie is issued.
3. **Passkey enrolment** — after a successful password login, if the browser reports a
   platform authenticator and the device looks mobile, the app offers "sign in with
   Face ID / fingerprint next time". Enrolment registers a WebAuthn credential bound to
   the origin. Enrolment is also available from settings on any device.
4. **Passkey login** — a passkey login is a full login; the password remains as the
   fallback and the recovery path.
5. **Recovery** — because no mail service is configured, a single-use recovery code is
   generated at registration and shown once, to be stored by the user. Losing both the
   password and the code means losing access; this is stated plainly at registration.
6. **Sessions** — 30 days, sliding. Revocable individually from settings ("sign out
   everywhere").

---

## 7. HTTP API

REST under `/api/v1`, JSON, session cookie. Errors are `{ error: { code, message } }`
with the code drawn from a closed set. Every route validates its input with the shared
zod schema and authorises against the household of the addressed resource.

```
POST   /auth/register            POST   /auth/login              POST   /auth/logout
GET    /auth/me                  POST   /auth/passkey/register/{options,verify}
POST   /auth/passkey/login/{options,verify}                      GET/DELETE /auth/sessions

GET/POST      /pets              GET/PATCH/DELETE /pets/:id      POST /pets/:id/archive
GET/POST      /pets/:id/documents               GET/PATCH/DELETE /documents/:id
POST          /files             GET /files/:id                  GET /files/:id/thumb

GET/POST      /pets/:id/vaccinations            GET/PATCH/DELETE /vaccinations/:id
GET/POST      /pets/:id/parasite-treatments     …
GET/POST      /pets/:id/visits                  …
GET/POST      /pets/:id/health-flags            …
GET/POST      /pets/:id/medications             POST /medications/:id/doses/:doseId/taken

GET/POST      /pets/:id/measurements            GET/PATCH/DELETE /measurements/:id
GET/PUT       /pets/:id/targets                 GET /pets/:id/size-card

GET/POST      /events            GET/PATCH/DELETE /events/:id    POST /events/:id/complete
GET           /agenda?from&to    — merged view: events, derived due dates, expiries
GET/POST      /contacts          GET/PATCH/DELETE /contacts/:id

GET           /calendar/:token.ics            — public by token, no cookie
GET           /export            — full household export as JSON + files, one archive
```

`GET /agenda` is the endpoint the Today screen and the ICS feed both read. Merging
scheduled events with dates derived from `next_due_at` and document expiry happens in one
pure core function used by both, so the calendar and the app can never disagree.

---

## 8. Progressive web app

- Web app manifest with maskable icons; `display: standalone`; installable on Android via
  Chrome's install prompt and on iOS via _Share → Add to Home Screen_, which is documented
  with screenshots in the README.
- Service worker (`vite-plugin-pwa`, Workbox): app shell precached; `GET /api/**`
  network-first with a cache fallback and a visible "showing data from <time>" banner when
  the fallback is used; images and thumbnails cache-first.
- Mutating requests fail loudly offline with an explanatory message. They are never
  silently queued — that is the scope boundary chosen in section 2.
- Layout is mobile-first; every screen works at 360 px wide and scales up to desktop.

---

## 9. Reminders

The ICS feed is the reliable channel and is treated as a first-class output, not an
export button:

- `GET /calendar/:token.ics` returns the next 12 months of the agenda for a household,
  each item as a `VEVENT` with a `VALARM` at the household's configured lead time.
- Recurring events are emitted with an `RRULE` where the rule is `fixed_calendar`, and as
  a single dated event where it is `after_completion` — an interval measured from an
  unknown future completion cannot be expressed as an `RRULE`, and pretending otherwise
  would produce a wrong calendar.
- The token is revocable and regenerable; the URL grants read access to the agenda only —
  titles and dates, no documents and no medical detail.

The in-app "due" list is the second channel and the source of truth inside the app.

---

## 10. Privacy and data handling

- Uploaded images are stripped of EXIF metadata, GPS included, before storage.
- The full export in section 7 is the user's own copy; a household can be deleted with
  its files in one action.
- The ICS token exposes agenda titles; the emergency card, when it lands, will expose
  what a clinic needs. Everything else requires a session.
- No third-party analytics, no external fonts, no CDN.

---

## 11. Quality bar

- **Tests.** Vitest. Everything in `packages/core` is unit-tested, including edge cases
  that will actually occur: 29 February anniversaries, month-end stepping, a pet whose
  birth date is known only by year, an `after_completion` event completed late.
  API routes are tested against a temporary SQLite file. Web presentation logic in
  `src/lib` is tested; components are not.
- **CI.** GitHub Actions on every push: `format:check`, `typecheck`, `test`, `build`.
- **Deployment.** `fly-deploy.yml` on push to `main`. Manual `flyctl deploy` is not used —
  concurrent deployments race, as recorded for the sibling bot in this workspace.
- **Commits.** Logical increments with meaningful messages, in English.
- **README.** Screenshots of the pet card, the measurement chart and the agenda; feature
  list; installation; the "not medical advice" note; tech stack; tests and CI; licence.

---

## 12. Definition of done for Phase 1

A deployed instance where an owner can: register and add a second household member; create
a pet with full identity data, photo and documents that warn before they expire; record
vaccinations and antiparasitic treatments and see the next due dates computed; record
visits, allergies and a medication course and tick doses off; log weight, BCS and girths,
see them charted against a target corridor and read the size card; schedule recurring care
events of both recurrence kinds, complete them, and subscribe to the resulting calendar
in a phone's calendar app so reminders arrive without opening the application. Installed
to the home screen, the pet card opens without a network connection. Tests and CI green.
