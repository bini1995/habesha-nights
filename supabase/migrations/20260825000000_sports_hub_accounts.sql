begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.sports_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (
    char_length(trim(display_name)) between 1 and 80
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sports_leagues (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  schema_version text not null default 'sports-hub-hosted-league/1.0',
  name text not null check (char_length(trim(name)) between 1 and 80),
  sport text not null check (sport in ('FOOTBALL', 'BASKETBALL', 'SOCCER')),
  status text not null default 'DRAFT' check (
    status in ('DRAFT', 'IN_PROGRESS', 'COMPLETE', 'ARCHIVED')
  ),
  scoring_period_count smallint not null check (
    scoring_period_count between 1 and 52
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sports_league_members (
  league_id uuid not null references public.sports_leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  display_name text not null check (
    char_length(trim(display_name)) between 1 and 50
  ),
  role text not null check (role in ('OWNER', 'MEMBER')),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create unique index sports_league_one_owner
  on public.sports_league_members (league_id)
  where role = 'OWNER';

create table public.sports_league_invites (
  league_id uuid primary key references public.sports_leagues(id) on delete cascade,
  invite_code_digest text not null unique check (
    invite_code_digest ~ '^[0-9a-f]{64}$'
  ),
  rotated_at timestamptz not null default now()
);

create table public.sports_league_matchups (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.sports_leagues(id) on delete cascade,
  scoring_period smallint not null check (scoring_period between 1 and 52),
  home_user_id uuid not null,
  away_user_id uuid not null,
  home_points numeric(10, 2) check (home_points between 0 and 10000),
  away_points numeric(10, 2) check (away_points between 0 and 10000),
  scored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_matchup_distinct_users check (home_user_id <> away_user_id),
  constraint sports_matchup_complete_score check (
    (home_points is null and away_points is null and scored_at is null) or
    (home_points is not null and away_points is not null and scored_at is not null)
  ),
  foreign key (league_id, home_user_id)
    references public.sports_league_members(league_id, user_id) on delete restrict,
  foreign key (league_id, away_user_id)
    references public.sports_league_members(league_id, user_id) on delete restrict,
  unique (league_id, id),
  unique (league_id, scoring_period, home_user_id, away_user_id)
);

create table public.sports_score_proposals (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.sports_leagues(id) on delete cascade,
  matchup_id uuid not null,
  proposed_by_user_id uuid not null,
  home_points numeric(10, 2) not null check (home_points between 0 and 10000),
  away_points numeric(10, 2) not null check (away_points between 0 and 10000),
  status text not null default 'PENDING' check (
    status in ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED')
  ),
  resolved_by_user_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint sports_proposal_resolution_state check (
    (status = 'PENDING' and resolved_by_user_id is null and resolved_at is null) or
    (status <> 'PENDING' and resolved_by_user_id is not null and resolved_at is not null)
  ),
  foreign key (league_id, proposed_by_user_id)
    references public.sports_league_members(league_id, user_id) on delete restrict,
  foreign key (league_id, resolved_by_user_id)
    references public.sports_league_members(league_id, user_id) on delete restrict,
  foreign key (league_id, matchup_id)
    references public.sports_league_matchups(league_id, id) on delete cascade
);

create unique index sports_one_pending_proposal_per_manager
  on public.sports_score_proposals (matchup_id, proposed_by_user_id)
  where status = 'PENDING';

create table public.sports_league_events (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.sports_leagues(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 80),
  actor_user_id uuid,
  matchup_id uuid references public.sports_league_matchups(id) on delete set null,
  proposal_id uuid references public.sports_score_proposals(id) on delete set null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default now()
);

create index sports_members_by_user
  on public.sports_league_members (user_id, joined_at desc);
create index sports_matchups_by_league_period
  on public.sports_league_matchups (league_id, scoring_period);
create index sports_proposals_by_league_status
  on public.sports_score_proposals (league_id, status, created_at desc);
create index sports_events_by_league_time
  on public.sports_league_events (league_id, occurred_at desc);

create or replace function public.sports_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sports_profiles_updated_at
before update on public.sports_profiles
for each row execute function public.sports_set_updated_at();

create trigger sports_leagues_updated_at
before update on public.sports_leagues
for each row execute function public.sports_set_updated_at();

create trigger sports_matchups_updated_at
before update on public.sports_league_matchups
for each row execute function public.sports_set_updated_at();

create or replace function public.sports_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  initial_name text;
begin
  initial_name := left(trim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    split_part(coalesce(new.email, ''), '@', 1),
    'Manager'
  )), 80);
  if initial_name = '' then initial_name := 'Manager'; end if;
  insert into public.sports_profiles (user_id, display_name)
  values (new.id, initial_name)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger sports_profile_after_auth_user
after insert on auth.users
for each row execute function public.sports_handle_new_user();

create or replace function public.sports_is_league_member(target_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.sports_league_members membership
    where membership.league_id = target_league_id
      and membership.user_id = (select auth.uid())
  );
$$;

create or replace function public.sports_is_league_owner(target_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.sports_leagues league
    where league.id = target_league_id
      and league.owner_user_id = (select auth.uid())
  );
$$;

create or replace function public.create_sports_league(
  league_name text,
  league_sport text,
  scoring_periods integer,
  manager_display_name text,
  invite_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_code text := regexp_replace(upper(trim(invite_code)), '[ -]', '', 'g');
  normalized_sport text := upper(trim(league_sport));
  created_league_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if char_length(trim(league_name)) not between 1 and 80 then
    raise exception 'League name must be 1 to 80 characters.' using errcode = '22023';
  end if;
  if char_length(trim(manager_display_name)) not between 1 and 50 then
    raise exception 'Manager name must be 1 to 50 characters.' using errcode = '22023';
  end if;
  if normalized_sport not in ('FOOTBALL', 'BASKETBALL', 'SOCCER') then
    raise exception 'Unsupported sport.' using errcode = '22023';
  end if;
  if scoring_periods not between 1 and 52 then
    raise exception 'Scoring periods must be between 1 and 52.' using errcode = '22023';
  end if;
  if normalized_code !~ '^[A-HJ-NP-Z2-9]{8}$' then
    raise exception 'Invite code must be 8 valid characters.' using errcode = '22023';
  end if;

  insert into public.sports_profiles (user_id, display_name)
  values (current_user_id, trim(manager_display_name))
  on conflict (user_id) do nothing;

  insert into public.sports_leagues (
    owner_user_id, name, sport, scoring_period_count
  ) values (
    current_user_id, trim(league_name), normalized_sport, scoring_periods
  ) returning id into created_league_id;

  insert into public.sports_league_members (
    league_id, user_id, display_name, role
  ) values (
    created_league_id, current_user_id, trim(manager_display_name), 'OWNER'
  );

  insert into public.sports_league_invites (league_id, invite_code_digest)
  values (
    created_league_id,
    encode(extensions.digest(normalized_code, 'sha256'), 'hex')
  );

  return created_league_id;
end;
$$;

create or replace function public.join_sports_league(
  invite_code text,
  manager_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_code text := regexp_replace(upper(trim(invite_code)), '[ -]', '', 'g');
  target_league_id uuid;
  manager_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if char_length(trim(manager_display_name)) not between 1 and 50 then
    raise exception 'Manager name must be 1 to 50 characters.' using errcode = '22023';
  end if;
  if normalized_code !~ '^[A-HJ-NP-Z2-9]{8}$' then
    raise exception 'Invite code must be 8 valid characters.' using errcode = '22023';
  end if;

  select league.id into target_league_id
  from public.sports_league_invites invite
  join public.sports_leagues league on league.id = invite.league_id
  where invite.invite_code_digest =
    encode(extensions.digest(normalized_code, 'sha256'), 'hex')
    and league.status = 'DRAFT'
  for update of league;

  if target_league_id is null then
    raise exception 'League code is invalid or scoring already started.'
      using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.sports_league_members
    where league_id = target_league_id and user_id = current_user_id
  ) then
    return target_league_id;
  end if;

  select count(*) into manager_count
  from public.sports_league_members
  where league_id = target_league_id;
  if manager_count >= 12 then
    raise exception 'This league already has 12 managers.' using errcode = '23514';
  end if;

  insert into public.sports_profiles (user_id, display_name)
  values (current_user_id, trim(manager_display_name))
  on conflict (user_id) do nothing;

  insert into public.sports_league_members (
    league_id, user_id, display_name, role
  ) values (
    target_league_id, current_user_id, trim(manager_display_name), 'MEMBER'
  );
  return target_league_id;
end;
$$;

create or replace function public.propose_sports_score(
  target_matchup_id uuid,
  proposed_home_points numeric,
  proposed_away_points numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_league_id uuid;
  home_user_id uuid;
  away_user_id uuid;
  created_proposal_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if proposed_home_points not between 0 and 10000 or
      proposed_away_points not between 0 and 10000 then
    raise exception 'Official points must be between 0 and 10000.'
      using errcode = '22023';
  end if;

  select matchup.league_id, matchup.home_user_id, matchup.away_user_id
  into target_league_id, home_user_id, away_user_id
  from public.sports_league_matchups matchup
  join public.sports_leagues league on league.id = matchup.league_id
  where matchup.id = target_matchup_id and league.status <> 'ARCHIVED'
  for update of matchup;

  if target_league_id is null then
    raise exception 'Matchup not found.' using errcode = 'P0002';
  end if;
  if current_user_id not in (home_user_id, away_user_id) then
    raise exception 'Only a matchup participant can propose its score.'
      using errcode = '42501';
  end if;
  if exists (
    select 1 from public.sports_score_proposals proposal
    where proposal.matchup_id = target_matchup_id
      and proposal.proposed_by_user_id = current_user_id
      and proposal.status = 'PENDING'
  ) then
    raise exception 'You already have a pending proposal for this matchup.'
      using errcode = '23505';
  end if;

  insert into public.sports_score_proposals (
    league_id,
    matchup_id,
    proposed_by_user_id,
    home_points,
    away_points
  ) values (
    target_league_id,
    target_matchup_id,
    current_user_id,
    proposed_home_points,
    proposed_away_points
  ) returning id into created_proposal_id;

  insert into public.sports_league_events (
    league_id, event_type, actor_user_id, matchup_id, proposal_id, details
  ) values (
    target_league_id,
    'SCORE_PROPOSED',
    current_user_id,
    target_matchup_id,
    created_proposal_id,
    jsonb_build_object(
      'homePoints', proposed_home_points,
      'awayPoints', proposed_away_points
    )
  );

  return created_proposal_id;
end;
$$;

create or replace function public.resolve_sports_score_proposal(
  target_proposal_id uuid,
  decision text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_decision text := upper(trim(decision));
  target_league_id uuid;
  target_matchup_id uuid;
  proposed_home_points numeric(10, 2);
  proposed_away_points numeric(10, 2);
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if normalized_decision not in ('APPROVE', 'REJECT') then
    raise exception 'Decision must be APPROVE or REJECT.' using errcode = '22023';
  end if;

  select proposal.league_id, proposal.matchup_id,
    proposal.home_points, proposal.away_points
  into target_league_id, target_matchup_id,
    proposed_home_points, proposed_away_points
  from public.sports_score_proposals proposal
  join public.sports_league_matchups matchup on matchup.id = proposal.matchup_id
  where proposal.id = target_proposal_id and proposal.status = 'PENDING'
  for update of proposal, matchup;

  if target_league_id is null then
    raise exception 'Pending score proposal not found.' using errcode = 'P0002';
  end if;
  if not public.sports_is_league_owner(target_league_id) then
    raise exception 'Only the league owner can resolve score proposals.'
      using errcode = '42501';
  end if;

  if normalized_decision = 'APPROVE' then
    update public.sports_league_matchups
    set home_points = proposed_home_points,
      away_points = proposed_away_points,
      scored_at = now()
    where id = target_matchup_id;

    update public.sports_leagues
    set status = 'IN_PROGRESS'
    where id = target_league_id and status = 'DRAFT';

    update public.sports_score_proposals
    set status = 'SUPERSEDED',
      resolved_by_user_id = current_user_id,
      resolved_at = now()
    where matchup_id = target_matchup_id
      and id <> target_proposal_id
      and status = 'PENDING';
  end if;

  update public.sports_score_proposals
  set status = case
      when normalized_decision = 'APPROVE' then 'APPROVED'
      else 'REJECTED'
    end,
    resolved_by_user_id = current_user_id,
    resolved_at = now()
  where id = target_proposal_id;

  insert into public.sports_league_events (
    league_id, event_type, actor_user_id, matchup_id, proposal_id, details
  ) values (
    target_league_id,
    case
      when normalized_decision = 'APPROVE' then 'SCORE_PROPOSAL_APPROVED'
      else 'SCORE_PROPOSAL_REJECTED'
    end,
    current_user_id,
    target_matchup_id,
    target_proposal_id,
    jsonb_build_object(
      'homePoints', proposed_home_points,
      'awayPoints', proposed_away_points
    )
  );

  return target_proposal_id;
end;
$$;

alter table public.sports_profiles enable row level security;
alter table public.sports_leagues enable row level security;
alter table public.sports_league_members enable row level security;
alter table public.sports_league_invites enable row level security;
alter table public.sports_league_matchups enable row level security;
alter table public.sports_score_proposals enable row level security;
alter table public.sports_league_events enable row level security;

revoke all on table public.sports_profiles from anon, authenticated;
revoke all on table public.sports_leagues from anon, authenticated;
revoke all on table public.sports_league_members from anon, authenticated;
revoke all on table public.sports_league_invites from anon, authenticated;
revoke all on table public.sports_league_matchups from anon, authenticated;
revoke all on table public.sports_score_proposals from anon, authenticated;
revoke all on table public.sports_league_events from anon, authenticated;

grant select, insert, update, delete on public.sports_profiles to authenticated;
grant select on public.sports_leagues to authenticated;
grant select on public.sports_league_members to authenticated;
grant select on public.sports_league_invites to authenticated;
grant select on public.sports_league_matchups to authenticated;
grant select on public.sports_score_proposals to authenticated;
grant select on public.sports_league_events to authenticated;

create policy sports_profiles_select_own
on public.sports_profiles for select to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()));

create policy sports_profiles_insert_own
on public.sports_profiles for insert to authenticated
with check ((select auth.uid()) is not null and user_id = (select auth.uid()));

create policy sports_profiles_update_own
on public.sports_profiles for update to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()))
with check ((select auth.uid()) is not null and user_id = (select auth.uid()));

create policy sports_profiles_delete_own
on public.sports_profiles for delete to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()));

