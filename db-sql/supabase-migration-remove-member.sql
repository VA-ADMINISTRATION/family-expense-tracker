-- ============================================================
-- SAFE MIGRATION — does NOT drop or touch any existing data.
-- Adds: the family creator can remove other members.
-- ============================================================

create or replace function public.is_family_creator(fam_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from families f
    where f.code = fam_code and f.created_by = auth.uid()
  );
$$;
grant execute on function public.is_family_creator(text) to authenticated;

drop policy if exists "members_delete" on members;

create policy "members_delete" on members for delete to authenticated
  using (user_id = auth.uid() OR is_family_creator(members.family_code));
