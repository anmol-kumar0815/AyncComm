// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const hook = { value: null }
vi.mock('../src/hooks/useMessages', () => ({ useMessages: () => hook.value }))
vi.mock('../src/lib/api/chats', () => ({ markConversationRead: vi.fn() }))
vi.mock('../src/hooks/useMediaUrl', () => ({ useMediaUrl: () => ({ url: 'blob:x', failed: false }) }))
vi.mock('emoji-picker-react', () => ({ default: () => <div /> }))

import ChatThread from '../src/components/chat/ChatThread.jsx'
import { ChatsContext } from '../src/hooks/chatsContext.js'
import { ToastProvider } from '../src/components/ui/toast.jsx'

const ME = 'me'
const msg = (id, over = {}) => ({
  id, conversation_id: 'c1', sender_id: ME, content: `text ${id}`, media_type: 'text', media_path: null, media_duration_ms: null,
  created_at: new Date(Date.now() - 60_000).toISOString(), ...over,
})
const friend = { friendId: 'f1', name: 'Alice', email: 'a@x.co', lastSeenAt: null, unread: 0 }

let m
let ctx
function mount(messages, over = {}) {
  m = {
    messages, status: 'ready', error: '', hasMore: false, loadingMore: false, loadEarlier: vi.fn(), reload: vi.fn(),
    sendText: vi.fn(), sendImage: vi.fn(), sendAudio: vi.fn(), retry: vi.fn(), discard: vi.fn(),
    editMessage: vi.fn(async () => {}), deleteMessage: vi.fn(async () => {}), hideMessage: vi.fn(async () => {}), notifyTyping: vi.fn(), friendTyping: false, ...over,
  }
  hook.value = m
  ctx = { setActiveConversation: vi.fn(), markReadLocal: vi.fn(), refresh: vi.fn(), onlineIds: new Set(), wentOffline: {} }
  const ui = () => (
    <MemoryRouter>
      <ToastProvider>
        <ChatsContext.Provider value={ctx}>
          <ChatThread conversationId="c1" meId={ME} friend={friend} />
        </ChatsContext.Provider>
      </ToastProvider>
    </MemoryRouter>
  )
  const view = render(ui())
  return { ...view, refresh: () => view.rerender(ui()) }
}
const openOptions = (u, text) => u.click(within(screen.getByText(text).closest('.group')).getByRole('button', { name: 'Message options' }))

beforeEach(() => vi.clearAllMocks())

