import { useState } from 'react'
import { ArrowLeft, Info, Pencil, Trash2 } from 'lucide-react'
import { Dialog } from '../ui/dialog'
import { Button } from '../ui/button'
import { Spinner } from '../ui/spinner'
import Ticks from './Ticks'
import { formatDateTime, messagePreview } from '../../lib/format'
import { canDelete, canEdit, editMinutesLeft } from '../../lib/receipts'

/**
 * Options for a message: info (mine: sent / delivered / read times), edit (mine, recent),
 * and delete. Delete asks which kind: for everyone (mine only) or just for me (any message).
 * Mounted only while open, so it always starts on the menu. It receives the *live* message,
 * so the info view updates in place if the recipient reads it while you're looking.
 */
export default function MessageActionsDialog({ message, meId, friendName, onClose, onEdit, onDeleteForEveryone, onDeleteForMe }) {
  const [view, setView] = useState('menu') // menu | info | confirm
  const [busy, setBusy] = useState(false)
  if (!message) return null

  const mine = message.sender_id === meId
  const deleted = Boolean(message.deleted_at)
  const editable = canEdit(message, meId)
  const everyone = canDelete(message, meId) // can I remove it for them too?

  const run = async (fn) => {
    setBusy(true)
    try { await fn(message.id) } finally { setBusy(false); onClose() }
  }

  const title = view === 'info' ? 'Message info' : view === 'confirm' ? 'Delete message?' : 'Message options'

  return (
    <Dialog open onClose={onClose} title={title}>
      {view !== 'menu' && !busy && (
        <button type="button" onClick={() => setView('menu')} className="-mt-1 mb-3 flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      )}

      <blockquote className="mb-4 line-clamp-3 rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700 [overflow-wrap:anywhere]">
        {messagePreview({ type: message.media_type, content: message.content, durationMs: message.media_duration_ms, deleted })}
      </blockquote>

      {view === 'menu' && (
        <ul className="-mx-2 space-y-0.5">
          {mine && !deleted && <li><Row icon={Info} onClick={() => setView('info')}>Message info</Row></li>}
          {editable && (
            <li>
              <Row icon={Pencil} onClick={() => { onEdit(message.id); onClose() }} hint={`${editMinutesLeft(message)} min left`}>
                Edit message
              </Row>
            </li>
          )}
          <li><Row icon={Trash2} danger onClick={() => setView('confirm')}>Delete</Row></li>
        </ul>
      )}

      {view === 'info' && (
        <dl className="space-y-3 text-[15px]">
          <InfoRow label="Sent" value={formatDateTime(message.created_at)} state="sent" />
          <InfoRow label="Delivered" value={message.delivered_at ? formatDateTime(message.delivered_at) : `Not delivered to ${friendName} yet`} state="delivered" pending={!message.delivered_at} />
          <InfoRow label="Read" value={message.read_at ? formatDateTime(message.read_at) : `${friendName} hasn't read it yet`} state="read" pending={!message.read_at} />
          {message.edited_at && <InfoRow label="Edited" value={formatDateTime(message.edited_at)} />}
        </dl>
      )}

      {view === 'confirm' && (
        <div className="space-y-4">
          <p className="text-[15px] text-gray-700">
            {everyone
              ? `“Delete for everyone” removes it for you and ${friendName}: they'll see “This message was deleted”. “Delete for me” only removes it from your chat; ${friendName} keeps it.`
              : `This removes it from your chat only. ${friendName} keeps ${mine ? 'it' : 'their copy'}.`}
          </p>
          <div className="flex flex-col gap-2">
            {everyone && (
              <Button variant="destructive" disabled={busy} onClick={() => run(onDeleteForEveryone)}>
                {busy ? <Spinner className="text-white" /> : 'Delete for everyone'}
              </Button>
            )}
            <Button variant={everyone ? 'outline' : 'destructive'} disabled={busy} onClick={() => run(onDeleteForMe)}>
              Delete for me
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setView('menu')}>Cancel</Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

function Row({ icon: Icon, children, onClick, danger, hint }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[16px] font-medium hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${danger ? 'text-red-600' : 'text-gray-900'}`}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="flex-1">{children}</span>
      {hint && <span className="text-xs font-normal text-gray-500">{hint}</span>}
    </button>
  )
}

function InfoRow({ label, value, state, pending }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 w-5 shrink-0">{state && !pending ? <Ticks state={state} tone="plain" /> : null}</div>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
        <dd className={pending ? 'text-gray-400' : 'text-gray-900'}>{value}</dd>
      </div>
    </div>
  )
}
