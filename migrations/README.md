# Database migrations

Supabase has no CLI wired into this repo, so migrations are plain SQL you paste
into **Supabase Dashboard -> SQL Editor** (or `psql`). Run them **in order**, and always run *all* of them: later files redefine some functions from earlier ones, so re-running only `002` after `004` would revert part of `004`.
Every file is idempotent: running one twice is harmless, and they upgrade an
existing project in place (no data is dropped).

| File | What it does |
| --- | --- |
| `001_schema.sql` | Tables (if missing), chat media columns on `messages`, `last_read_at` for unread counts, constraints, indexes, profile-on-signup trigger, realtime publication |
| `002_functions.sql` | RPCs the app calls: `email_has_password`, `send_friend_request`, `accept_friend_request`, `decline_friend_request`, `get_pending_requests`, `get_or_create_conversation`, `mark_conversation_read`, `get_chat_list` |
| `003_rls_and_storage.sql` | Turns **Row Level Security on** for every table, with policies; creates the private `chat-media` storage bucket and its access policies |
| `004_receipts_edit_delete_presence.sql` | Delivered/read timestamps per message, `edit_message` (15-minute window) and `delete_message` (tombstone), `last_seen_at`, richer `get_chat_list`, storage delete policy. Also stops clients forging receipts/timestamps on insert |
| `add_has_password.sql` | Older one-off; already covered by `001`. Safe to skip |

Dev data: run `seed.sql` (repo root) after the migrations to create the
`dev_user@example.com` / `alice@example.com` / `bob@example.com` accounts
(password `password123`) that the dev auto-login uses.

> `disable_rls.sql` (repo root) turns RLS **off** for local experiments. After
> `003` it is neither needed nor safe: the app now reads through RLS and the
> RPCs. Don't run it against anything you care about.

## Tests

```sh
npm test            # includes tests/sql: runs 001-003 on an in-process Postgres (PGlite)
```

`tests/sql/migrations.test.js` applies the migrations to a fresh database *and*
to a "legacy" one (old schema, RLS off, existing data), twice each, then checks
the friend-request lifecycle, chat list/unread counts, message constraints, that
outsiders can't read other people's chats, and the storage bucket policies.
It stubs Supabase's `auth`/`storage` schemas (`migrations/tests/`), so it
verifies our SQL, not Supabase itself.
