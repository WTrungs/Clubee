import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { toVnIso, vnDate } from '@/api/mocks/mockTime'
import { signInAs } from '@/testUtils'
import { attendanceRepository } from '../model/attendanceRepository'
import type { AttendanceActivityRef } from '../model/attendanceTypes'

const CYCLE_MS = 30 * 1000
const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const session = (id: string): AttendanceActivityRef => ({ type: 'SESSION', clubId: 'c-guitar', id })
const event = (id: string): AttendanceActivityRef => ({ type: 'EVENT', clubId: 'c-guitar', id })
const weekly = session('s-weekly-now')
const paramsOf = (payload: string) => new URL(payload).searchParams

function startEventNow(eventId: string) {
  const stored = db.events.find((candidate) => candidate.id === eventId)
  if (stored) Object.assign(stored, { startAt: toVnIso(Date.now() - 10 * 60 * 1000), endAt: toVnIso(Date.now() + 60 * 60 * 1000) })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('attendance QR code (FR-ATT-05)', () => {
  it('keeps one code for the whole cycle and issues a new one in the next cycle', async () => {
    signInAs('u-anh')
    const cycleStart = Math.floor(Date.now() / CYCLE_MS) * CYCLE_MS
    const clock = vi.spyOn(Date, 'now').mockReturnValue(cycleStart + 1000)

    const first = await attendanceRepository.code(weekly, null)
    expect(first).toMatchObject({ day: null, refreshSeconds: 30 })
    expect(Date.parse(first.expiresAt)).toBe(cycleStart + CYCLE_MS)
    expect(first.payload.startsWith('clubee://attendance?')).toBe(true)
    expect(Object.fromEntries(paramsOf(first.payload))).toMatchObject({ type: 'SESSION', club: 'c-guitar', id: 's-weekly-now' })
    expect(paramsOf(first.payload).get('code')).toMatch(/^[0-9a-f]{24}$/)
    expect(paramsOf(first.payload).has('day')).toBe(false)

    clock.mockReturnValue(cycleStart + 25_000)
    expect((await attendanceRepository.code(weekly, null)).payload).toBe(first.payload)

    clock.mockReturnValue(cycleStart + CYCLE_MS + 1000)
    const next = await attendanceRepository.code(weekly, null)
    expect(next.payload).not.toBe(first.payload)
    expect(Date.parse(next.expiresAt)).toBe(cycleStart + 2 * CYCLE_MS)

    // Chỉ giữ mã của chu kỳ hiện tại và chu kỳ liền trước.
    clock.mockReturnValue(cycleStart + 5 * CYCLE_MS)
    await attendanceRepository.code(weekly, null)
    expect(db.attendanceCodes.filter((item) => item.activityId === 's-weekly-now').length).toBeLessThanOrEqual(2)
  })

  it('offers the code only from the opening time until attendance is closed (BR-ATT-02)', async () => {
    signInAs('u-linh')
    const plan = session('s-media-plan')
    expect((await attendanceRepository.sheet(plan, {})).allowedActions).not.toContain('SHOW_QR')
    expect(await fail(attendanceRepository.code(plan, null))).toMatchObject({ status: 422, code: 'ATTENDANCE_NOT_OPEN' })

    signInAs('u-anh')
    const sheet = await attendanceRepository.sheet(weekly, {})
    expect(sheet.allowedActions).toContain('SHOW_QR')
    const closed = await attendanceRepository.close(weekly, { action: 'CLOSE', day: null, version: sheet.version })
    expect(closed.allowedActions).not.toContain('SHOW_QR')
    expect(await fail(attendanceRepository.code(weekly, null))).toMatchObject({ status: 422, code: 'ATTENDANCE_CLOSED' })
  })

  it('gives the code only to the people running the session or the event, one code per event day', async () => {
    signInAs('u-ha')
    expect(await fail(attendanceRepository.code(weekly, null))).toMatchObject({ status: 403, detail: 'Chỉ người phụ trách buổi và ban chủ nhiệm được mở mã QR điểm danh.' })

    startEventNow('e-winter')
    const winter = event('e-winter')
    const sheet = await attendanceRepository.sheet(winter, {})
    expect(sheet.allowedActions).toEqual(['MARK', 'SHOW_QR'])
    const code = await attendanceRepository.code(winter, sheet.day)
    expect(code.day).toBe(sheet.day)
    expect(Object.fromEntries(paramsOf(code.payload))).toMatchObject({ type: 'EVENT', id: 'e-winter', day: sheet.day })

    signInAs('u-yen')
    expect((await fail(attendanceRepository.code(winter, sheet.day)))?.status).toBe(403)
  })

  it('has no code for a closed event, a day not yet open or a day outside the event', async () => {
    const exchange = db.events.find((candidate) => candidate.id === 'e-exchange')
    if (exchange) exchange.status = 'CLOSED'
    signInAs('u-anh')
    expect((await fail(attendanceRepository.code(event('e-exchange'), null)))?.code).toBe('EVENT_READ_ONLY')

    const live = event('e-livestream')
    expect((await attendanceRepository.code(live, vnDate(0))).day).toBe(vnDate(0))
    expect((await fail(attendanceRepository.code(live, vnDate(1))))?.code).toBe('ATTENDANCE_NOT_OPEN')
    expect((await fail(attendanceRepository.code(live, vnDate(5))))?.status).toBe(400)
  })
})
