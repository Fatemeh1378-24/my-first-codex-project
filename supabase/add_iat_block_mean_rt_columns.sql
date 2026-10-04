-- Run this migration manually in the Supabase SQL editor before deploying the
-- block-level mean RT output. It changes no task data, RLS policies, or grants.
begin;

alter table public.participants
  add column if not exists block_1_mean_rt double precision,
  add column if not exists block_2_mean_rt double precision,
  add column if not exists block_3_mean_rt double precision,
  add column if not exists block_4_mean_rt double precision,
  add column if not exists block_5_mean_rt double precision,
  add column if not exists block_6_mean_rt double precision,
  add column if not exists block_7_mean_rt double precision;

commit;
