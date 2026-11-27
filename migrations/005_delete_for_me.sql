-- 005_delete_for_me.sql
-- "Delete for me": hide a message from *your* view only. The other person keeps it.
-- Run after 004 (always run all files in order, see README).

create table if not exists public.message_hidden (
  message_id  uuid not null references public.messages(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  hidden_at   timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_hidden_user_idx on public.message_hidden (user_id);

alter table public.message_hidden enable row level security;
drop policy if exists message_hidden_select_own on public.message_hidden;
create policy message_hidden_select_own on public.message_hidden
  for select to authenticated using (user_id = auth.uid());
-- Writes go through hide_message() only.
revoke all on public.message_hidden from anon, authenticated;
grant select on public.message_hidden to authenticated;

-- A hidden message is invisible to the person who hid it everywhere: history, realtime, search.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (
    public.is_conversation_member(conversation_id)
    and not exists (
      select 1 from public.message_hidden h
      where h.message_id = messages.id and h.user_id = auth.uid()
    )
  );

-- Anyone in the conversation can hide any message (their own, the other person's,
-- or a "this message was deleted" tombstone) from their own view. Idempotent.
create or replace function public.hide_message(p_message_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select conversation_id into cid from public.messages where id = p_message_id;
  if cid is null or not public.is_conversation_member(cid) then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;
  insert into public.message_hidden (message_id, user_id) values (p_message_id, auth.uid())
  on conflict do nothing;
end;
$$;
revoke execute on function public.hide_message(uuid) from public, anon;
grant execute on function public.hide_message(uuid) to authenticated;

-- The chat list is built by a SECURITY DEFINER function (so it bypasses RLS): it has to skip
-- hidden messages itself, for the preview line and for the unread count.
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
  unread_count             integer,
  friend_last_seen_at      timestamptz,
  last_message_deleted     boolean
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
    coalesce(un.cnt, 0)::integer,
    p.last_seen_at,
    coalesce(lm.deleted_at is not null, false)
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
    select m.id, m.media_type, m.content, m.sender_id, m.media_duration_ms, m.created_at, m.deleted_at
    from public.messages m
    where m.conversation_id = conv.conversation_id
      and not exists (select 1 from public.message_hidden h where h.message_id = m.id and h.user_id = me.id)
    order by m.created_at desc, m.id desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*) as cnt
    from public.messages m
    where m.conversation_id = conv.conversation_id
      and m.sender_id <> me.id
      and m.deleted_at is null
      and m.created_at > conv.last_read_at
      and not exists (select 1 from public.message_hidden h where h.message_id = m.id and h.user_id = me.id)
  ) un on true
  order by lm.created_at desc nulls last, lower(coalesce(nullif(p.display_name, ''), p.email))
$$;
revoke execute on function public.get_chat_list() from public, anon;
grant execute on function public.get_chat_list() to authenticated;

-- Realtime: other tabs of the same account drop the message immediately.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_hidden') then
    alter publication supabase_realtime add table public.message_hidden;
  end if;
end $$;
