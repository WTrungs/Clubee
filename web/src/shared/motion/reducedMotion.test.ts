import { MotionGlobalConfig } from 'motion/react'
import { afterEach, describe, expect, it } from 'vitest'
import { syncReducedMotion } from './reducedMotion'

function fakePreference(matches: boolean) {
  let notify: ((event: { matches: boolean }) => void) | undefined
  return {
    matches,
    addEventListener: (_type: 'change', listener: (event: { matches: boolean }) => void) => {
      notify = listener
    },
    change: (next: boolean) => notify?.({ matches: next }),
  }
}

describe('syncReducedMotion', () => {
  afterEach(() => {
    MotionGlobalConfig.skipAnimations = false
  })

  it('skips every Motion animation when the user prefers reduced motion', () => {
    syncReducedMotion(fakePreference(true))
    expect(MotionGlobalConfig.skipAnimations).toBe(true)
  })

  it('keeps animations on by default and follows later changes', () => {
    const preference = fakePreference(false)
    syncReducedMotion(preference)
    expect(MotionGlobalConfig.skipAnimations).toBe(false)

    preference.change(true)
    expect(MotionGlobalConfig.skipAnimations).toBe(true)

    preference.change(false)
    expect(MotionGlobalConfig.skipAnimations).toBe(false)
  })
})