create policy sports_leagues_select_member
on public.sports_leagues for select to authenticated
using (
  (select auth.uid()) is not null and (
    owner_user_id = (select auth.uid()) or public.sports_is_league_member(id)
  )
);

create policy sports_leagues_update_owner
on public.sports_leagues for update to authenticated
using (public.sports_is_league_owner(id))
with check (public.sports_is_league_owner(id));

create policy sports_leagues_delete_owner
on public.sports_leagues for delete to authenticated
using (public.sports_is_league_owner(id));

create policy sports_members_select_member
on public.sports_league_members for select to authenticated
using (public.sports_is_league_member(league_id));

create policy sports_members_update_self
on public.sports_league_members for update to authenticated
using (
  public.sports_is_league_member(league_id) and user_id = (select auth.uid())
)
with check (
  public.sports_is_league_member(league_id) and user_id = (select auth.uid())
);

create policy sports_members_delete_member_or_owner
on public.sports_league_members for delete to authenticated
using (
  role = 'MEMBER' and (
    user_id = (select auth.uid()) or public.sports_is_league_owner(league_id)
  )
);

create policy sports_invites_select_owner
on public.sports_league_invites for select to authenticated
using (public.sports_is_league_owner(league_id));

create policy sports_invites_update_owner
on public.sports_league_invites for update to authenticated
using (public.sports_is_league_owner(league_id))
with check (public.sports_is_league_owner(league_id));

