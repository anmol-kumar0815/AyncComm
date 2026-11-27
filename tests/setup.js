import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

if (typeof window !== 'undefined') {
  const { cleanup } = await import('@testing-library/react')
  afterEach(cleanup)

  // jsdom doesn't implement <dialog> modality; emulate just enough for our Dialog.
  const proto = window.HTMLDialogElement?.prototype
  if (proto) {
    proto.showModal = function showModal() { this.setAttribute('open', '') }
    proto.close = function close() {
      if (!this.hasAttribute('open')) return
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    }
  }
  window.HTMLElement.prototype.scrollTo ??= function scrollTo() {}
}
