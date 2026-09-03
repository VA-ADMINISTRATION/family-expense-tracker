-- ============================================================
-- Adds: editable categories (per family), income tracking.
-- Still in setup, so this drops and recreates everything clean.
-- Run this whole script in Supabase → SQL Editor → Run.
-- ============================================================

drop table if exists incomes cascade;
drop table if exists expenses cascade;
drop table if exists categories cascade;
drop table if exists members cascade;
drop table if exists families cascade;

create table families (
  code text primary key,
  name text not null,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id),
  budget_monthly numeric default 0,
  budget_categories jsonb default '{}'::jsonb
);

create table members (
  id bigint generated always as identity primary key,
  family_code text references families(code) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  joined_at timestamptz default now(),
  unique(family_code, user_id)
);

-- Categories are now owned by each family and fully editable.
-- type = 'expense' or 'income' — the same table covers both, so
-- income sources (Salary, Business...) are just categories too.
create table categories (
  id bigint generated always as identity primary key,
  family_code text references families(code) on delete cascade,
  cat_id text not null,        -- short slug used internally, e.g. 'food'
  name text not null,
  icon text not null,
  color text not null,
  type text not null default 'expense',  -- 'expense' | 'income'
  sort_order int default 0,
  created_at timestamptz default now(),
  unique(family_code, cat_id, type)
);

create table expenses (
  id text primary key,
  family_code text references families(code) on delete cascade,
  user_id uuid references auth.users(id),
  user_name text not null,
  date date not null,
  time text,
  category text not null,       -- matches categories.cat_id
  amount numeric not null,
  payment_method text,
  note text,
  split_type text default 'none',
  split_among jsonb default null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table incomes (
  id text primary key,
  family_code text references families(code) on delete cascade,
  user_id uuid references auth.users(id),
  user_name text not null,
  date date not null,
  time text,
  source text not null,         -- matches categories.cat_id where type='income'
  amount numeric not null,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table families enable row level security;
alter table members enable row level security;
alter table categories enable row level security;
alter table expenses enable row level security;
alter table incomes enable row level security;

create policy "families_select" on families for select to authenticated using (true);
create policy "families_insert" on families for insert to authenticated with check (created_by = auth.uid());
create policy "families_update" on families for update to authenticated
  using (exists (select 1 from members m where m.family_code = families.code and m.user_id = auth.uid()));

create policy "members_select" on members for select to authenticated
  using (exists (select 1 from members m2 where m2.family_code = members.family_code and m2.user_id = auth.uid()));
create policy "members_insert" on members for insert to authenticated with check (user_id = auth.uid());
create policy "members_delete" on members for delete to authenticated using (user_id = auth.uid());

create policy "categories_all" on categories for all to authenticated
  using (exists (select 1 from members m where m.family_code = categories.family_code and m.user_id = auth.uid()))
  with check (exists (select 1 from members m where m.family_code = categories.family_code and m.user_id = auth.uid()));

create policy "expenses_all" on expenses for all to authenticated
  using (exists (select 1 from members m where m.family_code = expenses.family_code and m.user_id = auth.uid()))
  with check (exists (select 1 from members m where m.family_code = expenses.family_code and m.user_id = auth.uid()));

create policy "incomes_all" on incomes for all to authenticated
  using (exists (select 1 from members m where m.family_code = incomes.family_code and m.user_id = auth.uid()))
  with check (exists (select 1 from members m where m.family_code = incomes.family_code and m.user_id = auth.uid()));

-- Confirm email stays ON in Authentication → Settings so signups are real.