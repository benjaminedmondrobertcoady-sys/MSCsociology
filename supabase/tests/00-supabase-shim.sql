-- Minimal stand-ins for the Supabase-provided pieces, so schema.sql can be
-- executed against vanilla Postgres for validation.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create role anon;
create role authenticated;
