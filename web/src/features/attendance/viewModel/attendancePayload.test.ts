import { describe, expect, it } from 'vitest'
import { parseAttendancePayload } from './attendancePayload'

describe('parseAttendancePayload (FR-ATT-06)', () => {
  it('reads a session code without a day', () => {
    expect(parseAttendancePayload('clubee://attendance?type=SESSION&club=c-guitar&id=s-weekly-now&code=abc123')).toEqual({
      ok: true,
      activity: { type: 'SESSION', clubId: 'c-guitar', id: 's-weekly-now' },
      code: 'abc123',
      day: null,
    })
  })

  it('reads an event code with its day, ignoring spaces around the text', () => {
    expect(parseAttendancePayload('  clubee://attendance?type=EVENT&club=c-guitar&id=e-winter&code=f00d&day=2026-11-20\n')).toMatchObject({
      ok: true,
      activity: { type: 'EVENT', id: 'e-winter' },
      day: '2026-11-20',
    })
  })

  it('rejects anything that is not a complete Clubee attendance code', () => {
    const notOurs = { ok: false, message: 'Đây không phải mã điểm danh Clubee.' }
    expect(parseAttendancePayload('https://example.com')).toEqual(notOurs)
    expect(parseAttendancePayload('clubee://attendance?type=SESSION&club=c-guitar&id=s-1')).toEqual(notOurs)
    expect(parseAttendancePayload('clubee://attendance?type=TASK&club=c-guitar&id=t-1&code=a')).toEqual(notOurs)
    expect(parseAttendancePayload('clubee://attendance?type=EVENT&club=c-guitar&id=e-1&code=a')).toEqual(notOurs)
    expect(parseAttendancePayload('clubee://attendance?type=EVENT&club=c-guitar&id=e-1&code=a&day=20-11-2026')).toEqual(notOurs)
  })
})
