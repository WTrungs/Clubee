import { describe, expect, it } from 'vitest'
import { activityDays } from './mockAttendance'

describe('activityDays', () => {
  it('lists every Vietnam calendar day an event touches', () => {
    expect(activityDays('2026-11-07T19:00:00+07:00', '2026-11-07T22:00:00+07:00')).toEqual(['2026-11-07'])
    expect(activityDays('2026-11-07T23:00:00+07:00', '2026-11-09T01:00:00+07:00')).toEqual(['2026-11-07', '2026-11-08', '2026-11-09'])
  })

  it('does not add an empty day when the event ends exactly at midnight', () => {
    expect(activityDays('2026-11-07T19:00:00+07:00', '2026-11-08T00:00:00+07:00')).toEqual(['2026-11-07'])
  })
})
