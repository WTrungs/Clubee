import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { toVnIso, vnDate } from '@/api/mocks/mockTime'
import { eventRepository } from '@/features/event/model/eventRepository'
import { signInAs } from '@/testUtils'
import { attendanceRepository } from '../model/attendanceRepository'
import type { AttendanceActivityRef } from '../model/attendanceTypes'
import { sessionRepository } from '../model/sessionRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const session = (id: string): AttendanceActivityRef => ({ type: 'SESSION', clubId: 'c-guitar', id })
const event = (id: string): AttendanceActivityRef => ({ type: 'EVENT', clubId: 'c-guitar', id })
const weekly = session('s-weekly-now')
const recordsOf = (activityId: string, userId: string) => db.attendance.filter((record) => record.activityId === activityId && record.userId === userId)

/** Dời sự kiện về quanh lúc này để khung điểm danh đang mở. */
function startEventNow(eventId: string) {
  const stored = db.events.find((candidate) => candidate.id === eventId)
  if (stored) Object.assign(stored, { startAt: toVnIso(Date.now() - 10 * 60 * 1000), endAt: toVnIso(Date.now() + 60 * 60 * 1000) })
}

describe('manual attendance (FR-ATT-07)', () => {
  it('keeps one record per person and rejects a stale version (BR-ATT-01, NFR-REL-03)', async () => {
    signInAs('u-anh')
    const sheet = await attendanceRepository.sheet(weekly, {})
    expect(sheet.allowedActions).toEqual(['MARK', 'SHOW_QR', 'CLOSE'])
    const first = await attendanceRepository.mark(weekly, 'u-long', { day: null, status: 'PRESENT', version: 0 })
    expect(first).toMatchObject({ extra: false, record: { status: 'PRESENT', method: 'MANUAL', version: 1, recordedBy: { id: 'u-anh' } } })
    const second = await attendanceRepository.mark(weekly, 'u-long', { day: null, status: 'LATE', version: 1 })
    expect(second.record).toMatchObject({ status: 'LATE', version: 2 })
    expect(recordsOf('s-weekly-now', 'u-long')).toHaveLength(1)

    const stale = await fail(attendanceRepository.mark(weekly, 'u-long', { day: null, status: 'ABSENT', version: 1 }))
    expect(stale?.status).toBe(409)
    const resent = await fail(attendanceRepository.mark(weekly, 'u-long', { day: null, status: 'PRESENT', version: 0 }))
    expect(resent?.status).toBe(409)
    expect(recordsOf('s-weekly-now', 'u-long')).toHaveLength(1)
    expect((await attendanceRepository.sheet(weekly, {})).version).toBe(sheet.version + 2)
  })

  it('opens only from the configured minutes before the start (BR-ATT-02)', async () => {
    signInAs('u-linh')
    const plan = session('s-media-plan')
    const sheet = await attendanceRepository.sheet(plan, {})
    expect(sheet.allowedActions).toEqual([])
    expect(Date.parse(sheet.opensAt)).toBe(Date.parse(db.sessions.find((candidate) => candidate.id === 's-media-plan')?.startAt ?? '') - 15 * 60 * 1000)
    const error = await fail(attendanceRepository.mark(plan, 'u-ha', { day: null, status: 'PRESENT', version: 0 }))
    expect(error).toMatchObject({ status: 422, code: 'ATTENDANCE_NOT_OPEN', detail: expect.stringContaining('Điểm danh mở lúc') })
  })

  it('tags people outside the audience as extra and only offers club members (FR-ATT-07)', async () => {
    signInAs('u-anh')
    const candidates = await attendanceRepository.candidates(weekly, { day: null, q: '' })
    // Buổi toàn CLB: chỉ người Tạm nghỉ là ngoài đối tượng.
    expect(candidates.map((candidate) => candidate.id)).toEqual(['u-yen'])
    const row = await attendanceRepository.mark(weekly, 'u-yen', { day: null, status: 'PRESENT', version: 0 })
    expect(row.extra).toBe(true)
    const sheet = await attendanceRepository.sheet(weekly, { status: 'EXTRA' })
    expect(sheet.counts.extra).toBe(1)
    expect(sheet.rows.content.map((item) => item.person.id)).toEqual(['u-yen'])
    expect((await attendanceRepository.candidates(weekly, { day: null, q: '' })).map((candidate) => candidate.id)).toEqual([])

    const outsider = await fail(attendanceRepository.mark(weekly, 'u-tu', { day: null, status: 'PRESENT', version: 0 }))
    expect(outsider).toMatchObject({ status: 404, code: 'MEMBER_NOT_FOUND' })
  })

  it('counts only members who had joined by the session day, and rejects an unknown filter', async () => {
    // Buổi không giới hạn chỗ tính cả phạm vi; người gia nhập sau ngày diễn ra buổi không thuộc đối tượng.
    const nam = db.memberships.find((membership) => membership.userId === 'u-nam' && membership.clubId === 'c-guitar')
    if (nam) nam.joinedOn = vnDate(1)
    signInAs('u-anh')
    expect((await attendanceRepository.sheet(weekly, {})).rows.content.map((row) => row.person.id)).not.toContain('u-nam')
    expect((await attendanceRepository.sheet(session('s-music-rehearsal'), {})).rows.content.map((row) => row.person.id)).toContain('u-nam')
    expect((await fail(attendanceRepository.sheet(weekly, { status: 'MAYBE' as never })))?.status).toBe(400)
  })

  it('leaves the sheet to the people running the session (SRS 3.1, 3.2)', async () => {
    signInAs('u-ha')
    expect(await fail(attendanceRepository.sheet(weekly, {}))).toMatchObject({ status: 403, detail: 'Chỉ người phụ trách buổi và ban chủ nhiệm xem được điểm danh.' })
    signInAs('u-linh')
    expect((await fail(attendanceRepository.sheet(weekly, {})))?.status).toBe(403)
    expect((await attendanceRepository.sheet(session('s-media-photo'), {})).rows.totalElements).toBe(4)
    signInAs('u-tam')
    expect((await fail(attendanceRepository.sheet(weekly, {})))?.status).toBe(403)
  })
})

