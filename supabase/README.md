# EduQuest Supabase backend

Replaces the Firebase setup that was losing student work. Nothing here is wired
into the activity pages yet — this is the backend, ready to point at a project.

## Why the move

Three separate failure paths were losing data, in different files:

1. **`index.html`, `sociology-survey-2026.html`, `sociology-survey-results.html`**
   point at project `edquesthermes-d0d7a`; everything else points at
   `eduquesthermes-d0d7a`. The `appId` is identical in both, and an appId belongs
   to exactly one project — so three files were addressing a project that almost
   certainly does not exist.

2. **Failures were silent.** `writers-workshop-eal.html:1751` ends its save with
   `.catch(function(){ })` — an empty catch. The student sees the success state
   while the write goes nowhere.

3. **Hermes' Post Box never touched the database at all.**
   `hermes.html:11945` (`sendToTeacher`) only called EmailJS. When EmailJS
   refused — free tier is 200 emails/month, plus burst rate limiting, and an
   end-of-class rush hits both — the essay existed only in the student's tab.

There's a fourth, quieter signal: `sociology-survey-2026.html:673` sets
`experimentalForceLongPolling: true`. That flag exists to work around networks
that block gRPC/WebSocket — school firewalls, typically. Supabase's REST
interface is ordinary HTTPS, which those networks generally allow.

## What's here

| File | What it is |
|---|---|
| `schema.sql` | Tables, indexes, RLS policies, and `reserve_avatar()`. Idempotent. |
| `../eduquest-backend.js` | One shared client for all the pages, with a durable outbox. |
| `tests/` | The test suite used to validate both. See below. |

## Setup

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. **SQL Editor** → paste `schema.sql` → Run. Safe to re-run.
3. **Authentication → Users → Add user** — create your teacher account.
4. Register it as a teacher, in the SQL editor:
   ```sql
   insert into public.teachers (user_id, email)
   select id, email from auth.users where email = 'you@example.com';
   ```
   Nothing reads student work without a row here.
5. Seed your classes:
   ```sql
   insert into public.classes (code, name)
   values ('11SOC', 'Year 11 Sociology');
   ```
6. **Settings → API** → copy the Project URL and the `anon` public key into the
   `CONFIG` block at the top of `eduquest-backend.js`.

## The access model

The anon key ships inside every HTML file and is readable by anyone — same as
the Firebase key was. **The key is not the security boundary; the RLS policies
are.** The model:

- **Drop boxes** (`posts`, `submissions`, `survey_responses`, `quiz_sessions`):
  anyone may INSERT, only a teacher may SELECT. A student can hand work in and
  cannot read the class's work back, even holding the key.
- **Student work** (`writing_sessions`, `documents`, `sources`, `snapshots`,
  `student_quotes`): readable and writable only by the student who owns it,
  matched on `students.auth_uid = auth.uid()`, plus teachers.
- **`students`**: INSERT is open (sign-up must create the row before the student
  is authenticated), but SELECT is restricted — otherwise one student could
  enumerate the class list *and every recovery code*.

### One consequence worth knowing

Because the drop boxes give anon INSERT but no SELECT, a write must not ask for
the row back. PostgREST turns `.select()` into `INSERT ... RETURNING`, and under
RLS `RETURNING` requires a SELECT policy — so requesting the id makes every
student write fail with *"new row violates row-level security policy"*, even
though the policy is doing its job. `eduquest-backend.js` therefore sends no
`RETURNING` by default; `returning: true` is set only on tables where the caller
is authenticated and can read its own rows. Test 3 in `01-acceptance.sql` pins
this behaviour so it can't regress.

### Known limits

- **No rate limiting on the free tier.** Anyone with the anon key can insert
  junk. There are `CHECK` constraints capping row sizes, but a determined
  stranger could still fill tables. If that ever happens, the fix is a Supabase
  Edge Function in front of the drop boxes, or turning on CAPTCHA protection.
- **Quiz Town's teacher view is gated by a password in the page source**, which
  is not real security. Its sessions are treated as a drop box regardless.

## Running the tests

**Schema** (needs a local Postgres 16; `auth.users` and `auth.uid()` are stubbed
by the shim, since those come from Supabase):

```bash
initdb -D /tmp/pgdata -U postgres
pg_ctl -D /tmp/pgdata -o '-k /tmp -p 5433' start
psql -h /tmp -p 5433 -U postgres -f tests/00-supabase-shim.sql
psql -h /tmp -p 5433 -U postgres -f schema.sql
psql -h /tmp -p 5433 -U postgres -f tests/01-acceptance.sql
```

Covers: a student handing work in; a student failing to read the drop box; the
`RETURNING` trap; a teacher reading everything; a logged-in student still
reading nothing; a student failing to promote themself to teacher; and the
row-size ceiling.

**Outbox** (Node, no network — uses `tests/fake-sdk.mjs`):

```bash
node tests/outbox.test.mjs
```

Covers: a successful save clearing the outbox; a failed save keeping the work
*and refusing to report success*; the work surviving a page reload and syncing
on the next load; and a backlog of three draining together. 16 assertions.

## The durability rule

`eduquest-backend.js` writes every submission into a `localStorage` outbox
**before** any network call, and removes it only when the server confirms the
row. So a dropped connection, a closed tab, or a dead browser doesn't lose work
— it goes up on the next page load.

Nothing is reported as saved until the database says so. `onStatus()` reports
`saving` / `saved` / `queued` / `offline` / `error`, and pages should show
"saved on this device, will sync" for `queued` rather than a success tick. This
is the point of the rewrite: the old code's problem wasn't only that writes
failed, it's that failures were indistinguishable from success.

## Still to do

- Point the eight activity files at this module (not started — the Firebase
  blocks are untouched).
- Migrate existing Firestore data across.
- Decide the fate of the duplicate files: `writers-workshop-eal.html`
  ("Grammar Works") vs `writers-workshop-eal (3).html` ("Writer's Workshop EAL"),
  and `trade-routes.html` vs `trade_routes.html`.
- Lock the allowed origin on the EmailJS dashboard — the public key, service id
  and template id are all in `hermes.html:11954` in a public repo, and anyone
  who finds them can drain the monthly quota.
