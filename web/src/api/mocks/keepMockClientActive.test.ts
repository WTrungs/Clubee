import { afterEach, describe, expect, it, vi } from 'vitest'
import { keepMockClientActive } from './keepMockClientActive'

const cleanups: Array<() => void> = []

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

function setController(controller: { postMessage: (message: unknown) => void } | null) {
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller } })
}

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  Reflect.deleteProperty(document, 'visibilityState')
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('keepMockClientActive', () => {
  it('asks the mock worker to mock this tab again each time the tab comes back into view', () => {
    const postMessage = vi.fn()
    setController({ postMessage })
    cleanups.push(keepMockClientActive())

    setVisibility('hidden')
    expect(postMessage).not.toHaveBeenCalled()
    setVisibility('visible')
    setVisibility('visible')
    expect(postMessage.mock.calls).toEqual([['MOCK_ACTIVATE'], ['MOCK_ACTIVATE']])
  })

  it('does nothing when no service worker controls the page', () => {
    setController(null)
    cleanups.push(keepMockClientActive())
    expect(() => setVisibility('visible')).not.toThrow()
  })

  it('stops listening once cleaned up', () => {
    const postMessage = vi.fn()
    setController({ postMessage })
    keepMockClientActive()()
    setVisibility('visible')
    expect(postMessage).not.toHaveBeenCalled()
  })
})
