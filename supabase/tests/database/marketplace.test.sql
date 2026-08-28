begin;

create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

select plan(25);

select has_table('public', 'cities', 'cities table exists');
select has_table('public', 'event_categories', 'event categories table exists');
select has_table('public', 'organizers', 'organizers table exists');
select has_table('public', 'venues', 'venues table exists');
select has_table('public', 'businesses', 'businesses table exists');
select has_table('public', 'submissions', 'submissions table exists');
select has_table('public', 'events', 'events table exists');
select has_table('public', 'outbound_clicks', 'outbound clicks table exists');
select has_table('public', 'event_views', 'event views table exists');
select has_table('public', 'event_claims', 'event claims table exists');
select has_table('public', 'promotion_requests', 'promotion requests table exists');
select has_function('public', 'approve_event_submission', array['uuid'], 'approval transaction exists');
select has_function('public', 'moderate_event_claim', array['uuid', 'text', 'text'], 'claim moderation transaction exists');
select has_column('public', 'outbound_clicks', 'source', 'ticket clicks have source attribution');
select results_eq('select count(*)::bigint from public.cities', array[2::bigint], 'NYC and DMV are seeded');
select results_eq('select count(*)::bigint from public.event_categories', array[8::bigint], 'launch categories are seeded');
select results_eq($$select count(*)::bigint from storage.buckets where id = 'event-flyers' and public$$, array[1::bigint], 'public flyer bucket exists');
set local role anon;
select throws_ok('select * from public.submissions', '42501', null, 'anonymous visitors cannot read submissions');
select throws_ok('select * from public.outbound_clicks', '42501', null, 'anonymous visitors cannot read click data');
select throws_ok('select * from public.event_claims', '42501', null, 'anonymous visitors cannot read claim data');
reset role;
set local role service_role;
select lives_ok('select * from public.submissions', 'server service role can access moderation data');
select lives_ok('select * from public.event_claims', 'server service role can access claim data');
reset role;

insert into public.submissions (
  id, title, description, city_id, category_id, starts_at,
  venue_name, venue_address, organizer_name, contact_name, contact_email
) values (
  '11111111-1111-4111-8111-111111111111',
  'Ethiopian New Year DMV',
  'A community celebration with live music and food.',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000206',
  '2026-09-12T22:00:00Z',
  'Community Hall',
  '123 Main Street, Silver Spring, MD',
  'DMV Culture Table',
  'Aster Example',
  'aster@example.com'
);

select lives_ok(
  $$select public.approve_event_submission('11111111-1111-4111-8111-111111111111')$$,
  'pending submission can be approved atomically'
);
select results_eq(
  $$select status from public.submissions where id = '11111111-1111-4111-8111-111111111111'$$,
  array['approved'::text],
  'approval marks the submission approved'
);
select results_eq(
  $$select status from public.events where id = (select approved_event_id from public.submissions where id = '11111111-1111-4111-8111-111111111111')$$,
  array['approved'::text],
  'approval publishes the normalized event'
);

select * from finish();
rollback;
