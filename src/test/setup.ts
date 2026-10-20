import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

/** jsdom n’implémente pas matchMedia : par défaut, écran d’ordinateur avec souris, thème clair. */
export function mockMatchMedia(matches: (query: string) => boolean = () => false) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

// Les tests du serveur tournent sous Node, sans DOM : les simulations du navigateur ne s’y appliquent pas.
if (typeof window !== 'undefined') {
  mockMatchMedia()
  Element.prototype.scrollIntoView = vi.fn()

  afterEach(() => {
    cleanup()
    localStorage.clear()
    window.history.replaceState({}, '', '/')
    mockMatchMedia()
  })
}
