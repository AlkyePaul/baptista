-- Baptista: dedicated schema in the Supabase project shared with GuideApp.
-- public, mosquitos and 7sapp belong to other apps and are not touched.
--
-- Fail-closed by design (docs/architecture/SECURITY.md):
--   * anon gets no access to the schema at all;
--   * authenticated/service_role only get USAGE: every table must still receive
--     explicit, minimal grants plus RLS in the migration that creates it;
--   * no ALTER DEFAULT PRIVILEGES, so future tables are never exposed implicitly
--     (unlike the broad defaults used by the mosquitos/7sapp schemas).

create schema if not exists baptista authorization postgres;

comment on schema baptista is
  'Baptista home OS. Isolated from GuideApp (public). Grants are explicit per object; RLS on every table.';

revoke all on schema baptista from public;
revoke all on schema baptista from anon;

grant usage on schema baptista to authenticated, service_role;
