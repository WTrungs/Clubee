import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { eventActivity } from '@/api/mocks/mockAttendance'
import { toVnIso } from '@/api/mocks/mockTime'
import { signInAs } from '@/testUtils'
import { attendanceRepository } from '../model/attendanceRepository'
import type { AttendanceActivityRef } from '../model/attendanceTypes'
import { parseAttendancePayload } from './attendancePayload'

const CYCLE_MS = 30 * 1000
const MINUTE_MS = 60 * 1000
const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const weekly: AttendanceActivityRef = { type: 'SESSION', clubId: 'c-guitar', id: 's-weekly-now' }
const winter: AttendanceActivityRef = { type: 'EVENT', clubId: 'c-guitar', id: 'e-winter' }
const recordOf = (activityId: string, userId: string) => db.attendance.find((record) => record.activityId === activityId && record.userId === userId)

/** Mã đang chiếu, lấy như người phụ trách (ban chủ nhiệm `u-anh`) rồi đọc như người quét. */
async function shownCode(activity: AttendanceActivityRef, day: string | null = null) {
  signInAs('u-anh')
  const parsed = parseAttendancePayload((await attendanceRepository.code(activity, day)).payload)
  if (!parsed.ok) throw new Error('Mã QR mock không đọc được')
  return { code: parsed.code, day: parsed.day }
}

