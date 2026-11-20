import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { vnDate, vnDayAt } from '@/api/mocks/mockTime'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { signInAs } from '@/testUtils'
import { attendanceRepository } from '../model/attendanceRepository'
import { sessionRepository } from '../model/sessionRepository'
import type { CreateSessionSeriesRequest, SessionDetail, UpdateSessionRequest } from '../model/sessionTypes'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const seriesRequest = (fields: Partial<CreateSessionSeriesRequest> = {}): CreateSessionSeriesRequest => ({
  scopeType: 'DEPARTMENT',
  departmentId: 'd-media',
  title: 'Họp ban Truyền thông hằng tuần',
  description: '',
  startAt: vnDayAt(4, 18),
  endAt: vnDayAt(4, 20),
  location: 'Phòng truyền thông A2',
  capacity: null,
  registrationDeadline: vnDayAt(3, 22),
  recurrence: { frequency: 'WEEKLY', until: vnDate(25) },
  ...fields,
})
const sessionTitlesOf = async (userId: string) => {
  signInAs(userId)
  return (await notificationRepository.list({ category: 'SESSION', size: 50 })).content.map((item) => item.title)
}
const updateOf = (session: SessionDetail, fields: Partial<UpdateSessionRequest> = {}): UpdateSessionRequest => ({
  title: session.title,
  description: session.description,
  startAt: session.startAt,
  endAt: session.endAt,
  location: session.location,
  capacity: session.capacity,
  registrationDeadline: session.registrationDeadline,
  version: session.version,
  ...fields,
})
const sessionActivity = (id: string) => ({ type: 'SESSION' as const, clubId: 'c-guitar', id })

describe('creating a series (FR-ATT-02)', () => {
  it('creates one session per week with the same clock time and deadline offset, and sends one notice', async () => {
    signInAs('u-linh')
    const result = await sessionRepository.createSeries('c-guitar', seriesRequest())
    expect(result.sessions).toHaveLength(4)
    expect(result.sessions.map((session) => session.series)).toEqual([1, 2, 3, 4].map((index) => ({ id: result.seriesId, index, count: 4 })))
    expect(result.sessions.map((session) => session.startAt)).toEqual([4, 11, 18, 25].map((day) => vnDayAt(day, 18)))
    expect(result.sessions[3]?.registrationDeadline).toBe(vnDayAt(24, 22))
    const titles = await sessionTitlesOf('u-ha')
    expect(titles.filter((title) => title.includes('Họp ban Truyền thông hằng tuần'))).toEqual(['Chuỗi buổi sinh hoạt mới: Họp ban Truyền thông hằng tuần'])
  })

  it('checks the repetition on the server and the scope like a single session', async () => {
    signInAs('u-linh')
    const short = await fail(sessionRepository.createSeries('c-guitar', seriesRequest({ recurrence: { frequency: 'WEEKLY', until: vnDate(8) } })))
    expect(short).toMatchObject({ status: 400, fieldErrors: [{ field: 'recurrence.until', message: 'Chuỗi cần ít nhất 2 buổi; chọn ngày kết thúc xa hơn.' }] })
    const frequency = await fail(sessionRepository.createSeries('c-guitar', seriesRequest({ recurrence: { frequency: 'DAILY' as 'WEEKLY', until: vnDate(25) } })))
    expect(frequency?.fieldErrors?.map((error) => error.field)).toEqual(['recurrence.frequency'])
    const before = db.sessions.length
    const scope = await fail(sessionRepository.createSeries('c-guitar', seriesRequest({ departmentId: 'd-logistics' })))
    expect(scope?.status).toBe(403)
    expect(db.sessions).toHaveLength(before)
  })
})

