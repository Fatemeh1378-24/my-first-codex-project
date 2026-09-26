-- Run this migration in the Supabase SQL editor before deploying the updated app.
-- It changes no RLS policies and grants no SELECT permission.
begin;

alter table public.participants
  add column if not exists age integer,
  add column if not exists gender text,
  add column if not exists education_level text,
  add column if not exists employment_status text,
  add column if not exists monthly_income text,
  add column if not exists religiosity text;

-- Remove existing CHECK constraints that validate age, regardless of the old
-- constraint's generated/custom name, then install the final inclusive range.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.participants'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* '\mage\M'
  loop
    execute format('alter table public.participants drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.participants
  add constraint participants_age_20_to_30_check
  check (age between 20 and 30);

commit;

-- Optional cleanup, deliberately not executed: first confirm no older app,
-- view, function, export, or analysis depends on these columns. If safe, run:
-- alter table public.participants drop column if exists nationality;
-- alter table public.participants drop column if exists ethnicity;
