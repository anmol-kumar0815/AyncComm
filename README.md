# AsyncComm

A small WhatsApp-style web chat for a limited number of users: text, emoji, photos
and voice notes, 1:1, with friends you invite by email.

React 19 + Vite + Tailwind on the front, Supabase (Auth, Postgres + RLS, Realtime,
Storage) on the back. No custom server.

## Quick start

```sh
npm install
cp .env.example .env.local      # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

Then, once per Supabase project, in **Dashboard -> SQL Editor** run, in order:

1. `migrations/001_schema.sql`
2. `migrations/002_functions.sql`
3. `migrations/003_rls_and_storage.sql`
4. `migrations/004_receipts_edit_delete_presence.sql`
5. `migrations/005_delete_for_me.sql`
6. `migrations/006_password_signup.sql`
7. `seed.sql` (development only: creates `dev_user@`, `alice@`, `bob@example.com`, password `password123`)

(Details and what each file does: [`migrations/README.md`](migrations/README.md). They are idempotent and
upgrade an existing project in place.)

```sh
npm run dev
```

### Supabase dashboard settings (the code can't set these for you)

| Where | Setting |
| --- | --- |
| Authentication -> Sign In / Providers -> Email | Make sure **Enable Email provider** is **ON** (otherwise sign-up and sign-in both fail with "Email signups are disabled"). Turn **Confirm email OFF** (required: the app sends no emails, so sign-up must start a session immediately) and set the minimum password length to **8**. No SMTP / email provider is needed. |
| Project Settings -> API | Copy the URL and the `anon` key into `.env.local`. The anon key is public by design; Row Level Security is what protects data. Never put the `service_role` key in the frontend. |

## Sign-in flow

The app never sends an email. Everything is email + password:

1. Enter your email.
2. **Already have an account?** Enter your password. **New here?** Enter your name and choose a password (at least 8
   characters); your account is created and you're in.
3. The browser remembers the session, so you stay signed in between visits until you log out.

**No password reset by email.** If someone forgets their password, whoever runs the app resets it in the Supabase SQL
Editor (and tells them the new one):

```sql
update auth.users
set encrypted_password = crypt('NewPassword123', gen_salt('bf'))
where lower(email) = 'person@example.com';
```

Anyone who can open the URL can create an account. They see nothing until someone accepts their friend request, but if you
want a closed group, turn off **Authentication -> Sign In / Providers -> Allow new users to sign up** after everyone has joined
(or create accounts yourself under Authentication -> Users, ticking *Auto Confirm User*).

## Development login (no emails, no re-typing)

`npm run dev` signs you in automatically as `dev_user@example.com`.

| Do this | To get this |
| --- | --- |
| open `/?as=alice` in one tab and `/?as=bob` in another | be both users at once, side by side, in the **same browser window**. Tabs opened with `?as=` keep their login private to the tab. (Two *incognito windows* do **not** work: they share one session, so logging in as Alice in one logs the other in as Alice too.) |
| open `/?as=none` | see the real sign-in screen |
| log out in the app | stay logged out for that tab until you open `/?as=...` or start a new tab |
| `VITE_DEV_AUTO_LOGIN=false` in `.env.local` | turn auto-login off entirely |

All of this is behind `import.meta.env.DEV` and is **removed from production builds**. `tests/build.test.js`
builds for real and fails if any seeded credential appears in the production bundle.

## Using the app

- **Chats** is the home screen: every friend, newest activity first, last message and unread count.
  One tap opens a conversation. On desktop the conversation opens beside the list.
- **Add a friend** (the person icon): type their email. If they're already on AsyncComm they see
  the request at the top of their chat list and accept it in one tap; if not, it waits for them.
- **Message box:** `Enter` sends (`Shift+Enter` for a new line; on phones Enter is a new line).
  The emoji button opens a picker. The picture button, **pasting** a screenshot, or **dragging** a
  photo onto the chat all open a preview with an optional caption.
- **Voice notes:** the microphone sits where Send is while the box is empty. Tap, talk, tap send
  (`Esc` cancels). Up to 5 minutes.
- A message that fails to send stays in the chat with **Retry / Delete**.
- **Ticks:** one grey tick = sent, two grey = delivered (their app received it), two green = read (they opened
  the chat while the tab was visible). Tap the small arrow beside any of your messages -> **Message info** for the
  exact sent / delivered / read times.
- **Edit / delete:** the same arrow (it also appears on the other person's messages) offers **Edit** (your own text,
  within 15 minutes; enforced by the database) and **Delete**, which asks which kind:
  - **Delete for everyone** (your own messages): it becomes "This message was deleted" for both of you and its photo
    or voice file is removed from storage.
  - **Delete for me** (any message, including the other person's and "deleted" placeholders): it disappears from your
    chat only; the other person keeps it. It stays gone after reloading and on your other tabs/devices.
  Edited messages are marked "edited".
- **Status line** under the name: `typing…`, `online`, or `last seen today at 2:05 PM`. A green dot marks online friends.

### App lock (optional)

**Settings -> Security -> "Ask for my password when I open the app".** Normally the browser keeps you signed in, so reopening the
tab goes straight to your chats. With the lock on, a new tab or window shows a lock screen and asks for your **password only**
(no email) before anything loads: no chats, no live connection, and you don't appear online. A reload of the same tab doesn't
re-lock; closing the tab does. Turning the lock on or off asks for your password, and logging out is always available on the lock screen.

It is **per device** (turn it on in each browser you use), and it is a gate in the app, not encryption: the browser still holds your
login, so it keeps out someone who casually opens your browser, not someone with developer tools. For stronger protection, log out.

### Privacy notes

Read receipts, online status, last seen and typing are always on for friends (there are no toggles yet), and are
visible **only to friends**: last seen is served by `get_chat_list`, which only returns your friends. *Online* uses one
Realtime presence channel and *typing* uses the conversation's channel; those channels aren't access-restricted by RLS,
so someone who guessed a user's or conversation's UUID could observe them. For a small private app that is a low risk;
if it matters, move them to private channels with Realtime Authorization policies.

## Commands

```sh
npm run dev       # dev server
npm run build     # production build -> dist/
npm test          # all tests (see below)
npm run lint
```

The app uses client-side routing (`/chat/:id`), so a static host must serve `index.html` for unknown paths.
This repo ships `public/_redirects` (Netlify, Cloudflare Pages) and `vercel.json` (Vercel) for that; see **Going live** below.
Voice notes need **HTTPS** (browsers only expose the microphone on secure origins; `localhost` counts).

## Going live

Supabase is the backend only; the built app (`dist/`) goes on any static host.

1. **New Supabase project for production** (keep dev separate). SQL Editor: run `migrations/001`-`006` in order. **Do not run `seed.sql`.**
2. **Authentication -> Sign In / Providers -> Email:** **Enable Email provider ON**, Confirm email **OFF**, minimum password length **8**. (No SMTP or email provider is needed.)
3. **Host the frontend** (Vercel / Netlify / Cloudflare Pages): build command `npm run build`, output directory `dist`, environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the *production* project (Project Settings -> API). Never set `service_role` anywhere in the frontend, and don't set any `VITE_DEV_*` variables.
4. Open the live URL and run the manual QA checklist below.

Verify Row Level Security is on for every table (all rows must show `true`):

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
```

