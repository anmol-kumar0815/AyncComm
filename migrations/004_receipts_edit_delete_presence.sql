-- 004_receipts_edit_delete_presence.sql
-- Delivered/read receipts, editing and deleting messages, last-seen.
-- Run after 003. Idempotent.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.messages add column if not exists delivered_at timestamptz; -- recipient's app received it
alter table public.messages add column if not exists read_at      timestamptz; -- recipient opened the chat
alter table public.messages add column if not exists edited_at    timestamptz;
alter table public.messages add column if not exists deleted_at   timestamptz; -- tombstone: "This message was deleted"
alter table public.profiles add column if not exists last_seen_at timestamptz;

create index if not exists messages_undelivered_idx
  on public.messages (conversation_id) where delivered_at is null;

-- A deleted message keeps its row (so the conversation still reads right) but loses its
-- content and media, so the shape rule must let it through.
alter table public.messages drop constraint if exists messages_shape_chk;
alter table public.messages add constraint messages_shape_chk check (
  deleted_at is not null
  or (media_type = 'text'
        and length(btrim(coalesce(content, ''))) > 0
        and length(content) <= 4000
        and media_path is null)
  or (media_type in ('image', 'audio')
        and media_path is not null
        and coalesce(length(content), 0) <= 1000)
) not valid;

-- Clients may only supply the message itself. Receipts, edit/delete flags and the
-- timestamp are server-controlled (a sender must not be able to forge "read").
revoke insert on public.messages from authenticated;
grant insert (id, conversation_id, sender_id, content, media_type, media_path, media_mime,
              media_duration_ms, media_width, media_height)
  on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- Receipts
-- ---------------------------------------------------------------------------
-- Opening a chat marks the other person's messages read (and delivered, if somehow not yet).
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language sql security definer
set search_path = public
as $$
  update public.conversation_participants
  set last_read_at = greatest(last_read_at, now())
  where conversation_id = p_conversation_id and user_id = auth.uid();

  update public.messages
  set read_at = now(), delivered_at = coalesce(delivered_at, now())
  where conversation_id = p_conversation_id
    and sender_id <> auth.uid()
    and read_at is null
    and public.is_conversation_member(p_conversation_id);
$$;

-- "My app is open and has these messages": stamps everything addressed to me that has no delivered_at.
create or replace function public.mark_messages_delivered()
returns void
language sql security definer
set search_path = public
as $$
  update public.messages m
  set delivered_at = now()
  from public.conversation_participants cp
  where cp.user_id = auth.uid()
    and cp.conversation_id = m.conversation_id
    and m.sender_id <> auth.uid()
    and m.delivered_at is null
$$;

-- ---------------------------------------------------------------------------
-- Edit / delete (the only way to change a message; there is no UPDATE grant)
-- ---------------------------------------------------------------------------
-- Errors are short codes the client turns into plain language:
--   message_not_found | not_editable | edit_window_passed | invalid_content
create or replace function public.edit_message(p_message_id uuid, p_content text)
returns public.messages
language plpgsql security definer
set search_path = public
as $$
declare
  m   public.messages;
  txt text := btrim(coalesce(p_content, ''));
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if txt = '' or length(txt) > 4000 then raise exception 'invalid_content' using errcode = '22023'; end if;

  select * into m from public.messages where id = p_message_id and sender_id = auth.uid() for update;
  if not found then raise exception 'message_not_found' using errcode = 'P0002'; end if;
  if m.deleted_at is not null or m.media_type <> 'text' then raise exception 'not_editable' using errcode = '22023'; end if;
  if m.created_at < now() - interval '15 minutes' then raise exception 'edit_window_passed' using errcode = '22023'; end if;

  if txt = m.content then return m; end if;
  update public.messages set content = txt, edited_at = now() where id = m.id returning * into m;
  return m;
end;
$$;

-- Deletes for everyone. Returns the storage path of the removed photo/voice note (or NULL)
-- so the client can delete the file too.
create or replace function public.delete_message(p_message_id uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare m public.messages;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into m from public.messages where id = p_message_id and sender_id = auth.uid() for update;
  if not found then raise exception 'message_not_found' using errcode = 'P0002'; end if;
  if m.deleted_at is not null then return null; end if;

  update public.messages
  set deleted_at = now(), content = null, media_path = null, media_mime = null,
      media_duration_ms = null, media_width = null, media_height = null
  where id = m.id;
  return m.media_path;
end;
$$;

-- ---------------------------------------------------------------------------
-- Last seen
-- ---------------------------------------------------------------------------
create or replace function public.touch_last_seen()
returns void
language sql security definer
set search_path = public
as $$
  update public.profiles set last_seen_at = now()
  where id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '20 seconds')
$$;

-- ---------------------------------------------------------------------------
-- Chat list: + friend's last seen, + whether the last message was deleted
-- (the return type changes, so the function has to be dropped first)
-- ---------------------------------------------------------------------------
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
  ) un on true
  order by lm.created_at desc nulls last, lower(coalesce(nullif(p.display_name, ''), p.email))
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'mark_messages_delivered()', 'edit_message(uuid,text)', 'delete_message(uuid)',
    'touch_last_seen()', 'get_chat_list()', 'mark_conversation_read(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Deleting a message also deletes its photo/voice file (the client calls storage.remove).
-- Only the uploader, and only inside a conversation they belong to.
drop policy if exists chat_media_delete on storage.objects;
create policy chat_media_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-media'
         and (owner = auth.uid() or owner_id = auth.uid()::text)
         and public.is_conversation_member(public.chat_media_conversation(name)));