describe('closing attendance (FR-ATT-08, closing part)', () => {
  it('marks everyone still unmarked as absent, keeps existing records and skips people on leave', async () => {
    signInAs('u-anh')
    const before = await attendanceRepository.sheet(weekly, {})
    const unmarked = before.counts.unmarked
    expect(unmarked).toBeGreaterThan(0)
    const after = await attendanceRepository.close(weekly, { action: 'CLOSE', day: null, version: before.version })

    expect(after.closedAt).not.toBeNull()
    expect(after.closedBy?.id).toBe('u-anh')
    // Đã chốt: chỉ còn sửa có lý do (FR-ATT-08).
    expect(after.allowedActions).toEqual(['EDIT'])
    expect(after.counts).toMatchObject({ unmarked: 0, absent: before.counts.absent + unmarked, present: before.counts.present, excused: 1 })
    expect(recordsOf('s-weekly-now', 'u-ha')[0]?.status).toBe('EXCUSED')
    expect(recordsOf('s-weekly-now', 'u-yen')).toEqual([])
    expect((await sessionRepository.get('c-guitar', 's-weekly-now')).attendanceClosed).toBe(true)

    const again = await fail(attendanceRepository.close(weekly, { action: 'CLOSE', day: null, version: after.version }))
    expect(again).toMatchObject({ status: 422, code: 'ATTENDANCE_CLOSED' })
    const edit = await fail(attendanceRepository.mark(weekly, 'u-bao', { day: null, status: 'LATE', version: 1 }))
    expect(edit).toMatchObject({ status: 400, fieldErrors: [{ field: 'reason' }] })
  })

  it('refuses to close when the list changed since it was read, so the absent count stays right', async () => {
    signInAs('u-anh')
    const before = await attendanceRepository.sheet(weekly, {})
    await attendanceRepository.mark(weekly, 'u-long', { day: null, status: 'PRESENT', version: 0 })
    const error = await fail(attendanceRepository.close(weekly, { action: 'CLOSE', day: null, version: before.version }))
    expect(error?.status).toBe(409)
    expect((await attendanceRepository.sheet(weekly, {})).closedAt).toBeNull()
  })
})

