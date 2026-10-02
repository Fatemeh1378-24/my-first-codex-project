-- Run in the Supabase SQL editor before deploying the questionnaire flow.
-- JSONB preserves every stable raw response key without creating a new identity.
begin;

alter table public.participants
  add column if not exists sdo_responses jsonb,
  add column if not exists sdo_score numeric,
  add column if not exists mfq_responses jsonb,
  add column if not exists mfq_domain_scores jsonb;

commit;
