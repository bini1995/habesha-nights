begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

select has_table('public', 'sports_profiles', 'profiles table exists');
select has_table('public', 'sports_leagues', 'leagues table exists');
select has_table('public', 'sports_league_members', 'members table exists');
select has_table('public', 'sports_league_invites', 'invites table exists');
select has_table('public', 'sports_league_matchups', 'matchups table exists');
select has_table('public', 'sports_score_proposals', 'proposals table exists');
select has_table('public', 'sports_league_events', 'events table exists');

select ok((select relrowsecurity from pg_class where oid = 'public.sports_profiles'::regclass), 'profiles RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.sports_leagues'::regclass), 'leagues RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.sports_league_members'::regclass), 'members RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.sports_league_invites'::regclass), 'invites RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.sports_league_matchups'::regclass), 'matchups RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.sports_score_proposals'::regclass), 'proposals RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.sports_league_events'::regclass), 'events RLS enabled');

select has_function('public', 'create_sports_league', array['text', 'text', 'integer', 'text', 'text'], 'atomic create RPC exists');
select has_function('public', 'join_sports_league', array['text', 'text'], 'invite join RPC exists');
select has_function('public', 'propose_sports_score', array['uuid', 'numeric', 'numeric'], 'participant proposal RPC exists');
select has_function('public', 'resolve_sports_score_proposal', array['uuid', 'text'], 'owner approval RPC exists');

select ok(exists(select 1 from pg_policies where policyname = 'sports_leagues_select_member'), 'league membership read policy exists');
select ok(exists(select 1 from pg_policies where policyname = 'sports_leagues_update_owner'), 'league owner update policy exists');
select ok(exists(select 1 from pg_policies where policyname = 'sports_invites_select_owner'), 'invite owner-only policy exists');
select ok(exists(select 1 from pg_policies where policyname = 'sports_proposals_insert_participant'), 'proposal participant policy exists');
select ok(exists(select 1 from pg_policies where policyname = 'sports_proposals_update_owner'), 'proposal owner approval policy exists');
select ok(not has_table_privilege('anon', 'public.sports_leagues', 'SELECT'), 'anonymous role cannot list leagues');

select * from finish();
rollback;
