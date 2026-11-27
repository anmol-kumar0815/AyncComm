-- SQL Seeding Script for AsyncComm
-- Run this directly in the Supabase SQL Editor

-- 1. Create or ensure the existence of the DEV user and friends in auth.users
-- We use a DO block to handle the inserts safely without breaking if they exist.
DO $$
DECLARE
  dev_user_id UUID := '00000000-0000-0000-0000-000000000001';
  alice_id UUID := '00000000-0000-0000-0000-000000000002';
  bob_id UUID := '00000000-0000-0000-0000-000000000003';
  v_conversation_id UUID;
BEGIN
  -- Insert Dev User
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'dev_user@example.com') THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, deleted_at)
    VALUES (dev_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dev_user@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, null);
    
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (uuid_generate_v4(), dev_user_id, format('{"sub":"%s","email":"%s"}', dev_user_id::text, 'dev_user@example.com')::jsonb, 'email', dev_user_id::text, now(), now(), now());
  ELSE
    SELECT id INTO dev_user_id FROM auth.users WHERE email = 'dev_user@example.com';
  END IF;

  -- Insert Alice
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'alice@example.com') THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, deleted_at)
    VALUES (alice_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, null);
    
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (uuid_generate_v4(), alice_id, format('{"sub":"%s","email":"%s"}', alice_id::text, 'alice@example.com')::jsonb, 'email', alice_id::text, now(), now(), now());
  ELSE
    SELECT id INTO alice_id FROM auth.users WHERE email = 'alice@example.com';
  END IF;

  -- Insert Bob
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'bob@example.com') THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, deleted_at)
    VALUES (bob_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, null);
    
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (uuid_generate_v4(), bob_id, format('{"sub":"%s","email":"%s"}', bob_id::text, 'bob@example.com')::jsonb, 'email', bob_id::text, now(), now(), now());
  ELSE
    SELECT id INTO bob_id FROM auth.users WHERE email = 'bob@example.com';
  END IF;

  -- (Note: The trigger `on_auth_user_created` will automatically create rows in `public.profiles` for these users)
  
  -- Update display names in profiles just to make them look nice
  UPDATE public.profiles SET display_name = 'Dev User' WHERE email = 'dev_user@example.com';
  UPDATE public.profiles SET display_name = 'Alice Wonderland' WHERE email = 'alice@example.com';
  UPDATE public.profiles SET display_name = 'Bob Builder' WHERE email = 'bob@example.com';

  -- 2. Create Friendships
  -- Dev User <-> Alice (Accepted Friends)
  IF NOT EXISTS (SELECT 1 FROM public.friends WHERE user_id = dev_user_id AND friend_id = alice_id) THEN
    INSERT INTO public.friends (user_id, friend_id) VALUES (dev_user_id, alice_id);
  END IF;

  -- Bob -> Dev User (Pending Friend Request)
  IF NOT EXISTS (SELECT 1 FROM public.friend_requests WHERE sender_id = bob_id AND receiver_email = 'dev_user@example.com') THEN
    INSERT INTO public.friend_requests (sender_id, receiver_email, status) VALUES (bob_id, 'dev_user@example.com', 'pending');
  END IF;

  -- 3. Create a Conversation between Dev User and Alice
  SELECT cp.conversation_id INTO v_conversation_id
  FROM public.conversation_participants cp
  WHERE cp.user_id = dev_user_id
    AND EXISTS (SELECT 1 FROM public.conversation_participants cp2 WHERE cp2.conversation_id = cp.conversation_id AND cp2.user_id = alice_id);

  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations (id) VALUES (uuid_generate_v4()) RETURNING id INTO v_conversation_id;
    INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (v_conversation_id, dev_user_id);
    INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (v_conversation_id, alice_id);
  END IF;

  -- 4. Insert dummy messages if the conversation is empty
  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = v_conversation_id) THEN
    INSERT INTO public.messages (conversation_id, sender_id, content, created_at) VALUES 
      (v_conversation_id, alice_id, 'Hey Dev! How is the UI revamp going?', now() - interval '1 hour'),
      (v_conversation_id, dev_user_id, 'Going great! Just added the bottom navigation bar.', now() - interval '59 minutes'),
      (v_conversation_id, alice_id, 'That is awesome. I cannot wait to see it.', now() - interval '58 minutes'),
      (v_conversation_id, dev_user_id, 'I am seeding some dummy data right now so I can test it.', now());
  END IF;

END $$;

-- ---------------------------------------------------------------------------
-- Dev-login support (added with the dev auto-login feature)
-- ---------------------------------------------------------------------------
-- 1. Seeded users already "have a password", so they skip the set-password screen.
UPDATE public.profiles SET has_password = TRUE
WHERE email IN ('dev_user@example.com', 'alice@example.com', 'bob@example.com');

-- 2. Users inserted by hand into auth.users have NULL in some token columns, which
--    makes GoTrue fail the password sign-in ("Database error querying schema").
--    Normalise whichever of those columns this GoTrue version has.
DO $$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY[
    'confirmation_token', 'recovery_token', 'email_change', 'email_change_token_new',
    'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = c) THEN
      EXECUTE format(
        'UPDATE auth.users SET %1$I = '''' WHERE %1$I IS NULL AND email IN (''dev_user@example.com'', ''alice@example.com'', ''bob@example.com'')', c);
    END IF;
  END LOOP;
END $$;
