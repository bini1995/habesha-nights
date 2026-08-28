create extension if not exists pgcrypto;

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  short_code text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.event_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.organizers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text,
  instagram text,
  website text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id),
  name text not null,
  address text not null,
  neighborhood text,
  website text,
  created_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id),
  name text not null,
  category text not null,
  description text not null,
  neighborhood text,
  address text,
  website text,
  instagram text,
  image_url text,
  promoted boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  city_id uuid not null references public.cities(id),
  category_id uuid not null references public.event_categories(id),
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue_name text not null,
  venue_address text not null,
  venue_neighborhood text,
  ticket_price_label text,
  ticket_url text,
  instagram text,
  image_url text,
  organizer_name text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  status text not null default 'pending' check (status in ('draft', 'pending', 'approved', 'rejected')),
  review_notes text,
  reviewed_at timestamptz,
  approved_event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text not null,
  description text not null,
  city_id uuid not null references public.cities(id),
  venue_id uuid not null references public.venues(id),
  category_id uuid not null references public.event_categories(id),
  organizer_id uuid not null references public.organizers(id),
  starts_at timestamptz not null,
  ends_at timestamptz,
  image_url text,
  ticket_url text,
  ticket_price_cents integer check (ticket_price_cents is null or ticket_price_cents >= 0),
  ticket_price_label text,
  featured boolean not null default false,
  promoted boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  check (ends_at is null or ends_at > starts_at)
);

alter table public.submissions
  add constraint submissions_approved_event_id_fkey
  foreign key (approved_event_id) references public.events(id);

create table public.outbound_clicks (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  destination_url text not null,
  referrer text,
  user_agent text,
  ip_hash text,
  clicked_at timestamptz not null default now()
);

create index events_public_catalog_idx on public.events (status, starts_at, promoted, featured);
create index events_city_idx on public.events (city_id);
create index submissions_moderation_idx on public.submissions (status, created_at);
create index outbound_clicks_event_idx on public.outbound_clicks (event_id, clicked_at);
create index businesses_catalog_idx on public.businesses (status, city_id, promoted);

insert into public.cities (id, name, slug, short_code) values
  ('00000000-0000-4000-8000-000000000101', 'New York City', 'new-york-city', 'NYC'),
  ('00000000-0000-4000-8000-000000000102', 'Washington, DC / DMV', 'washington-dc-dmv', 'DMV')
on conflict (slug) do nothing;

insert into public.event_categories (id, name, slug, sort_order) values
  ('00000000-0000-4000-8000-000000000201', 'Nightlife', 'nightlife', 10),
  ('00000000-0000-4000-8000-000000000202', 'Live Music', 'live-music', 20),
  ('00000000-0000-4000-8000-000000000203', 'Culture', 'culture', 30),
  ('00000000-0000-4000-8000-000000000204', 'Food', 'food', 40),
  ('00000000-0000-4000-8000-000000000205', 'Community', 'community', 50),
  ('00000000-0000-4000-8000-000000000206', 'Festivals', 'festivals', 60),
  ('00000000-0000-4000-8000-000000000207', 'Comedy', 'comedy', 70),
  ('00000000-0000-4000-8000-000000000208', 'Networking', 'networking', 80)
on conflict (slug) do nothing;

alter table public.cities enable row level security;
alter table public.event_categories enable row level security;
alter table public.organizers enable row level security;
alter table public.venues enable row level security;
alter table public.businesses enable row level security;
alter table public.submissions enable row level security;
alter table public.events enable row level security;
alter table public.outbound_clicks enable row level security;

revoke all on table public.cities, public.event_categories, public.organizers,
  public.venues, public.businesses, public.submissions, public.events,
  public.outbound_clicks from anon, authenticated;
grant select, insert, update, delete on table public.cities, public.event_categories,
  public.organizers, public.venues, public.businesses, public.submissions,
  public.events, public.outbound_clicks to service_role;
grant usage, select on sequence public.outbound_clicks_id_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-flyers', 'event-flyers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.approve_event_submission(p_submission_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  submitted public.submissions%rowtype;
  new_organizer_id uuid;
  new_venue_id uuid;
  new_event_id uuid;
  event_slug text;
begin
  select * into submitted
  from public.submissions
  where id = p_submission_id
  for update;

  if submitted.id is null then
    raise exception 'Submission not found';
  end if;
  if submitted.status <> 'pending' then
    raise exception 'Only pending submissions can be approved';
  end if;

  insert into public.organizers (name, email, phone, instagram)
  values (submitted.organizer_name, lower(submitted.contact_email), submitted.contact_phone, submitted.instagram)
  on conflict (email) do update set
    name = excluded.name,
    phone = coalesce(excluded.phone, public.organizers.phone),
    instagram = coalesce(excluded.instagram, public.organizers.instagram),
    updated_at = now()
  returning id into new_organizer_id;

  insert into public.venues (city_id, name, address, neighborhood)
  values (submitted.city_id, submitted.venue_name, submitted.venue_address, submitted.venue_neighborhood)
  returning id into new_venue_id;

  event_slug := trim(both '-' from regexp_replace(lower(submitted.title), '[^a-z0-9]+', '-', 'g'))
    || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.events (
    slug, title, summary, description, city_id, venue_id, category_id,
    organizer_id, starts_at, ends_at, image_url, ticket_url,
    ticket_price_label, status, published_at
  ) values (
    event_slug, submitted.title, left(submitted.description, 240), submitted.description,
    submitted.city_id, new_venue_id, submitted.category_id, new_organizer_id,
    submitted.starts_at, submitted.ends_at, submitted.image_url,
    submitted.ticket_url, submitted.ticket_price_label, 'approved', now()
  ) returning id into new_event_id;

  update public.submissions set
    status = 'approved',
    approved_event_id = new_event_id,
    reviewed_at = now(),
    updated_at = now()
  where id = submitted.id;

  return new_event_id;
end;
$$;

revoke all on function public.approve_event_submission(uuid) from public, anon, authenticated;
grant execute on function public.approve_event_submission(uuid) to service_role;
