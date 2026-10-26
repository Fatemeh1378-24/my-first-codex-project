-- Run once in Supabase SQL Editor before enabling the relay.
-- Does not delete/update results or change grants/RLS. If historical duplicate
-- participant IDs exist this fails safely: inspect them, do not delete blindly.
begin;
create unique index if not exists participants_relay_participant_id_unique
  on public.participants (participant_id);
commit;

-- Read-only verification (run as project administrator in SQL Editor):
-- select participant_id, count(*) from public.participants
-- group by participant_id having count(*) > 1;
-- select indexname, indexdef from pg_indexes
-- where schemaname = 'public' and tablename = 'participants';
