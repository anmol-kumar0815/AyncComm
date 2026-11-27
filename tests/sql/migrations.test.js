// Verifies migrations/001-003 against an in-process Postgres (PGlite) with
// stubbed Supabase `auth`/`storage` schemas. Runs the same scenarios twice:
//   fresh  - empty database
//   legacy - the pre-media schema with RLS off, plus existing data (an upgrade)
// Each statement is its own transaction, and we switch into the `anon` /
// `authenticated` roles with JWT claims exactly like PostgREST does.
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sql = (rel) => readFileSync(path.join(root, rel), 'utf8')
const MIGRATIONS = ['001_schema', '002_functions', '003_rls_and_storage'].map((n) => `migrations/${n}.sql`)

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const C = '00000000-0000-0000-0000-00000000000c'
const D = '00000000-0000-0000-0000-00000000000d'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function applyAll(db) {
  for (const f of MIGRATIONS) await db.exec(sql(f))
}

describe.each([
  ['fresh database', false],
  ['legacy database (upgrade in place)', true],
])('migrations on a %s', (_name, legacy) => {
  let db
  const q = async (text, params) => (await db.query(text, params)).rows
  const one = async (text, params) => Object.values((await q(text, params))[0] ?? {})[0]
  const admin = () => db.exec('reset role')
  const anon = async () => {
    await db.exec(`select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false); set role anon`)
  }
  const as = async (id, email) => {
    await admin()
    await db.query(
      `select set_config('request.jwt.claim.sub', $1, false),
              set_config('request.jwt.claims', json_build_object('sub',$1::text,'email',$2::text,'role','authenticated')::text, false)`,
      [id, email],
    )
    await db.exec('set role authenticated')
  }
  const denied = async (text, params) => {
    await expect(db.query(text, params)).rejects.toThrow()
  }
  let conv

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(sql('migrations/tests/00_stub_supabase.sql'))
    if (legacy) await db.exec(sql('migrations/tests/01_legacy_schema.sql'))
    await applyAll(db)
    await applyAll(db) // idempotent: a second run must be a no-op, not an error
    await db.query(
      `insert into auth.users (id, email, raw_user_meta_data) values
        ($1,'alice@example.com','{"display_name":"Alice"}'), ($2,'bob@example.com','{}'), ($3,'carol@example.com','{}')`,
      [A, B, C],
    )
  }, 60_000)

  if (legacy) {
    it('keeps existing users and backfills the new columns', async () => {
      const [p] = await q(`select email, has_password from profiles where display_name = 'Legacy'`)
      expect(p).toEqual({ email: 'Legacy@Example.com', has_password: false })
      expect(await one(`select count(*)::int from information_schema.columns where table_name='messages' and column_name in ('media_path','media_duration_ms','media_width','media_height','media_mime')`)).toBe(5)
    })
  }

  it('creates profiles for new auth users with sensible display names', async () => {
    expect(await one(`select count(*)::int from profiles where id in ($1,$2,$3)`, [A, B, C])).toBe(3)
    expect(await one(`select display_name from profiles where id=$1`, [A])).toBe('Alice')
    expect(await one(`select display_name from profiles where id=$1`, [B])).toBe('bob')
  })

  it('exposes only email_has_password to signed-out visitors', async () => {
    await anon()
    expect(await one(`select email_has_password('alice@example.com')`)).toBe(false)
    await denied('select * from profiles')
    await denied('select * from get_chat_list()')
    await denied(`select send_friend_request('bob@example.com')`)
    await denied('select * from messages')
    await as(A, 'alice@example.com')
    await q('update profiles set has_password = true where id = auth.uid()')
    await anon()
    expect(await one(`select email_has_password('  ALICE@example.com ')`)).toBe(true)
    expect(await one(`select email_has_password('nobody@example.com')`)).toBe(false)
  })

  it('lets a user read/edit only their own profile, and never their email', async () => {
    await as(A, 'alice@example.com')
    expect(await one('select count(*)::int from profiles')).toBe(1)
    await q(`update profiles set display_name = 'Alice W' where id = auth.uid()`)
    await denied(`update profiles set email = 'evil@example.com' where id = auth.uid()`)
    await q(`update profiles set display_name = 'Alice' where id = auth.uid()`)
  })

  it('runs the friend request lifecycle', async () => {
    await as(A, 'alice@example.com')
    expect(await one(`select send_friend_request('bob@example.com')`)).toBe('sent')
    expect(await one(`select send_friend_request(' BOB@example.com')`)).toBe('already_pending')
    expect(await one(`select send_friend_request('alice@example.com')`)).toBe('self')
    expect(await one(`select send_friend_request('not-an-email')`)).toBe('invalid_email')
    expect(await one(`select send_friend_request('dave@example.com')`)).toBe('sent') // not registered yet
    await denied(`insert into friends (user_id, friend_id) values (auth.uid(), '${C}')`)
    await denied(`insert into friend_requests (sender_id, receiver_email) values (auth.uid(), 'x@example.com')`)

    await admin()
    const bobsRequestId = await one(`select id from friend_requests where receiver_email = 'bob@example.com'`)

    await as(C, 'carol@example.com')
    expect(await one('select count(*)::int from get_pending_requests()')).toBe(0)
    expect(await one('select count(*)::int from friend_requests')).toBe(0)
    await denied('select accept_friend_request($1)', [bobsRequestId]) // addressed to Bob, not Carol

    await as(B, 'bob@example.com')
    const pending = await q('select * from get_pending_requests()')
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ sender_id: A, sender_email: 'alice@example.com', sender_name: 'Alice' })
    await q('select accept_friend_request($1)', [pending[0].id])
    expect(await one('select count(*)::int from get_pending_requests()')).toBe(0)
    await denied('select accept_friend_request($1)', [pending[0].id]) // not twice
    expect(await one(`select send_friend_request('alice@example.com')`)).toBe('already_friends')
  })

  it('auto-accepts when both people invite each other', async () => {
    await as(C, 'carol@example.com')
    expect(await one(`select send_friend_request('alice@example.com')`)).toBe('sent')
    await as(A, 'alice@example.com')
    expect(await one(`select send_friend_request('carol@example.com')`)).toBe('accepted')
    expect(await one('select count(*)::int from get_chat_list()')).toBe(2)
  })

  it('lets a declined request be re-sent, and shows pre-signup invites after joining', async () => {
    await admin()
    await db.query(`insert into auth.users (id, email) values ($1,'dave@example.com')`, [D])
    await as(D, 'dave@example.com')
    const [req] = await q('select * from get_pending_requests()')
    expect(req.sender_name).toBe('Alice')
    await q('select decline_friend_request($1)', [req.id])
    expect(await one('select count(*)::int from get_pending_requests()')).toBe(0)
    await as(A, 'alice@example.com')
    expect(await one(`select send_friend_request('dave@example.com')`)).toBe('sent')
  })

  it('opens one conversation per friend pair and refuses non-friends', async () => {
    await as(A, 'alice@example.com')
    conv = await one('select get_or_create_conversation($1)', [B])
    expect(conv).toBeTruthy()
    expect(await one('select get_or_create_conversation($1)', [B])).toBe(conv)
    await as(B, 'bob@example.com')
    expect(await one('select get_or_create_conversation($1)', [A])).toBe(conv) // same from the other side
    await as(A, 'alice@example.com')
    await denied('select get_or_create_conversation($1)', [D])
    await denied('insert into conversations default values')
  })

  it('stores text, image and voice messages and enforces their shape', async () => {
    await as(A, 'alice@example.com')
    await q(`insert into messages (conversation_id, sender_id, content) values ($1, auth.uid(), 'hello bob')`, [conv])
    await sleep(8)
    await q(
      `insert into messages (conversation_id, sender_id, content, media_type, media_path, media_mime, media_width, media_height)
       values ($1::uuid, auth.uid(), 'nice view', 'image', $1::text || '/a.jpg', 'image/jpeg', 800, 600)`, [conv])
    await sleep(8)
    await q(
      `insert into messages (conversation_id, sender_id, content, media_type, media_path, media_mime, media_duration_ms)
       values ($1::uuid, auth.uid(), '', 'audio', $1::text || '/v.webm', 'audio/webm', 4200)`, [conv])

    await denied(`insert into messages (conversation_id, sender_id, content) values ($1, $2, 'spoof')`, [conv, B])
    await denied(`insert into messages (conversation_id, sender_id, content, media_type) values ($1, auth.uid(), 'x', 'image')`, [conv])
    await denied(`insert into messages (conversation_id, sender_id, content) values ($1, auth.uid(), '   ')`, [conv])
    await denied(`insert into messages (conversation_id, sender_id, content) values ($1, auth.uid(), repeat('x', 4001))`, [conv])
    await denied(`insert into messages (conversation_id, sender_id, content, media_type, media_path) values ($1, auth.uid(), 'x', 'video', 'p')`, [conv])
    await denied(`update messages set content = 'edited'`)
    await denied('delete from messages')
    expect(await one('select count(*)::int from messages')).toBe(3)
  })

  it('hides conversations and messages from people who are not in them', async () => {
    await as(C, 'carol@example.com') // Alice's friend, but not in the Alice/Bob chat
    expect(await one('select count(*)::int from messages')).toBe(0)
    expect(await one('select count(*)::int from conversations')).toBe(0)
    await denied(`insert into messages (conversation_id, sender_id, content) values ($1, auth.uid(), 'sneaky')`, [conv])
  })

  it('builds the chat list with last message and unread counts, and clears them on read', async () => {
    await as(B, 'bob@example.com')
    expect(await one('select count(*)::int from messages')).toBe(3)
    const [row] = await q(`select * from get_chat_list() where friend_email = 'alice@example.com'`)
    expect(row).toMatchObject({
      friend_name: 'Alice', conversation_id: conv, unread_count: 3,
      last_message_type: 'audio', last_message_duration_ms: 4200, last_message_sender_id: A,
    })
    await q('select mark_conversation_read($1)', [conv])
    expect(await one(`select unread_count from get_chat_list() where friend_email = 'alice@example.com'`)).toBe(0)
    expect(await one('select count(*)::int from conversation_participants')).toBe(1) // only his own row
    await denied('update conversation_participants set last_read_at = now()')

    await as(A, 'alice@example.com')
    const names = (await q('select friend_name from get_chat_list()')).map((r) => r.friend_name)
    expect(names).toEqual(['bob', 'carol']) // latest activity first, silent friends after
    expect(await one('select sum(unread_count)::int from get_chat_list()')).toBe(0) // own messages never unread
  })

  it('guards the private chat-media bucket by conversation membership', async () => {
    expect(await one(`select public from storage.buckets where id='chat-media'`)).toBe(false)
    expect(await one(`select file_size_limit from storage.buckets where id='chat-media'`)).toBe(10485760)
    await as(A, 'alice@example.com')
    await q(`insert into storage.objects (bucket_id, name, owner) values ('chat-media', $1::text || '/a.jpg', auth.uid())`, [conv])
    await denied(`insert into storage.objects (bucket_id, name, owner) values ('chat-media', 'not-a-uuid/a.jpg', auth.uid())`)
    await denied(`insert into storage.objects (bucket_id, name, owner) values ('chat-media', 'a.jpg', auth.uid())`)
    await as(C, 'carol@example.com')
    await denied(`insert into storage.objects (bucket_id, name, owner) values ('chat-media', $1::text || '/evil.jpg', auth.uid())`, [conv])
    expect(await one('select count(*)::int from storage.objects')).toBe(0)
    await as(B, 'bob@example.com')
    expect(await one('select count(*)::int from storage.objects')).toBe(1)
  })
})
