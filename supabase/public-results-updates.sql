-- Allow visitors (anon key) to write scores to match_results, so anyone at the pool can
-- paste the official MyComLink results page into the app without an editor sign-in.
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- To switch it off again: drop the two policies at the bottom.
--
-- Safety notes
--   * the page only ever writes numeric scores for fixture ids it knows; the anon key is public
--     either way (it is in the page), so this policy — not the key — is what decides write access
--   * fixture_id is constrained to the known id shapes so junk rows cannot be inserted
--   * scores are bounded (0..99)

alter table public.match_results enable row level security;

-- Policies only filter what a role is already granted; the anon role needs the table privileges too.
grant select, insert, update on public.match_results to anon;

-- Only sensible rows: known id shape, small non-negative scores.
alter table public.match_results
  drop constraint if exists match_results_sane,
  add constraint match_results_sane check (
    fixture_id ~ '^[a-z0-9]+_G[0-9]{2}(_pen)?$|^[A-D]_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{4}$'
    and (score_a is null or (score_a between 0 and 99))
    and (score_b is null or (score_b between 0 and 99))
  );

drop policy if exists "public insert results" on public.match_results;
create policy "public insert results"
  on public.match_results for insert
  to anon
  with check (true);

drop policy if exists "public update results" on public.match_results;
create policy "public update results"
  on public.match_results for update
  to anon
  using (true)
  with check (true);

-- Editors (signed-in users) need the same reads plus writes. Granting the anon policies alone
-- left the authenticated role without SELECT, so a signed-in editor saw an empty table.
grant select, insert, update on public.match_results to authenticated;

drop policy if exists "authenticated read results" on public.match_results;
create policy "authenticated read results" on public.match_results
  for select to authenticated using (true);

drop policy if exists "authenticated write results" on public.match_results;
create policy "authenticated write results" on public.match_results
  for insert to authenticated with check (true);

drop policy if exists "authenticated update results" on public.match_results;
create policy "authenticated update results" on public.match_results
  for update to authenticated using (true) with check (true);

-- Nobody deletes through the API; corrections are overwrites.
