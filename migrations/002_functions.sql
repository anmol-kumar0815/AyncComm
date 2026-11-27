-- 002_functions.sql
-- Server-side logic the client calls via supabase.rpc(). Everything that touches
-- more than one table (accepting a friend, opening a chat, building the chat
-- list) lives here so it is atomic and needs no loosened RLS.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.my_email()
returns text language sql stable
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id and cp.user_id = auth.uid()
  )
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friends f
    where (f.user_id = a and f.friend_id = b) or (f.user_id = b and f.friend_id = a)
  )
$$;

-- Object paths in the chat-media bucket look like "<conversation_id>/<file>".
-- Returns the conversation id, or NULL if the path is not in that shape.
create or replace function public.chat_media_conversation(p_path text)
returns uuid
language sql immutable
as $$
  select case
    when split_part(p_path, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_path, '/', 1)::uuid
    else null
  end
$$;

-- ---------------------------------------------------------------------------
-- Login: does this email already have a password? (used by the sign-in screen
-- to choose between "enter password" and "we'll email you a link").
-- Callable while signed out. Returns only a boolean.
-- ---------------------------------------------------------------------------
create or replace function public.email_has_password(p_email text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(bool_or(p.has_password), false)
  from public.profiles p
  where lower(p.email) = lower(btrim(p_email))
$$;

-- ---------------------------------------------------------------------------
-- Friends
-- ---------------------------------------------------------------------------
create or replace function public.accept_friend_request(p_request_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r  public.friend_requests;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  select * into r from public.friend_requests
  where id = p_request_id and status = 'pending' and lower(receiver_email) = public.my_email()
  for update;
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;

  update public.friend_requests set status = 'accepted' where id = r.id;

  if not public.are_friends(me, r.sender_id) then
    insert into public.friends (user_id, friend_id) values (me, r.sender_id);
  end if;
end;
$$;

create or replace function public.decline_friend_request(p_request_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  update public.friend_requests set status = 'rejected'
  where id = p_request_id and status = 'pending' and lower(receiver_email) = public.my_email();
end;
$$;

-- Returns one of: sent | accepted | already_pending | already_friends | self | invalid_email
-- 'accepted' means the other person had already invited you, so you're now friends.
create or replace function public.send_friend_request(p_email text)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  me        uuid := auth.uid();
  target    text := lower(btrim(coalesce(p_email, '')));
  target_id uuid;
  r         public.friend_requests;
  new_id    uuid;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if target !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then return 'invalid_email'; end if;
  if target = public.my_email() then return 'self'; end if;

  select id into target_id from public.profiles where lower(email) = target;

  if target_id is not null then
    if public.are_friends(me, target_id) then return 'already_friends'; end if;

    -- They already invited me: sending an invite back just accepts theirs.
    select * into r from public.friend_requests
    where sender_id = target_id and lower(receiver_email) = public.my_email() and status = 'pending'
    limit 1;
    if found then
      perform public.accept_friend_request(r.id);
      return 'accepted';
    end if;
  end if;

  insert into public.friend_requests (sender_id, receiver_email, status)
  values (me, target, 'pending')
  on conflict (sender_id, receiver_email)
  do update set status = 'pending', created_at = now()
     where public.friend_requests.status <> 'pending'
  returning id into new_id;

  if new_id is null then return 'already_pending'; end if;
  return 'sent';
end;
$$;

create or replace function public.get_pending_requests()
returns table (
  id           uuid,
  created_at   timestamptz,
  sender_id    uuid,
  sender_email text,
  sender_name  text
)
language sql stable security definer
set search_path = public
as $$
  select fr.id, fr.created_at, fr.sender_id, p.email, coalesce(nullif(p.display_name, ''), split_part(p.email, '@', 1))
  from public.friend_requests fr
  join public.profiles p on p.id = fr.sender_id
  where fr.status = 'pending'
    and lower(fr.receiver_email) = public.my_email()
    and auth.uid() is not null
  order by fr.created_at desc
$$;

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------
-- The one direct conversation between me and a friend (oldest wins if a race
-- once created duplicates). NULL if none yet.
create or replace function public.direct_conversation_id(p_me uuid, p_other uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select c.id
  from public.conversations c
  join public.conversation_participants a on a.conversation_id = c.id and a.user_id = p_me
  join public.conversation_participants b on b.conversation_id = c.id and b.user_id = p_other
  order by c.created_at, c.id
  limit 1
$$;

create or replace function public.get_or_create_conversation(p_friend_id uuid)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  cid uuid;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not public.are_friends(me, p_friend_id) then
    raise exception 'not friends' using errcode = '42501';
  end if;

  -- Serialise concurrent "open chat" calls for the same pair.
  perform pg_advisory_xact_lock(hashtextextended(least(me, p_friend_id)::text || greatest(me, p_friend_id)::text, 0));

  cid := public.direct_conversation_id(me, p_friend_id);
  if cid is null then
    insert into public.conversations default values returning id into cid;
    insert into public.conversation_participants (conversation_id, user_id)
    values (cid, me), (cid, p_friend_id);
  end if;
  return cid;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language sql security definer
set search_path = public
as $$
  update public.conversation_participants
  set last_read_at = greatest(last_read_at, now())
  where conversation_id = p_conversation_id and user_id = auth.uid()
$$;

-- One row per friend: who they are, the conversation (if any), the latest
-- message and how many of their messages I haven't read. One round trip.
-- (re)created by 004 with more columns; dropping first lets 002 be re-run before 004 without a type clash
drop function if exists public.get_chat_list();
create function public.get_chat_list()
returns table (
  friend_id                uuid,
  friend_email             text,
  friend_name              text,
  conversation_id          uuid,
  last_message_id          uuid,
  last_message_type        text,
  last_message_content     text,
  last_message_sender_id   uuid,
  last_message_duration_ms integer,
  last_message_at          timestamptz,
  unread_count             integer
)
language sql stable security definer
set search_path = public
as $$
  with me as (select auth.uid() as id),
  friend_ids as (
    select case when f.user_id = me.id then f.friend_id else f.user_id end as fid
    from public.friends f, me
    where me.id is not null and (f.user_id = me.id or f.friend_id = me.id)
  )
  select
    p.id,
    p.email,
    coalesce(nullif(p.display_name, ''), split_part(p.email, '@', 1)),
    conv.conversation_id,
    lm.id,
    lm.media_type,
    left(lm.content, 200),
    lm.sender_id,
    lm.media_duration_ms,
    lm.created_at,
    coalesce(un.cnt, 0)::integer
  from friend_ids fi
  join public.profiles p on p.id = fi.fid
  cross join me
  left join lateral (
    select cp.conversation_id, cp.last_read_at
    from public.conversation_participants cp
    join public.conversation_participants cp2
      on cp2.conversation_id = cp.conversation_id and cp2.user_id = p.id
    join public.conversations c on c.id = cp.conversation_id
    where cp.user_id = me.id
    order by c.created_at, c.id
    limit 1
  ) conv on true
  left join lateral (
    select m.id, m.media_type, m.content, m.sender_id, m.media_duration_ms, m.created_at
    from public.messages m
    where m.conversation_id = conv.conversation_id
    order by m.created_at desc, m.id desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*) as cnt
    from public.messages m
    where m.conversation_id = conv.conversation_id
      and m.sender_id <> me.id
      and m.created_at > conv.last_read_at
  ) un on true
  order by lm.created_at desc nulls last, lower(coalesce(nullif(p.display_name, ''), p.email))
$$;

-- ---------------------------------------------------------------------------
-- Execute privileges: signed-in users only (email_has_password also anon).
-- Explicit per function so unrelated functions in `public` are left alone.
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'email_has_password(text)', 'accept_friend_request(uuid)', 'decline_friend_request(uuid)',
    'send_friend_request(text)', 'get_pending_requests()', 'direct_conversation_id(uuid,uuid)',
    'get_or_create_conversation(uuid)', 'mark_conversation_read(uuid)', 'get_chat_list()',
    'is_conversation_member(uuid)', 'are_friends(uuid,uuid)', 'chat_media_conversation(text)', 'my_email()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
  end loop;
end $$;

grant execute on function public.email_has_password(text)            to anon, authenticated;
grant execute on function public.accept_friend_request(uuid)         to authenticated;
grant execute on function public.decline_friend_request(uuid)        to authenticated;
grant execute on function public.send_friend_request(text)           to authenticated;
grant execute on function public.get_pending_requests()              to authenticated;
grant execute on function public.get_or_create_conversation(uuid)    to authenticated;
grant execute on function public.mark_conversation_read(uuid)        to authenticated;
grant execute on function public.get_chat_list()                     to authenticated;
-- Used inside RLS policies, which evaluate as the calling role.
grant execute on function public.is_conversation_member(uuid)        to authenticated;
grant execute on function public.chat_media_conversation(text)       to authenticated;
grant execute on function public.my_email()                          to authenticated;
-- direct_conversation_id and are_friends are internal: only callable from the
-- SECURITY DEFINER functions above (which run as the owner).
