import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Spinner } from '../ui/spinner'
import { sendFriendRequest } from '../../lib/api/friends'
import { useChats } from '../../hooks/chatsContext'

/** One field, one button. Used in the "Add a friend" dialog and in the empty chat list. */
export default function AddFriendForm({ autoFocus = false }) {
  const { refresh } = useChats()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null) // { ok, text }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setResult(null)
    try {
      const r = await sendFriendRequest(email)
      setResult(r)
      if (r.ok) {
        setEmail('')
        if (r.code === 'accepted') refresh()
      }
    } catch (err) {
      setResult({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="friend-email" className="mb-1.5 block text-sm font-medium text-gray-700">Friend's email</label>
        <Input
          id="friend-email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={autoFocus}
          required
          placeholder="friend@example.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setResult(null) }}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy || !email.trim()}>
        {busy ? <Spinner className="text-white" /> : <><UserPlus className="h-4 w-4" /> Send invite</>}
      </Button>
      <div aria-live="polite">
        {result && (
          <p className={`rounded-lg px-3 py-2 text-sm ${result.ok ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
            {result.text}
          </p>
        )}
      </div>
    </form>
  )
}