describe('event attendance', () => {
  it('lets every active staff member mark, but only the event lead and the board close', async () => {
    startEventNow('e-winter')
    const winter = event('e-winter')
    signInAs('u-ha')
    const sheet = await attendanceRepository.sheet(winter, {})
    expect(sheet.allowedActions).toEqual(['MARK', 'SHOW_QR'])
    expect(sheet.counts.expected).toBe(11)
    await attendanceRepository.mark(winter, 'u-anh', { day: sheet.day, status: 'PRESENT', version: 0 })
    const refused = await fail(attendanceRepository.close(winter, { action: 'CLOSE', day: sheet.day, version: sheet.version + 1 }))
    expect(refused).toMatchObject({ status: 403, detail: 'Chỉ Trưởng BTC và ban chủ nhiệm được chốt điểm danh sự kiện.' })

    signInAs('u-bao')
    expect((await attendanceRepository.sheet(winter, {})).allowedActions).toEqual(['MARK', 'SHOW_QR', 'CLOSE'])
    signInAs('u-yen')
    expect((await fail(attendanceRepository.sheet(winter, {})))?.status).toBe(403)
  })

  it('keeps one list per day for a multi-day event', async () => {
    signInAs('u-anh')
    const live = event('e-livestream')
    const today = await attendanceRepository.sheet(live, {})
    expect(today.day).toBe(vnDate(0))
    expect(today.days).toEqual([vnDate(0), vnDate(1)])
    await attendanceRepository.mark(live, 'u-vy', { day: vnDate(0), status: 'PRESENT', version: 0 })

    const tomorrow = await attendanceRepository.sheet(live, { day: vnDate(1) })
    expect(tomorrow.opensAt).toBe(`${vnDate(1)}T00:00:00+07:00`)
    expect(tomorrow.allowedActions).toEqual([])
    expect(tomorrow.rows.content.every((row) => row.record === null)).toBe(true)
    expect((await fail(attendanceRepository.mark(live, 'u-vy', { day: vnDate(1), status: 'PRESENT', version: 0 })))?.code).toBe('ATTENDANCE_NOT_OPEN')
    expect((await fail(attendanceRepository.mark(live, 'u-vy', { day: vnDate(5), status: 'PRESENT', version: 0 })))?.status).toBe(400)
  })

  it('makes a closed event read-only and has no attendance for a cancelled one', async () => {
    const exchange = db.events.find((candidate) => candidate.id === 'e-exchange')
    if (exchange) exchange.status = 'CLOSED'
    signInAs('u-anh')
    expect((await eventRepository.get('c-guitar', 'e-exchange')).allowedActions).toContain('VIEW_ATTENDANCE')
    const sheet = await attendanceRepository.sheet(event('e-exchange'), {})
    expect(sheet).toMatchObject({ readOnlyReason: 'Sự kiện đã đóng nên điểm danh chỉ xem được.', allowedActions: [] })
    const write = await fail(attendanceRepository.mark(event('e-exchange'), 'u-ha', { day: sheet.day, status: 'PRESENT', version: 0 }))
    expect(write?.code).toBe('EVENT_READ_ONLY')
    signInAs('u-huy')
    // Trưởng BTC mất chức khi sự kiện Đã đóng; vẫn là ban chủ nhiệm nên còn xem được.
    expect((await attendanceRepository.sheet(event('e-exchange'), {})).readOnlyReason).not.toBeNull()

    signInAs('u-anh')
    expect((await fail(attendanceRepository.sheet(event('e-acoustic-sep'), {})))?.code).toBe('ATTENDANCE_UNAVAILABLE')
    expect((await eventRepository.get('c-guitar', 'e-acoustic-sep')).allowedActions).not.toContain('VIEW_ATTENDANCE')
    signInAs('u-tam')
    expect((await fail(attendanceRepository.sheet(event('e-acoustic-sep'), {})))?.status).toBe(403)
  })
})
