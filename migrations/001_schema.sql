-- 001_schema.sql
-- Baseline schema + chat media columns. Safe to run on a fresh project AND on
-- the existing one (everything is IF NOT EXISTS / idempotent).
-- Run order: 001 -> 002 -> 003 (see migrations/README.md).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  display_name  text,
  has_password  boolean not null default false,
  created_at    timestamptz not null default now()
);
-- Existing databases may predate these columns.
alter table public.profiles add column if not exists has_password boolean default false;
alter table public.profiles add column if not exists created_at timestamptz default now();
update public.profiles set has_password = false where has_password is null;

create table if not exists public.friend_requests (
  id              uuid primary key default gen_random_uuid(),
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  receiver_email  text not null,
  status          text not null default 'pending',
  created_at      timestamptz not null default now()
);

create table if not exists public.friends (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  friend_id   uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now()
);
alter table public.conversations add column if not exists created_at timestamptz default now();

create table if not exists public.conversation_participants (
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  last_read_at     timestamptz not null default now()
);
alter table public.conversation_participants add column if not exists last_read_at timestamptz not null default now();

create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        uuid not null references public.profiles(id) on delete cascade,
  content          text,
  media_type       text not null default 'text',
  created_at       timestamptz not null default now()
);

-- Chat media: a message is 'text', 'image' or 'audio' (voice note).
-- Media files live in the private `chat-media` bucket; media_path is the object path.
alter table public.messages add column if not exists media_type        text default 'text';
alter table public.messages add column if not exists media_path        text;
alter table public.messages add column if not exists media_mime        text;
alter table public.messages add column if not exists media_duration_ms integer;  -- audio only
alter table public.messages add column if not exists media_width       integer;  -- image only
alter table public.messages add column if not exists media_height      integer;  -- image only
alter table public.messages alter column content drop not null;
update public.messages set media_type = 'text' where media_type is null;

-- ---------------------------------------------------------------------------
-- Constraints (NOT VALID => enforced for new rows without scanning old ones)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'friend_requests_status_chk') then
    alter table public.friend_requests
      add constraint friend_requests_status_chk
      check (status in ('pending', 'accepted', 'rejected')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'messages_shape_chk') then
    alter table public.messages
      add constraint messages_shape_chk check (
        (media_type = 'text'
           and length(btrim(coalesce(content, ''))) > 0
           and length(content) <= 4000
           and media_path is null)
        or
        (media_type in ('image', 'audio')
           and media_path is not null
           and coalesce(length(content), 0) <= 1000)
      ) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create unique index if not exists friend_requests_sender_receiver_uniq
  on public.friend_requests (sender_id, receiver_email);
create index if not exists friend_requests_receiver_idx
  on public.friend_requests (lower(receiver_email)) where status = 'pending';
create unique index if not exists friends_pair_uniq
  on public.friends (least(user_id, friend_id), greatest(user_id, friend_id));
create unique index if not exists conversation_participants_uniq
  on public.conversation_participants (conversation_id, user_id);
create index if not exists conversation_participants_user_idx
  on public.conversation_participants (user_id);
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc, id desc);
create index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));

-- ---------------------------------------------------------------------------
-- New-user trigger: every auth user gets a profile row.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users that signed up before the trigger existed.
insert into public.profiles (id, email, display_name)
select u.id, lower(u.email), split_part(u.email, '@', 1)
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Realtime: messages (live chat), friend_requests / friends (live invites).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['messages', 'friend_requests', 'friends'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
