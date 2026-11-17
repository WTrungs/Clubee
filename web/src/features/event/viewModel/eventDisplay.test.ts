import { describe, expect, it } from 'vitest'
import { eventTransitions, formatEventTime, lifecycleSteps, needsDialog, reasonRequired, seatInfo, selectableLead } from './eventDisplay'

describe('formatEventTime', () => {
  it('shows one date for a same-day event and both dates otherwise (UTC+7)', () => {
    expect(formatEventTime({ startAt: '2026-11-12T19:00:00+07:00', endAt: '2026-11-12T22:00:00+07:00' })).toBe('19:00 – 22:00, 12/11/2026')
    expect(formatEventTime({ startAt: '2026-11-14T07:00:00+07:00', endAt: '2026-11-15T17:00:00+07:00' })).toBe('07:00 14/11/2026 – 17:00 15/11/2026')
  })
})

describe('lifecycleSteps', () => {
  it('marks earlier steps done and the current one current', () => {
    const steps = lifecycleSteps('REGISTRATION_OPEN')
    expect(steps.map((step) => step.state)).toEqual(['done', 'done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming'])
  })

  it('stops a cancelled event at the last step it reached', () => {
    const steps = lifecycleSteps('CANCELLED', 'APPROVED')
    expect(steps.filter((step) => step.state === 'done').map((step) => step.status)).toEqual(['DRAFT', 'PENDING_APPROVAL', 'APPROVED'])
    expect(steps.some((step) => step.state === 'current')).toBe(false)
  })

  it('reaches the settled and closed steps at the end of the event (FR-FIN-11, FR-EVT-16)', () => {
    expect(lifecycleSteps('SETTLED').map((step) => step.state).slice(-3)).toEqual(['done', 'current', 'upcoming'])
    expect(lifecycleSteps('CLOSED').map((step) => step.state).slice(-2)).toEqual(['done', 'current'])
  })
})

describe('eventTransitions', () => {
  it('shows only the transitions the server allows, in a fixed order', () => {
    expect(eventTransitions(['CANCEL', 'REGISTER', 'APPROVE', 'REJECT'])).toEqual(['APPROVE', 'REJECT', 'CANCEL'])
    expect(eventTransitions(['REGISTER', 'VIEW_REGISTRATIONS'])).toEqual([])
  })

  it('requires a reason to reject or cancel', () => {
    expect(reasonRequired('REJECT')).toBe(true)
    expect(reasonRequired('CANCEL')).toBe(true)
    expect(reasonRequired('APPROVE')).toBe(false)
  })

  it('shows closing as the main action and confirms it in a dialog because it cannot be undone', () => {
    expect(eventTransitions(['CLOSE', 'VIEW_FUND'])).toEqual(['CLOSE'])
    expect(needsDialog('CLOSE')).toBe(true)
    expect(needsDialog('APPROVE')).toBe(true)
    expect(needsDialog('OPEN_REGISTRATION')).toBe(false)
    expect(reasonRequired('CLOSE')).toBe(false)
  })
})

describe('seatInfo', () => {
  it('reports remaining seats and fullness', () => {
    expect(seatInfo({ capacity: 12, confirmedCount: 11, waitlistCount: 0 })).toMatchObject({ limited: true, remaining: 1, full: false })
    expect(seatInfo({ capacity: 12, confirmedCount: 12, waitlistCount: 3 })).toMatchObject({ remaining: 0, full: true, ratio: 1 })
  })

  it('treats a null capacity as unlimited', () => {
    expect(seatInfo({ capacity: null, confirmedCount: 40, waitlistCount: 0 })).toMatchObject({ limited: false, full: false })
  })
})

describe('selectableLead', () => {
  it('keeps the proposer while still eligible and asks for a new pick otherwise', () => {
    const candidates = [{ id: 'u-ha' }, { id: 'u-kiet' }]
    expect(selectableLead(candidates, 'u-ha')).toBe('u-ha')
    expect(selectableLead(candidates, 'u-left')).toBe('')
    expect(selectableLead([], 'u-ha')).toBe('')
  })
})
