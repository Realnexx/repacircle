import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
// jsdom does not implement the browser's native dialog API.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true
    },
  },
  close: {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false
    },
  },
})
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
})