describe('editing one session of a series (FR-ATT-02)', () => {
  it('changes only that session and tells its audience when the time or place moves', async () => {
    signInAs('u-anh')
    const second = await sessionRepository.get('c-guitar', 's-song-2')
    expect(second).toMatchObject({ series: { id: 'ser-guitar-song', index: 2, count: 4 }, allowedActions: ['VIEW_ATTENDANCE', 'EDIT', 'CANCEL'] })
    const third = await sessionRepository.get('c-guitar', 's-song-3')

    const renamed = await sessionRepository.update('c-guitar', 's-song-2', updateOf(second, { title: 'Tập hát đệm: bài mới' }))
    expect(renamed).toMatchObject({ title: 'Tập hát đệm: bài mới', version: second.version + 1 })
    expect(await sessionTitlesOf('u-bao')).not.toContain('Buổi sinh hoạt đổi giờ hoặc địa điểm: Tập hát đệm: bài mới')

    signInAs('u-anh')
    await sessionRepository.update('c-guitar', 's-song-2', updateOf(renamed, { location: 'Hội trường E' }))
    expect(await sessionTitlesOf('u-bao')).toContain('Buổi sinh hoạt đổi giờ hoặc địa điểm: Tập hát đệm: bài mới')
    // Thành viên ban khác không thuộc đối tượng nên không nhận.
    expect(await sessionTitlesOf('u-ha')).not.toContain('Buổi sinh hoạt đổi giờ hoặc địa điểm: Tập hát đệm: bài mới')

    signInAs('u-anh')
    expect(await sessionRepository.get('c-guitar', 's-song-3')).toEqual(third)
  })

  it('checks permission, then version, then state, then fields', async () => {
    signInAs('u-anh')
    const session = await sessionRepository.get('c-guitar', 's-song-3')
    signInAs('u-bao')
    expect(await fail(sessionRepository.update('c-guitar', 's-song-3', updateOf(session, { version: 99, title: '' })))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    signInAs('u-anh')
    expect(await fail(sessionRepository.update('c-guitar', 's-song-3', updateOf(session, { version: 99, title: '' })))).toMatchObject({ status: 409 })
    expect(await fail(sessionRepository.update('c-guitar', 's-song-3', updateOf(session, { title: '' })))).toMatchObject({ status: 400 })
    const past = await sessionRepository.get('c-guitar', 's-song-1')
    expect(past.allowedActions).toEqual(['VIEW_ATTENDANCE'])
    expect(await fail(sessionRepository.update('c-guitar', 's-song-1', updateOf(past, { title: '' })))).toMatchObject({ status: 422, code: 'SESSION_STARTED' })
    expect(await fail(sessionRepository.cancel('c-guitar', 's-song-1', { reason: 'Muốn hủy buổi đã qua.', version: past.version }))).toMatchObject({ status: 422, code: 'SESSION_STARTED' })
  })
})

describe('cancelling a session (FR-ATT-02)', () => {
  it('needs a reason, keeps the rest of the series and tells the audience', async () => {
    signInAs('u-anh')
    const session = await sessionRepository.get('c-guitar', 's-song-3')
    signInAs('u-bao')
    expect(await fail(sessionRepository.cancel('c-guitar', 's-song-3', { reason: 'ngắn', version: 99 }))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    signInAs('u-anh')
    expect(await fail(sessionRepository.cancel('c-guitar', 's-song-3', { reason: 'ngắn', version: 99 }))).toMatchObject({ status: 409 })
    expect(await fail(sessionRepository.cancel('c-guitar', 's-song-3', { reason: 'ngắn', version: session.version }))).toMatchObject({ status: 400 })
    const cancelled = await sessionRepository.cancel('c-guitar', 's-song-3', { reason: 'Phòng bị trưng dụng thi cuối kỳ.', version: session.version })
    expect(cancelled).toMatchObject({
      cancelled: true,
      allowedActions: [],
      cancellation: { by: { id: 'u-anh' }, reason: 'Phòng bị trưng dụng thi cuối kỳ.' },
    })
    expect((await sessionRepository.get('c-guitar', 's-song-4')).cancelled).toBe(false)
    const upcoming = await sessionRepository.list('c-guitar', { when: 'UPCOMING' })
    expect(upcoming.content.find((item) => item.id === 's-song-3')).toMatchObject({ cancelled: true, series: { index: 3, count: 4 } })
    expect(await sessionTitlesOf('u-bao')).toContain('Buổi sinh hoạt bị hủy: Tập hát đệm')

    signInAs('u-anh')
    const again = await fail(sessionRepository.cancel('c-guitar', 's-song-3', { reason: 'Hủy lần nữa cho chắc.', version: cancelled.version }))
    expect(again).toMatchObject({ status: 422, code: 'SESSION_CANCELLED' })
    expect(await fail(sessionRepository.update('c-guitar', 's-song-3', updateOf(cancelled)))).toMatchObject({ status: 422, code: 'SESSION_CANCELLED' })
  })

  it('closes every attendance route of a cancelled session', async () => {
    signInAs('u-anh')
    const session = await sessionRepository.get('c-guitar', 's-song-2')
    await sessionRepository.cancel('c-guitar', 's-song-2', { reason: 'Trùng lịch diễn của CLB.', version: session.version })
    const activity = sessionActivity('s-song-2')
    expect(await fail(attendanceRepository.sheet(activity, {}))).toMatchObject({ status: 422, code: 'SESSION_CANCELLED' })
    expect(await fail(attendanceRepository.code(activity, null))).toMatchObject({ status: 422, code: 'SESSION_CANCELLED' })
    expect(await fail(attendanceRepository.mark(activity, 'u-bao', { status: 'PRESENT', day: null, version: 0 }))).toMatchObject({ status: 422, code: 'SESSION_CANCELLED' })
    // Người ngoài nhóm phụ trách vẫn nhận 403 trước, không biết thêm gì về buổi.
    signInAs('u-bao')
    expect(await fail(attendanceRepository.sheet(activity, {}))).toMatchObject({ status: 403 })
  })
})

describe('seeded series', () => {
  it('has a past session with attendance closed and three sessions ahead', async () => {
    signInAs('u-anh')
    const sheet = await attendanceRepository.sheet(sessionActivity('s-song-1'), {})
    expect(sheet.closedAt).not.toBeNull()
    expect(sheet.counts).toMatchObject({ expected: 6, present: 3, late: 1, excused: 1, absent: 1, unmarked: 0 })
  })
})
