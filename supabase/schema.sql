-- ============================================================================
-- EduQuest / MSC Sociology -- Supabase schema
-- ============================================================================
-- Run this ONCE in the Supabase SQL Editor on a fresh project.
-- It is idempotent: safe to re-run.
--
-- Design notes
--   * Student work is written by anonymous browsers. Nothing here trusts the
--     client. Every table has RLS on, and the anon role can INSERT but never
--     SELECT the drop-box tables -- students hand work in, they cannot read
--     anyone else's.
--   * Teachers are real Supabase Auth users listed in the `teachers` table.
--     Everything a teacher can read goes through is_teacher().
--   * Where Firestore used nested subcollections
--     (classes/{c}/students/{s}/sessions/{d}/snapshots) this uses foreign keys.
--   * jsonb is used only where the old shape was genuinely freeform
--     (survey payloads, quiz session blobs). Known shapes get real columns.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Helper: is the caller a teacher?
-- ---------------------------------------------------------------------------

create table if not exists public.teachers (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

-- SECURITY DEFINER so the function can read `teachers` even from a policy
-- evaluated as a low-privilege role. search_path is pinned to stop shadowing.
create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.teachers t where t.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 1. Classes and students
-- ---------------------------------------------------------------------------

create table if not exists public.classes (
  code       text primary key,                       -- e.g. '11SOC'
  name       text,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id            uuid primary key default gen_random_uuid(),
  class_code    text not null references public.classes(code) on delete cascade,
  name          text not null,                       -- stored lowercase, as Firestore did
  display_name  text,
  recovery_code text,
  auth_uid      uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (class_code, name)
);

create index if not exists students_class_idx    on public.students (class_code);
create index if not exists students_auth_uid_idx on public.students (auth_uid);

-- ---------------------------------------------------------------------------
-- 2. Avatars  (fixes the reservation race)
-- ---------------------------------------------------------------------------
-- The Firestore version did read-then-write: getDoc, check if free, setDoc.
-- Two students clicking the same character inside the same tick both read
-- "free" and both wrote. The primary key here makes that impossible, and
-- reserve_avatar() below does the check and the claim in one atomic statement.

create table if not exists public.avatars (
  class_code    text not null references public.classes(code) on delete cascade,
  char_name     text not null,
  student_id    uuid references public.students(id) on delete set null,
  confirmed     boolean not null default false,
  reserved_until timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (class_code, char_name)
);

-- Atomically reserve a character for 30 seconds.
-- Returns true if the caller got it, false if someone else holds it.
create or replace function public.reserve_avatar(
  p_class text,
  p_char  text,
  p_hold  interval default interval '30 seconds'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
begin
  insert into public.avatars (class_code, char_name, reserved_until, confirmed)
  values (p_class, p_char, now() + p_hold, false)
  on conflict (class_code, char_name) do update
    set reserved_until = now() + p_hold,
        updated_at     = now()
    -- only steal it if it is unconfirmed AND the previous hold has lapsed
    where avatars.confirmed = false
      and (avatars.reserved_until is null or avatars.reserved_until < now())
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Hermes: writing sessions, snapshots, sources, documents
-- ---------------------------------------------------------------------------

create table if not exists public.writing_sessions (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  session_date date not null,
  body         text not null default '',
  word_count   integer not null default 0,
  last_active  timestamptz not null default now(),
  unique (student_id, session_date)
);

create index if not exists writing_sessions_student_idx on public.writing_sessions (student_id, session_date desc);

create table if not exists public.snapshots (
  id         bigserial primary key,
  session_id uuid not null references public.writing_sessions(id) on delete cascade,
  word_count integer not null,
  created_at timestamptz not null default now()
);

create index if not exists snapshots_session_idx on public.snapshots (session_id, created_at);

create table if not exists public.sources (
  id         bigserial primary key,
  session_id uuid not null references public.writing_sessions(id) on delete cascade,
  url        text not null,
  noted_at   text,                                   -- the 'hh:mm' string the UI shows
  created_at timestamptz not null default now()
);

create index if not exists sources_session_idx on public.sources (session_id, created_at);

create table if not exists public.documents (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  doc_key    text not null,                          -- the client-side document id
  title      text,
  body       text not null default '',
  updated_at timestamptz not null default now(),
  unique (student_id, doc_key)
);

-- Per-class writing prompt set by the teacher (was classes/{c}/meta/prompt).
create table if not exists public.class_prompts (
  class_code text primary key references public.classes(code) on delete cascade,
  text       text not null default '',
  updated_at timestamptz not null default now()
);

-- Saved quotes (was classes/{c}/students/{s}/meta/quotes).
create table if not exists public.student_quotes (
  student_id uuid primary key references public.students(id) on delete cascade,
  quotes     jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. The Post Box  (the thing that was losing work)
-- ---------------------------------------------------------------------------
-- Hermes' sendToTeacher() only ever called EmailJS. When EmailJS refused --
-- monthly quota, rate limit, blocked network -- the essay existed nowhere but
-- the student's tab. This table is now the source of truth. Email becomes a
-- notification ABOUT a row that is already committed, and may fail freely.

create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  class_code   text not null,
  student_name text not null,
  student_id   uuid references public.students(id) on delete set null,
  word_count   integer not null default 0,
  body         text not null,
  created_at   timestamptz not null default now(),

  -- email is now bookkeeping, not delivery
  email_status text not null default 'pending'
               check (email_status in ('pending','sent','failed','skipped')),
  emailed_at   timestamptz,
  email_error  text,

  -- crude abuse ceiling: the anon key is public, so bound what a stranger can store
  constraint posts_body_len check (char_length(body) <= 200000)
);

create index if not exists posts_class_idx  on public.posts (class_code, created_at desc);
create index if not exists posts_unsent_idx on public.posts (email_status) where email_status = 'pending';

-- ---------------------------------------------------------------------------
-- 5. Writer's Workshop submissions
-- ---------------------------------------------------------------------------

create table if not exists public.submissions (
  id           uuid primary key default gen_random_uuid(),
  class_code   text not null,
  student_name text not null,
  lesson       text not null,
  round        integer not null default 0,
  flag         text check (flag in ('green','amber','red')),
  tags         text[] not null default '{}',
  sentences    jsonb  not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),

  constraint submissions_sentences_len check (pg_column_size(sentences) <= 200000)
);

create index if not exists submissions_class_idx  on public.submissions (class_code, created_at desc);
create index if not exists submissions_lesson_idx on public.submissions (class_code, lesson);

-- ---------------------------------------------------------------------------
-- 6. Surveys
-- ---------------------------------------------------------------------------

create table if not exists public.survey_responses (
  id         uuid primary key default gen_random_uuid(),
  survey_key text not null default 'sociology_survey_2026',
  payload    jsonb not null,
  created_at timestamptz not null default now(),

  constraint survey_payload_len check (pg_column_size(payload) <= 100000)
);

create index if not exists survey_responses_key_idx on public.survey_responses (survey_key, created_at);

-- ---------------------------------------------------------------------------
-- 7. Quiz Town
-- ---------------------------------------------------------------------------

create table if not exists public.quiz_classes (
  id         text primary key,
  name       text,
  students   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_sessions (
  id           text primary key,                     -- 'sess_<ts>_<name>'
  student_name text,
  class_id     text,
  data         jsonb not null,
  created_at   timestamptz not null default now()
);

create index if not exists quiz_sessions_class_idx on public.quiz_sessions (class_id, created_at desc);

create table if not exists public.quiz_card_states (
  quiz_id    text primary key,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 8. Teaching-assistant checklist (was ta_checklist/state in index.html)
-- ---------------------------------------------------------------------------

create table if not exists public.checklist_state (
  key        text primary key,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- The Supabase anon key is public -- it ships inside every HTML file, exactly
-- as the Firebase key did. So the key is not the security boundary; these
-- policies are. Read them as the actual access model.

alter table public.teachers          enable row level security;
alter table public.classes           enable row level security;
alter table public.students          enable row level security;
alter table public.avatars           enable row level security;
alter table public.writing_sessions  enable row level security;
alter table public.snapshots         enable row level security;
alter table public.sources           enable row level security;
alter table public.documents         enable row level security;
alter table public.class_prompts     enable row level security;
alter table public.student_quotes    enable row level security;
alter table public.posts             enable row level security;
alter table public.submissions       enable row level security;
alter table public.survey_responses  enable row level security;
alter table public.quiz_classes      enable row level security;
alter table public.quiz_sessions     enable row level security;
alter table public.quiz_card_states  enable row level security;
alter table public.checklist_state   enable row level security;

-- Supabase normally grants these by default privilege, but state it outright
-- so the schema is self-contained and reviewable. Grants decide whether the
-- role may touch the table at all; the policies below decide which rows.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on function public.is_teacher()   to anon, authenticated;
grant execute on function public.reserve_avatar(text, text, interval) to anon, authenticated;

-- Drop-and-recreate so this file stays re-runnable.
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I',
                   p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- --- teachers -------------------------------------------------------------
-- A teacher may see the roster. Nobody may edit it from the client; add
-- teachers from the SQL editor or the dashboard.
create policy teachers_self_read on public.teachers
  for select using (user_id = auth.uid());

-- --- classes --------------------------------------------------------------
-- Class codes are not secret (students type them in), so reading is open.
create policy classes_read       on public.classes for select using (true);
create policy classes_teacher_rw on public.classes for all
  using (public.is_teacher()) with check (public.is_teacher());

-- --- students -------------------------------------------------------------
-- Sign-up needs to create a row before the student is authenticated, so
-- INSERT is open. Reading is limited to the student themself or a teacher --
-- this is what stops one kid enumerating the class list and recovery codes.
create policy students_insert on public.students
  for insert with check (true);

create policy students_read_own on public.students
  for select using (auth_uid = auth.uid() or public.is_teacher());

create policy students_update_own on public.students
  for update using (auth_uid = auth.uid() or public.is_teacher())
           with check (auth_uid = auth.uid() or public.is_teacher());

-- --- avatars --------------------------------------------------------------
-- The picker has to show what is taken, so SELECT is open; it exposes only a
-- character name and a boolean. Writes go through reserve_avatar().
create policy avatars_read on public.avatars for select using (true);

create policy avatars_write on public.avatars
  for insert with check (true);

create policy avatars_update on public.avatars
  for update using (true) with check (true);

create policy avatars_teacher_delete on public.avatars
  for delete using (public.is_teacher());

-- --- Hermes student work --------------------------------------------------
-- Own-work-only, enforced by joining back to students.auth_uid.
create policy sessions_own on public.writing_sessions
  for all
  using (
    public.is_teacher() or exists (
      select 1 from public.students s
      where s.id = writing_sessions.student_id and s.auth_uid = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.students s
      where s.id = writing_sessions.student_id and s.auth_uid = auth.uid()
    )
  );

create policy snapshots_own on public.snapshots
  for all
  using (
    public.is_teacher() or exists (
      select 1 from public.writing_sessions ws
      join public.students s on s.id = ws.student_id
      where ws.id = snapshots.session_id and s.auth_uid = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.writing_sessions ws
      join public.students s on s.id = ws.student_id
      where ws.id = snapshots.session_id and s.auth_uid = auth.uid()
    )
  );

create policy sources_own on public.sources
  for all
  using (
    public.is_teacher() or exists (
      select 1 from public.writing_sessions ws
      join public.students s on s.id = ws.student_id
      where ws.id = sources.session_id and s.auth_uid = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.writing_sessions ws
      join public.students s on s.id = ws.student_id
      where ws.id = sources.session_id and s.auth_uid = auth.uid()
    )
  );

create policy documents_own on public.documents
  for all
  using (
    public.is_teacher() or exists (
      select 1 from public.students s
      where s.id = documents.student_id and s.auth_uid = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.students s
      where s.id = documents.student_id and s.auth_uid = auth.uid()
    )
  );

create policy quotes_own on public.student_quotes
  for all
  using (
    public.is_teacher() or exists (
      select 1 from public.students s
      where s.id = student_quotes.student_id and s.auth_uid = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.students s
      where s.id = student_quotes.student_id and s.auth_uid = auth.uid()
    )
  );

-- --- class prompts --------------------------------------------------------
create policy prompts_read    on public.class_prompts for select using (true);
create policy prompts_teacher on public.class_prompts for all
  using (public.is_teacher()) with check (public.is_teacher());

-- --- drop boxes: posts, submissions, surveys ------------------------------
-- THE IMPORTANT ONES. Anyone may hand work in. Only a teacher may read it
-- back. No SELECT policy for anon means a student cannot pull the class's
-- essays out with the public key -- the insert succeeds, the read returns
-- nothing.
create policy posts_insert_anyone on public.posts
  for insert with check (true);
create policy posts_teacher_read on public.posts
  for select using (public.is_teacher());
create policy posts_teacher_update on public.posts
  for update using (public.is_teacher()) with check (public.is_teacher());

create policy submissions_insert_anyone on public.submissions
  for insert with check (true);
create policy submissions_teacher_read on public.submissions
  for select using (public.is_teacher());

create policy survey_insert_anyone on public.survey_responses
  for insert with check (true);
create policy survey_teacher_read on public.survey_responses
  for select using (public.is_teacher());

-- --- Quiz Town ------------------------------------------------------------
-- Quiz Town runs a teacher view behind a password prompt in the page itself,
-- which is not real security. Sessions are therefore insert-open/read-teacher
-- like the other drop boxes; class lists and card states stay readable
-- because the student view needs them to render.
create policy quiz_classes_read    on public.quiz_classes for select using (true);
create policy quiz_classes_teacher on public.quiz_classes for all
  using (public.is_teacher()) with check (public.is_teacher());

create policy quiz_sessions_insert on public.quiz_sessions
  for insert with check (true);
create policy quiz_sessions_read on public.quiz_sessions
  for select using (public.is_teacher());

create policy quiz_cards_read  on public.quiz_card_states for select using (true);
create policy quiz_cards_write on public.quiz_card_states
  for all using (true) with check (true);

-- --- checklist ------------------------------------------------------------
create policy checklist_teacher on public.checklist_state for all
  using (public.is_teacher()) with check (public.is_teacher());

-- ============================================================================
-- AFTER RUNNING THIS
-- ============================================================================
-- 1. Create your teacher account (Authentication -> Users -> Add user), then:
--        insert into public.teachers (user_id, email)
--        select id, email from auth.users where email = 'you@example.com';
-- 2. Seed your classes:
--        insert into public.classes (code, name) values ('11SOC','Year 11 Sociology');
-- 3. Settings -> API -> copy the Project URL and the anon key into
--    eduquest-backend.js.
-- ============================================================================