function startSessionIn(minutes: number) {
  const session = db.sessions.find((candidate) => candidate.id === 's-weekly-now')
  if (!session) throw new Error('Thiếu buổi s-weekly-now trong seed')
  session.startAt = toVnIso(Date.now() + minutes * MINUTE_MS)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('checking in with the QR code (FR-ATT-06, BR-ATT-01, BR-ATT-02)', () => {
  it('records Late for a scan after the start, by QR, and tells which session and club', async () => {
    const request = await shownCode(weekly)
    signInAs('u-hieu')
    const result = await attendanceRepository.checkIn(weekly, request)
    expect(result).toMatchObject({
      activity: { type: 'SESSION', id: 's-weekly-now', name: 'Sinh hoạt định kỳ: hòa âm cơ bản' },
      clubName: 'CLB Guitar Sinh viên',
      day: null,
      status: 'LATE',
      alreadyRecorded: false,
    })
    expect(recordOf('s-weekly-now', 'u-hieu')).toMatchObject({ status: 'LATE', method: 'QR', recordedBy: 'u-hieu', extra: false })
  })

  it('records Present for a scan before the start', async () => {
    startSessionIn(5)
    const request = await shownCode(weekly)
    signInAs('u-hieu')
    expect((await attendanceRepository.checkIn(weekly, request)).status).toBe('PRESENT')
  })

  it('keeps the first record when the same person scans again, even after a manual mark', async () => {
    const request = await shownCode(weekly)
    signInAs('u-bao')
    const again = await attendanceRepository.checkIn(weekly, request)
    expect(again).toMatchObject({ status: 'PRESENT', alreadyRecorded: true })
    expect(recordOf('s-weekly-now', 'u-bao')).toMatchObject({ method: 'MANUAL', recordedBy: 'u-anh', version: 1 })
  })

  it('does not turn an excused record into present; it returns that record so the page can warn', async () => {
    const request = await shownCode(weekly)
    signInAs('u-ha')
    expect(await attendanceRepository.checkIn(weekly, request)).toMatchObject({ status: 'EXCUSED', alreadyRecorded: true })
    expect(recordOf('s-weekly-now', 'u-ha')).toMatchObject({ status: 'EXCUSED', version: 1 })
  })

  it('accepts the code of the previous cycle but not an older one', async () => {
    const cycleStart = Math.floor(Date.now() / CYCLE_MS) * CYCLE_MS
    const clock = vi.spyOn(Date, 'now').mockReturnValue(cycleStart + 1000)
    const request = await shownCode(weekly)
    clock.mockReturnValue(cycleStart + CYCLE_MS + 1000)
    signInAs('u-hieu')
    expect((await attendanceRepository.checkIn(weekly, request)).alreadyRecorded).toBe(false)

    clock.mockReturnValue(cycleStart + 2 * CYCLE_MS + 1000)
    signInAs('u-linh')
    expect(await fail(attendanceRepository.checkIn(weekly, request))).toMatchObject({ status: 422, code: 'INVALID_CODE' })
  })

  it('answers a wrong code or an unknown session the same way, without saying whether it exists', async () => {
    const request = await shownCode(weekly)
    signInAs('u-hieu')
    const wrong = await fail(attendanceRepository.checkIn(weekly, { ...request, code: 'abc' }))
    expect(wrong).toMatchObject({ status: 422, code: 'INVALID_CODE', detail: 'Mã điểm danh không đúng hoặc đã hết hạn. Quét lại mã đang chiếu.' })
    expect(await fail(attendanceRepository.checkIn({ ...weekly, id: 's-missing' }, request))).toMatchObject({ status: 422, code: 'INVALID_CODE' })
    expect(await fail(attendanceRepository.checkIn({ ...weekly, clubId: 'c-english' }, request))).toMatchObject({ status: 422, code: 'INVALID_CODE' })
    expect(recordOf('s-weekly-now', 'u-hieu')).toBeUndefined()
  })

  it('refuses someone outside the club even with a valid code', async () => {
    const request = await shownCode(weekly)
    signInAs('u-tu')
    expect(await fail(attendanceRepository.checkIn(weekly, request))).toMatchObject({ status: 403, code: 'NOT_A_MEMBER' })
    expect(recordOf('s-weekly-now', 'u-tu')).toBeUndefined()
  })

  it('refuses once the sheet is closed, or before attendance opens', async () => {
    const request = await shownCode(weekly)
    startSessionIn(120)
    signInAs('u-hieu')
    expect(await fail(attendanceRepository.checkIn(weekly, request))).toMatchObject({ status: 422, code: 'ATTENDANCE_NOT_OPEN' })

    startSessionIn(-30)
    signInAs('u-anh')
    const sheet = await attendanceRepository.sheet(weekly, {})
    await attendanceRepository.close(weekly, { action: 'CLOSE', day: null, version: sheet.version })
    signInAs('u-hieu')
    expect(await fail(attendanceRepository.checkIn(weekly, request))).toMatchObject({ status: 422, code: 'ATTENDANCE_CLOSED' })
  })

  it('lets a club member who did not register check in to an event day, marked as extra (FR-ATT-07)', async () => {
    const event = db.events.find((candidate) => candidate.id === 'e-winter')
    if (!event) throw new Error('Thiếu sự kiện e-winter trong seed')
    Object.assign(event, { startAt: toVnIso(Date.now() - 10 * MINUTE_MS), endAt: toVnIso(Date.now() + 60 * MINUTE_MS) })
    signInAs('u-anh')
    const { day } = await attendanceRepository.sheet(winter, {})
    const request = await shownCode(winter, day)
    signInAs('u-yen')
    expect(await attendanceRepository.checkIn(winter, request)).toMatchObject({ day, status: 'LATE', alreadyRecorded: false })
    expect(recordOf('e-winter', 'u-yen')).toMatchObject({ extra: true, method: 'QR', day })
    expect(await fail(attendanceRepository.checkIn(winter, { ...request, day: null }))).toMatchObject({ code: 'INVALID_CODE' })
  })

  it('starts the later days of a multi-day event at the same time as the first day', () => {
    const base = db.events.find((candidate) => candidate.id === 'e-winter')
    if (!base) throw new Error('Thiếu sự kiện e-winter trong seed')
    const activity = eventActivity({ ...base, startAt: '2026-11-20T18:00:00+07:00', endAt: '2026-11-22T21:00:00+07:00' })
    expect(activity.days).toEqual(['2026-11-20', '2026-11-21', '2026-11-22'])
    expect(activity.startsAt('2026-11-20')).toBe('2026-11-20T18:00:00+07:00')
    expect(activity.startsAt('2026-11-22')).toBe('2026-11-22T18:00:00+07:00')
  })
})
