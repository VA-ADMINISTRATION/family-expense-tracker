-- ============================================================
-- SAFE MIGRATION — does NOT drop or touch any tables/rows.
-- Only updates security policies and adds one new function.
-- Run this in SQL Editor any time real data already exists.
-- ============================================================

-- Replace the two policies that were too open (let any signed-in
-- user browse the full families list, not just their own).
drop policy if exists "families_select" on families;
drop policy if exists "families_update" on families;

create policy "families_select" on families for select to authenticated
  using (is_family_member(families.code));
create policy "families_update" on families for update to authenticated
  using (is_family_member(families.code));

-- New: lets someone look up ONE family by its exact code (needed for
-- "Join with a code") without being able to list/browse all families.
create or replace function public.lookup_family_by_code(p_code text)
returns table(code text, name text)
language sql
security definer
set search_path = public
stable
as $$
  select f.code, f.name from families f where f.code = p_code;
$$;
grant execute on function public.lookup_family_by_code(text) to authenticated;
