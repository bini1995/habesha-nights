create table public.event_views (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  visitor_id text,
  source text not null default 'direct' check (source in ('instagram', 'tiktok', 'google', 'organizer', 'whatsapp', 'direct', 'other')),
  referrer text,
  user_agent text,
  ip_hash text,
  viewed_at timestamptz not null default now()
);

alter table public.outbound_clicks
  add column source text not null default 'direct'
  check (source in ('instagram', 'tiktok', 'google', 'organizer', 'whatsapp', 'direct', 'other'));

create table public.event_claims (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  contact_name text not null,
  contact_email text not null,
  instagram text,
  relationship text not null,
  correction_notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.promotion_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  event_name text not null,
  organizer_name text not null,
  contact_email text not null,
  instagram text,
  requested_placement text not null default 'weekend_featured'
    check (requested_placement in ('weekend_featured')),
  quoted_price_cents integer not null default 3900 check (quoted_price_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'contacted', 'approved', 'rejected', 'completed')),
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_views_event_idx on public.event_views (event_id, viewed_at);
create index event_views_visitor_idx on public.event_views (visitor_id, viewed_at);
create index event_views_source_idx on public.event_views (source, viewed_at);
create index outbound_clicks_source_idx on public.outbound_clicks (source, clicked_at);
create index event_claims_queue_idx on public.event_claims (status, created_at);
create index promotion_requests_queue_idx on public.promotion_requests (status, created_at);

alter table public.event_views enable row level security;
alter table public.event_claims enable row level security;
alter table public.promotion_requests enable row level security;

revoke all on table public.event_views, public.event_claims, public.promotion_requests from anon, authenticated;
grant select, insert, update, delete on table public.event_views, public.event_claims, public.promotion_requests to service_role;
grant usage, select on sequence public.event_views_id_seq to service_role;

create or replace function public.moderate_event_claim(
  p_claim_id uuid,
  p_status text,
  p_review_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim_event_id uuid;
begin
  if p_status not in ('approved', 'rejected') then
    raise exception 'Claim status must be approved or rejected';
  end if;

  update public.event_claims
  set status = p_status,
      review_notes = nullif(trim(p_review_notes), ''),
      reviewed_at = now(),
      updated_at = now()
  where id = p_claim_id and status = 'pending'
  returning event_id into claim_event_id;

  if claim_event_id is null then
    raise exception 'Pending claim not found';
  end if;

  if p_status = 'approved' then
    update public.organizers
    set verified = true, updated_at = now()
    where id = (select organizer_id from public.events where id = claim_event_id);
  end if;
end;
$$;

revoke all on function public.moderate_event_claim(uuid, text, text) from public, anon, authenticated;
grant execute on function public.moderate_event_claim(uuid, text, text) to service_role;