describe('edit flow', () => {
  it('options -> Edit puts that message in the composer; Enter saves it through the hook', async () => {
    const u = userEvent.setup()
    mount([msg('a'), msg('b')])
    await openOptions(u, 'text b')
    await u.click(screen.getByRole('button', { name: /Edit message/ }))

    const box = await screen.findByLabelText('Edit message')
    expect(box).toHaveValue('text b')
    await u.type(box, '!{Enter}')
    expect(m.editMessage).toHaveBeenCalledWith('b', 'text b!')
    await waitFor(() => expect(screen.queryByText('Editing message')).not.toBeInTheDocument()) // back to normal composing
    expect(screen.getByLabelText('Message')).toHaveValue('')
  })

  it('tells the user when the server refuses the edit', async () => {
    const u = userEvent.setup()
    mount([msg('a')], { editMessage: vi.fn(async () => { throw new Error('You can only edit a message within 15 minutes of sending it.') }) })
    await openOptions(u, 'text a')
    await u.click(screen.getByRole('button', { name: /Edit message/ }))
    await u.type(await screen.findByLabelText('Edit message'), 'x{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('within 15 minutes')
  })

  it('cancelling leaves the message and the normal draft alone', async () => {
    const u = userEvent.setup()
    mount([msg('a')])
    await openOptions(u, 'text a')
    await u.click(screen.getByRole('button', { name: /Edit message/ }))
    await u.click(await screen.findByRole('button', { name: 'Cancel editing' }))
    expect(m.editMessage).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Message')).toBeInTheDocument()
  })
})

describe('delete for everyone', () => {
  it('options -> Delete -> Delete for everyone deletes exactly that message', async () => {
    const u = userEvent.setup()
    mount([msg('a'), msg('b')])
    await openOptions(u, 'text a')
    await u.click(screen.getByRole('button', { name: 'Delete' }))
    await u.click(screen.getByRole('button', { name: 'Delete for everyone' }))
    expect(m.deleteMessage).toHaveBeenCalledWith('a')
    expect(m.deleteMessage).toHaveBeenCalledTimes(1)
    expect(m.hideMessage).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument())
  })

  it('reports a failed delete instead of failing silently', async () => {
    const u = userEvent.setup()
    mount([msg('a')], { deleteMessage: vi.fn(async () => { throw new Error("Couldn't delete the message.") }) })
    await openOptions(u, 'text a')
    await u.click(screen.getByRole('button', { name: 'Delete' }))
    await u.click(screen.getByRole('button', { name: 'Delete for everyone' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't delete")
  })

  it('shows the tombstone once the message is deleted', () => {
    mount([msg('a', { deleted_at: new Date().toISOString(), content: null })])
    expect(screen.getByText('This message was deleted')).toBeInTheDocument()
  })
})

describe('delete for me', () => {
  it('hides only that message through the hook, then refreshes the chat list preview', async () => {
    const u = userEvent.setup()
    mount([msg('a'), msg('b')])
    await openOptions(u, 'text b')
    await u.click(screen.getByRole('button', { name: 'Delete' }))
    await u.click(screen.getByRole('button', { name: 'Delete for me' }))
    expect(m.hideMessage).toHaveBeenCalledWith('b')
    expect(m.deleteMessage).not.toHaveBeenCalled() // the other person is untouched
    await waitFor(() => expect(ctx.refresh).toHaveBeenCalled())
  })

  it("works on the other person's messages, which have no 'for everyone' choice", async () => {
    const u = userEvent.setup()
    mount([msg('t', { sender_id: 'f1', content: 'from Alice' })])
    await openOptions(u, 'from Alice')
    expect(screen.queryByRole('button', { name: /Message info/ })).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.queryByRole('button', { name: 'Delete for everyone' })).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Delete for me' }))
    expect(m.hideMessage).toHaveBeenCalledWith('t')
  })

  it('tells the user if it failed (and does not refresh the list as if it had worked)', async () => {
    const u = userEvent.setup()
    mount([msg('a')], { hideMessage: vi.fn(async () => { throw new Error("Couldn't delete the message.") }) })
    await openOptions(u, 'text a')
    await u.click(screen.getByRole('button', { name: 'Delete' }))
    await u.click(screen.getByRole('button', { name: 'Delete for me' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't delete")
    expect(ctx.refresh).not.toHaveBeenCalled()
  })

  it('a tombstone can be removed from my chat', async () => {
    const u = userEvent.setup()
    mount([msg('a', { deleted_at: new Date().toISOString(), content: null })])
    await u.click(screen.getByRole('button', { name: 'Message options' }))
    await u.click(screen.getByRole('button', { name: 'Delete' }))
    await u.click(screen.getByRole('button', { name: 'Delete for me' }))
    expect(m.hideMessage).toHaveBeenCalledWith('a')
  })
})

describe('message info', () => {
  it('shows delivery and read times for the message you opened it on', async () => {
    const u = userEvent.setup()
    mount([msg('a', { delivered_at: new Date().toISOString(), read_at: new Date().toISOString() })])
    await openOptions(u, 'text a')
    await u.click(screen.getByRole('button', { name: /Message info/ }))
    expect(screen.getByText('Delivered')).toBeInTheDocument()
    expect(screen.queryByText(/hasn't read it yet/)).not.toBeInTheDocument()
  })
})

describe('header and typing', () => {
  it('shows typing… in the header while the friend types, and passes my own typing to the hook', async () => {
    const u = userEvent.setup()
    const { refresh } = mount([msg('a')])
    expect(screen.queryByText('typing…')).not.toBeInTheDocument()
    hook.value = { ...m, friendTyping: true }
    refresh()
    expect(screen.getByText('typing…')).toBeInTheDocument()

    await u.type(screen.getByLabelText('Message'), 'h')
    expect(m.notifyTyping).toHaveBeenCalledWith(true)
  })
})