create policy sports_matchups_select_member
on public.sports_league_matchups for select to authenticated
using (public.sports_is_league_member(league_id));

create policy sports_matchups_insert_owner
on public.sports_league_matchups for insert to authenticated
with check (public.sports_is_league_owner(league_id));

create policy sports_matchups_update_owner
on public.sports_league_matchups for update to authenticated
using (public.sports_is_league_owner(league_id))
with check (public.sports_is_league_owner(league_id));

create policy sports_matchups_delete_owner
on public.sports_league_matchups for delete to authenticated
using (public.sports_is_league_owner(league_id));

create policy sports_proposals_select_member
on public.sports_score_proposals for select to authenticated
using (public.sports_is_league_member(league_id));

create policy sports_proposals_insert_participant
on public.sports_score_proposals for insert to authenticated
with check (
  (select auth.uid()) is not null and
  proposed_by_user_id = (select auth.uid()) and
  status = 'PENDING' and
  exists (
    select 1 from public.sports_league_matchups matchup
    where matchup.id = sports_score_proposals.matchup_id
      and matchup.league_id = sports_score_proposals.league_id
      and (select auth.uid()) in (matchup.home_user_id, matchup.away_user_id)
  )
);

create policy sports_proposals_update_owner
on public.sports_score_proposals for update to authenticated
using (public.sports_is_league_owner(league_id))
with check (
  public.sports_is_league_owner(league_id) and
  resolved_by_user_id = (select auth.uid())
);

