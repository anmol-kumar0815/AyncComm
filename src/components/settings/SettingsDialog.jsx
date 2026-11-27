import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { Dialog } from '../ui/dialog'
import { Avatar } from '../ui/avatar'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Spinner } from '../ui/spinner'
import { signOut, updateDisplayName } from '../../lib/api/auth'
import { useToast } from '../ui/toast'

export default function SettingsDialog({ open, onClose, user, profile, onProfileChanged }) {
  const toast = useToast()
  const current = profile?.display_name || ''
  const [name, setName] = useState(current)
  const [busy, setBusy] = useState(false)
  const dirty = name.trim() !== current && name.trim().length > 0

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await updateDisplayName(user.id, name.trim())
      await onProfileChanged()
      toast.show('Name updated.', 'success')
    } catch (err) {
      toast.show(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Settings">
      <div className="flex items-center gap-3 pb-4">
        <Avatar name={current || user.email} seed={user.email} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{current || 'No name yet'}</p>
          <p className="truncate text-sm text-gray-500">{user.email}</p>
        </div>
      </div>
      <form onSubmit={save} className="space-y-3">
        <div>
          <label htmlFor="display-name" className="mb-1.5 block text-sm font-medium text-gray-700">Your name</label>
          <Input id="display-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          <p className="mt-1.5 text-xs text-gray-500">This is what your friends see.</p>
        </div>
        <Button type="submit" variant="secondary" className="w-full" disabled={!dirty || busy}>
          {busy ? <Spinner /> : 'Save name'}
        </Button>
      </form>
      <hr className="my-5" />
      <Button variant="outline" className="w-full text-red-600 hover:text-red-700" onClick={signOut}>
        <LogOut className="h-4 w-4" /> Log out
      </Button>
      <p className="mt-4 text-center text-xs text-gray-400">
        AsyncComm{import.meta.env.DEV ? ' · dev build' : ''}
      </p>
    </Dialog>
  )
}
