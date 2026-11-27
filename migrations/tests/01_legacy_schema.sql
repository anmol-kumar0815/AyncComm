-- The database as the app's first iteration (supposedly) left it: no media
-- columns, no last_read_at, RLS disabled (disable_rls.sql). Used to prove the
-- migrations upgrade an existing project in place.
create table public.profiles (id uuid primary key references auth.users(id), email text, display_name text);
create table public.friend_requests (id uuid primary key default gen_random_uuid(), sender_id uuid references public.profiles(id), receiver_email text not null, status text default 'pending', created_at timestamptz default now());
create table public.friends (id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id), friend_id uuid references public.profiles(id));
create table public.conversations (id uuid primary key default gen_random_uuid());
create table public.conversation_participants (conversation_id uuid references public.conversations(id), user_id uuid references public.profiles(id));
create table public.messages (id uuid primary key default gen_random_uuid(), conversation_id uuid references public.conversations(id), sender_id uuid references public.profiles(id), content text not null, media_type text default 'text', created_at timestamptz default now());
-- a pre-existing user, conversation and message that must survive the upgrade
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'Legacy@Example.com');
insert into public.profiles (id, email, display_name) values ('00000000-0000-0000-0000-0000000000a1', 'Legacy@Example.com', 'Legacy');
