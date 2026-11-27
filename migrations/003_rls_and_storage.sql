-- 003_rls_and_storage.sql
-- Turns Row Level Security ON for every table (undoing disable_rls.sql) and
-- creates the private bucket that holds images and voice notes.
-- Reads go through RLS; writes to friends/requests/conversations go through the
-- SECURITY DEFINER functions in 002, so clients get no direct write access.

alter table public.profiles                  enable row level security;
alter table public.friend_requests           enable row level security;
alter table public.friends                   enable row level security;
alter table public.conversations             enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages                  enable row level security;

-- Drop any policies left over from earlier experiments so the set below is the
-- whole truth.
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles','friend_requests','friends','conversations','conversation_participants','messages')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- profiles: you can read and edit your own row (other people's profiles are
-- served by get_chat_list / get_pending_requests).
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- friend_requests / friends: read-only for the people involved (powers realtime).
create policy friend_requests_select on public.friend_requests
  for select to authenticated
  using (sender_id = auth.uid() or lower(receiver_email) = public.my_email());
create policy friends_select on public.friends
  for select to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());

-- conversations / participants: members only; own participant row only (avoids
-- recursive policies).
create policy conversations_select on public.conversations
  for select to authenticated using (public.is_conversation_member(id));
create policy participants_select_own on public.conversation_participants
  for select to authenticated using (user_id = auth.uid());

-- messages: members read; members insert as themselves; nobody edits/deletes.
create policy messages_select on public.messages
  for select to authenticated using (public.is_conversation_member(conversation_id));
create policy messages_insert on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));

-- Defence in depth: clients can't write these tables directly at all.
revoke all on public.friend_requests, public.friends, public.conversations,
              public.conversation_participants from anon, authenticated;
grant select on public.friend_requests, public.friends, public.conversations,
                public.conversation_participants to authenticated;

revoke all on public.messages from anon, authenticated;
grant select, insert on public.messages to authenticated;

-- profiles: only display_name / has_password are client-editable (not email/id).
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, has_password) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket, 10 MB per file, images + audio only.
-- Object path convention: <conversation_id>/<uuid>.<ext>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media', 'chat-media', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif',
        'audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/aac','audio/x-m4a']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists chat_media_select on storage.objects;
drop policy if exists chat_media_insert on storage.objects;

create policy chat_media_select on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-media'
         and public.is_conversation_member(public.chat_media_conversation(name)));

create policy chat_media_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-media'
              and public.is_conversation_member(public.chat_media_conversation(name)));
