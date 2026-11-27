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
5. `seed.sql` (development only: creates `dev_user@`, `alice@`, `bob@example.com`, password `password123`)

(Details and what each file does: [`migrations/README.md`](migrations/README.md). They are idempotent and
upgrade an existing project in place.)

```sh
npm run dev
```

### Supabase dashboard settings (the code can't set these for you)

| Where | Setting |
| --- | --- |
| Authentication -> URL Configuration | **Site URL** = your deployed URL; add **Redirect URLs** for every origin you use (`http://localhost:5173`, production). Magic links and password-reset links only work for allowed redirect URLs. |
| Authentication -> Providers -> Email | Keep **Confirm email ON** in production. For development you can turn it **OFF** so new accounts skip the email step (see below). |
| Project Settings -> API | Copy the URL and the `anon` key into `.env.local`. The anon key is public by design; Row Level Security is what protects data. Never put the `service_role` key in the frontend. |

## Sign-in flow

1. **First visit:** enter your email -> we email a link -> the link opens the app on a one-time screen
   where you choose your **name and password**.
2. **Next visits:** enter your email -> the app sees you have a password -> enter it. No email.
3. **Forgot password:** one tap on the password step emails a reset link.

The session is remembered by the browser, so you stay signed in between visits until you log out.

## Development login (no emails, no re-typing)

`npm run dev` signs you in automatically as `dev_user@example.com`.

| Do this | To get this |
| --- | --- |
| open `/?as=alice` in one tab and `/?as=bob` in another | be both users at once, side by side, in the **same browser window**. Tabs opened with `?as=` keep their login private to the tab. (Two *incognito windows* do **not** work: they share one session, so logging in as Alice in one logs the other in as Alice too.) |
| open `/?as=none` | see the real sign-in screen |
| log out in the app | stay logged out for that tab until you open `/?as=...` or start a new tab |
| `VITE_DEV_AUTO_LOGIN=false` in `.env.local` | turn auto-login off entirely |
| turn **Confirm email** off in Supabase | typing a *new* email in dev creates the account instantly and goes straight to the name+password screen. (With it on, dev falls back to the normal magic link.) `VITE_DEV_SKIP_EMAIL=false` disables this shortcut. |

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
- **Edit / delete:** the same arrow offers **Edit** (text only, within 15 minutes; enforced by the database) and
  **Delete for everyone** (asks first). Deleted messages stay as "This message was deleted" and their photo or voice
  file is removed from storage. Edited messages are marked "edited".
- **Status line** under the name: `typing…`, `online`, or `last seen today at 14:05`. A green dot marks online friends.

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

The app uses client-side routing (`/chat/:id`), so a static host must serve `index.html` for unknown paths
(Netlify: `/* /index.html 200` in `public/_redirects`; Vercel: a rewrite to `/index.html`).
Voice notes need **HTTPS** (browsers only expose the microphone on secure origins; `localhost` counts).

## Tests

`npm test` runs ~210 tests in a few seconds, with no network or database:

| What | How |
| --- | --- |
| SQL migrations, RLS, RPCs, storage policies | `tests/sql`: real Postgres (PGlite) with stubbed `auth`/`storage`, on a fresh **and** a legacy database, applied twice |
| Pure logic (formatting, merging, media, text, chat list) | plain unit tests |
| Components and hooks (auth flow, composer, messages, voice recorder, player, chat list) | jsdom + Testing Library with Supabase mocked |
| Production bundle contains no dev credentials | `tests/build.test.js` |

What these **cannot** prove: real browser behaviour (layout, `MediaRecorder` output, audio playback, the
camera/file picker, mobile keyboards) and the live Supabase service (Auth redirects, Realtime delivery,
Storage). Use the checklist below after setting up a project.

## Manual QA checklist (real browser + real Supabase)

- [ ] Sign up with a new email: link arrives, opens the app, name+password screen, then Chats. Reload: still signed in.
- [ ] Log out, log back in with the password. Wrong password shows an error. "Forgot password" email arrives and works.
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
