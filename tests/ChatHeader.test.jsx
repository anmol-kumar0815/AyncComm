// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ChatHeader from '../src/components/chat/ChatHeader.jsx'
import { ChatsContext } from '../src/hooks/chatsContext.js'

const friend = (over = {}) => ({ friendId: 'f1', name: 'Alice', email: 'a@x.co', lastSeenAt: null, ...over })
const mount = (f, { typing = false, online = [], wentOffline = {} } = {}) =>
  render(
    <MemoryRouter>
      <ChatsContext.Provider value={{ onlineIds: new Set(online), wentOffline }}>
        <ChatHeader friend={f} typing={typing} />
      </ChatsContext.Provider>
    </MemoryRouter>,
  )

describe('ChatHeader status line', () => {
  it('says online (and shows the dot) when they are here', () => {
    mount(friend(), { online: ['f1'] })
    expect(screen.getByText('online')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Online' })).toBeInTheDocument()
  })
  it('says typing… in preference to online', () => {
    mount(friend(), { online: ['f1'], typing: true })
    expect(screen.getByText('typing…')).toBeInTheDocument()
    expect(screen.queryByText('online')).not.toBeInTheDocument()
  })
  it('shows last seen when they are away', () => {
    mount(friend({ lastSeenAt: new Date().toISOString() }))
    expect(screen.getByText(/^last seen today at/)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Online' })).not.toBeInTheDocument()
  })
  it('prefers the moment we watched them leave over the older stored last seen', () => {
    mount(friend({ lastSeenAt: '2020-01-01T10:00:00Z' }), { wentOffline: { f1: new Date().toISOString() } })
    expect(screen.getByText(/^last seen today at/)).toBeInTheDocument()
  })
  it('shows nothing (not "undefined") if they have never been seen', () => {
    mount(friend())
    expect(screen.queryByText(/last seen|online|typing/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Alice' })).toBeInTheDocument()
  })
  it('announces status changes politely to screen readers', () => {
    mount(friend(), { online: ['f1'] })
    expect(screen.getByText('online')).toHaveAttribute('aria-live', 'polite')
  })
})