## Tests

`npm test` runs ~210 tests in a few seconds, with no network or database:

| What | How |
| --- | --- |
| SQL migrations, RLS, RPCs, storage policies | `tests/sql`: real Postgres (PGlite) with stubbed `auth`/`storage`, on a fresh **and** a legacy database, applied twice |
| Pure logic (formatting, merging, media, text, chat list) | plain unit tests |
| Components and hooks (auth flow, composer, messages, voice recorder, player, chat list) | jsdom + Testing Library with Supabase mocked |
| Production bundle contains no dev credentials | `tests/build.test.js` |

What these **cannot** prove: real browser behaviour (layout, `MediaRecorder` output, audio playback, the
camera/file picker, mobile keyboards) and the live Supabase service (Auth, Realtime delivery,
Storage). Use the checklist below after setting up a project.

## Manual QA checklist (real browser + real Supabase)

- [ ] Sign up with a new email (name + password): you land in Chats straight away, no email. Reload: still signed in.
- [ ] Log out, log back in with the password. A wrong password shows an error. Signing up again with the same email says the account exists.
- [ ] Reset a password with the SQL in *Sign-in flow* and sign in with the new one.
- [ ] App lock: turn it on in Settings (asks for the password); reload the tab (no prompt); close the tab and reopen the site (lock screen, password only); wrong password shows an error; the right one opens your chats; turning it off asks for the password.
- [ ] Two browsers (`/?as=alice`, `/?as=bob` in incognito): messages appear live both ways; unread badge and tab title update; opening the chat clears them.
- [ ] Send a photo (picker, paste, drag-drop): preview -> appears instantly -> still there after reload. Tap it for the viewer.
- [ ] Voice note in Chrome **and Safari**: record, send, plays on the other side, seek and 1.5x work, mic indicator turns off afterwards. Deny mic permission: you get a clear message.
- [ ] Phone: keyboard doesn't hide the message box; back button returns to the list; emoji panel + keyboard don't stack.
- [ ] Go offline, send a message (shows Not sent / Retry), go online, Retry works. Reconnect catches up on missed messages.
- [ ] A third account can't see Alice and Bob's messages or media (RLS/storage).
- [ ] Ticks: send while the other tab is closed -> one tick; open their app -> two grey; open the chat -> two green, live.
- [ ] Message info shows plausible sent / delivered / read times and updates while open.
- [ ] Edit a message: other side sees the new text and "edited" without reloading; after 15 minutes Edit is gone (and a stale tab's attempt is refused).
- [ ] Delete a text, a photo and a voice note: other side sees the tombstone; the file is gone from the `chat-media` bucket.
- [ ] Delete for me (yours and theirs): gone for you, still there for the other person; reload and a second tab of the same account agree; the chat-list preview and unread badge don't show it.
- [ ] Status line: `typing…` appears while the other person types and disappears when they stop or send; `online` while their tab is in front; switching tabs shows `last seen` shortly after.

## Project layout

```
migrations/        SQL (run in order) + tests/ stubs
seed.sql           dev users and sample chat
src/lib/api/       every Supabase call (auth, friends, chats, messages, media)
src/lib/           pure helpers: format, messages, media, audio, text, chatList
src/hooks/         useAuth, ChatsProvider (list + realtime + unread), useMessages, useVoiceRecorder, ...
src/components/    auth/, chat/, friends/, settings/, ui/
tests/             unit, component, SQL and build tests
```
