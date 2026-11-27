// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const media = { url: 'blob:voice', failed: false }
vi.mock('../src/hooks/useMediaUrl', () => ({ useMediaUrl: () => media }))
import AudioPlayer from '../src/components/chat/AudioPlayer.jsx'

// jsdom has no media playback; model the parts of HTMLMediaElement the player relies on.
beforeEach(() => {
  media.url = 'blob:voice'
  media.failed = false
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get() { return this._paused !== false } })
  HTMLMediaElement.prototype.play = vi.fn(function play() { this._paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve() })
  HTMLMediaElement.prototype.pause = vi.fn(function pause() { this._paused = true; this.dispatchEvent(new Event('pause')) })
})

const msg = (over = {}) => ({ id: 'a1', media_type: 'audio', media_duration_ms: 65_000, ...over })

describe('AudioPlayer', () => {
  it('shows the stored duration (webm files report Infinity) and plays on tap', async () => {
    const u = userEvent.setup()
    render(<AudioPlayer message={msg()} mine={false} />)
    expect(screen.getByText('1:05')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Play voice note' }))
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Pause voice note' })).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Pause voice note' }))
    expect(screen.getByRole('button', { name: 'Play voice note' })).toBeInTheDocument()
  })

  it('only one voice note plays at a time', async () => {
    const u = userEvent.setup()
    render(<><AudioPlayer message={msg({ id: 'one' })} /><AudioPlayer message={msg({ id: 'two' })} /></>)
    const [first, second] = screen.getAllByRole('button', { name: 'Play voice note' })
    await u.click(first)
    expect(screen.getAllByRole('button', { name: 'Pause voice note' })).toHaveLength(1)
    await u.click(second)
    // starting the second paused the first
    expect(screen.getAllByRole('button', { name: 'Pause voice note' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Play voice note' })).toHaveLength(1)
  })

  it('shows progress while playing and resets at the end', async () => {
    const u = userEvent.setup()
    const { container } = render(<AudioPlayer message={msg()} />)
    await u.click(screen.getByRole('button', { name: 'Play voice note' }))
    const audio = container.querySelector('audio')
    audio.currentTime = 12
    fireEvent.timeUpdate(audio)
    expect(screen.getByText('0:12')).toBeInTheDocument()
    fireEvent.ended(audio)
    expect(screen.getByText('1:05')).toBeInTheDocument()
  })

  it('seeking moves the playback position', () => {
    const { container } = render(<AudioPlayer message={msg()} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Seek voice note' }), { target: { value: '30' } })
    expect(container.querySelector('audio').currentTime).toBe(30)
  })

  it('cycles playback speed 1x -> 1.5x -> 2x -> 1x once started', async () => {
    const u = userEvent.setup()
    const { container } = render(<AudioPlayer message={msg()} />)
    expect(screen.queryByRole('button', { name: /Playback speed/ })).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Play voice note' }))
    for (const [label, rate] of [['1.5×', 1.5], ['2×', 2], ['1×', 1]]) {
      await u.click(screen.getByRole('button', { name: /Playback speed/ }))
      expect(screen.getByRole('button', { name: /Playback speed/ })).toHaveTextContent(label)
      expect(container.querySelector('audio').playbackRate).toBe(rate)
    }
  })

  it('is disabled while the note is still uploading', () => {
    render(<AudioPlayer message={msg({ pending: true })} mine />)
    expect(screen.getByRole('button', { name: 'Play voice note' })).toBeDisabled()
  })

  it('says so when the file cannot be loaded or played', async () => {
    media.url = null
    media.failed = true
    render(<AudioPlayer message={msg()} />)
    expect(screen.getByText("Can't play")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play voice note' })).toBeDisabled()
  })

  it('reports a playback error from the audio element', async () => {
    const { container } = render(<AudioPlayer message={msg()} />)
    fireEvent.error(container.querySelector('audio'))
    expect(await screen.findByText("Can't play")).toBeInTheDocument()
  })
})
