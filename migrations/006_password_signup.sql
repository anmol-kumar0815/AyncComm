-- 006_password_signup.sql
-- Sign-up and sign-in with email + password only (no emails sent by the app).
-- Run after 005 (always run all files in order, see README).

-- 1. Accounts created WITH a password (signUp with a password, or "Add user" in the dashboard)
--    are born with has_password = true. Passwordless ones (old magic-link sign-ups) stay false.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, has_password)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    coalesce(new.encrypted_password, '') <> ''
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 2. Fix up accounts that already exist.
update public.profiles p
set has_password = true
from auth.users u
where u.id = p.id and coalesce(u.encrypted_password, '') <> '' and p.has_password is not true;

-- 3. "Does this email already have a password?" now reads the real password record rather than
--    a flag that can drift. The sign-in screen uses it to choose "sign in" vs "create account".
--    Returns only a boolean; callable while signed out.
create or replace function public.email_has_password(p_email text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users u
    where lower(u.email) = lower(btrim(p_email))
      and coalesce(u.encrypted_password, '') <> ''
  )
$$;
revoke execute on function public.email_has_password(text) from public;
grant execute on function public.email_has_password(text) to anon, authenticated;