create policy sports_events_select_member
on public.sports_league_events for select to authenticated
using (public.sports_is_league_member(league_id));

revoke all on function public.sports_handle_new_user() from public, anon, authenticated;
revoke all on function public.sports_is_league_member(uuid) from public, anon;
revoke all on function public.sports_is_league_owner(uuid) from public, anon;
revoke all on function public.create_sports_league(text, text, integer, text, text)
  from public, anon;
revoke all on function public.join_sports_league(text, text) from public, anon;
revoke all on function public.propose_sports_score(uuid, numeric, numeric)
  from public, anon;
revoke all on function public.resolve_sports_score_proposal(uuid, text)
  from public, anon;
grant execute on function public.sports_is_league_member(uuid) to authenticated;
grant execute on function public.sports_is_league_owner(uuid) to authenticated;
grant execute on function public.create_sports_league(text, text, integer, text, text)
  to authenticated;
grant execute on function public.join_sports_league(text, text) to authenticated;
grant execute on function public.propose_sports_score(uuid, numeric, numeric)
  to authenticated;
grant execute on function public.resolve_sports_score_proposal(uuid, text)
  to authenticated;

comment on table public.sports_league_invites is
  'Invite digests are owner-only. Raw invite codes are never persisted.';
comment on table public.sports_league_events is
  'Append-only hosted audit receipts. Direct client writes are not granted.';
comment on table public.sports_score_proposals is
  'Manager proposals do not become official matchup scores until owner approval.';

commit;
