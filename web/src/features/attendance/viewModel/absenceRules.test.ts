import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { toVnIso } from '@/api/mocks/mockTime'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { signInAs } from '@/testUtils'
import { attendanceRepository } from '../model/attendanceRepository'
import { sessionRepository } from '../model/sessionRepository'

const REHEARSAL = 's-music-rehearsal'
const TITLE = 'Tập dượt tiết mục Đêm nhạc Mùa đông'
const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const titlesOf = async (userId: string) => {
  signInAs(userId)
  return (await notificationRepository.list({ category: 'SESSION', size: 50 })).content.map((item) => item.title)
}
const requestAs = async (userId: string, sessionId = REHEARSAL, reason = 'Trùng lịch thực tập ở công ty.') => {
  signInAs(userId)
  return sessionRepository.requestAbsence('c-guitar', sessionId, { reason })
}
const rowOf = async (userId: string, sessionId = REHEARSAL) => {
  signInAs('u-anh')
  const rows = await sessionRepository.absenceRequests('c-guitar', sessionId)
  const row = rows.find((candidate) => candidate.requester.id === userId && candidate.status !== 'WITHDRAWN')
  if (!row) throw new Error(`Thiếu đơn của ${userId}`)
  return row
}

describe('asking for leave (FR-ATT-04, BR-ATT-03)', () => {
  it('sends a pending request, tells the session creator and stops offering a second request', async () => {
    signInAs('u-bao')
    expect((await sessionRepository.get('c-guitar', REHEARSAL)).allowedActions).toContain('REQUEST_ABSENCE')
    const detail = await requestAs('u-bao')
    expect(detail.myAbsenceRequest).toMatchObject({ status: 'PENDING', reason: 'Trùng lịch thực tập ở công ty.', decision: null, allowedActions: ['WITHDRAW'] })
    expect(detail.allowedActions).not.toContain('REQUEST_ABSENCE')
    expect(detail.pendingAbsenceCount).toBeNull()
    expect(await titlesOf('u-anh')).toContain(`Đơn xin phép vắng: ${TITLE}`)
    signInAs('u-anh')
    expect((await sessionRepository.get('c-guitar', REHEARSAL)).pendingAbsenceCount).toBe(2)
  })

  it('checks who may ask, then duplicates, then timing, then the reason', async () => {
    expect(await fail(requestAs('u-ha'))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    // Buổi có số chỗ: người đang chờ không thuộc đối tượng, chỉ cần hủy đăng ký.
    signInAs('u-ha')
    await sessionRepository.register('c-guitar', 's-media-plan')
    expect(await fail(requestAs('u-ha', 's-media-plan'))).toMatchObject({ status: 403, detail: expect.stringMatching(/người đang giữ chỗ/) })
    expect(await fail(requestAs('u-nam'))).toMatchObject({ status: 409, code: 'ALREADY_REQUESTED' })
    expect(await fail(requestAs('u-bao', 's-weekly-now'))).toMatchObject({ status: 422, code: 'SESSION_STARTED' })
    expect(await fail(requestAs('u-bao', REHEARSAL, 'ốm'))).toMatchObject({ status: 400, fieldErrors: [{ field: 'reason' }] })
  })

  it('lets only the sender withdraw, with the version they saw, and ask again afterwards', async () => {
    const sent = await requestAs('u-bao')
    const mine = sent.myAbsenceRequest
    if (!mine) throw new Error('Thiếu đơn')
    signInAs('u-kiet')
    expect(await fail(sessionRepository.withdrawAbsence('c-guitar', REHEARSAL, mine.id, mine.version))).toMatchObject({ status: 404 })
    signInAs('u-bao')
    expect(await fail(sessionRepository.withdrawAbsence('c-guitar', REHEARSAL, mine.id, 99))).toMatchObject({ status: 409 })
    const withdrawn = await sessionRepository.withdrawAbsence('c-guitar', REHEARSAL, mine.id, mine.version)
    expect(withdrawn.myAbsenceRequest).toBeNull()
    expect(withdrawn.allowedActions).toContain('REQUEST_ABSENCE')
    expect(await fail(sessionRepository.withdrawAbsence('c-guitar', REHEARSAL, mine.id, mine.version + 1))).toMatchObject({ status: 422, code: 'ABSENCE_NOT_WITHDRAWABLE' })
  })
})

describe('deciding on a request (FR-ATT-04)', () => {
  it('lets only the people running the session decide, needs a reason to reject and tells the sender', async () => {
    await requestAs('u-bao')
    const row = await rowOf('u-bao')
    expect(row.allowedActions).toEqual(['DECIDE'])
    signInAs('u-kiet')
    expect(await fail(sessionRepository.decideAbsence('c-guitar', REHEARSAL, row.id, { decision: 'APPROVE', note: null, version: 99 }))).toMatchObject({ status: 403 })
    signInAs('u-anh')
    expect(await fail(sessionRepository.decideAbsence('c-guitar', REHEARSAL, row.id, { decision: 'REJECT', note: null, version: 99 }))).toMatchObject({ status: 409 })
    expect(await fail(sessionRepository.decideAbsence('c-guitar', REHEARSAL, row.id, { decision: 'REJECT', note: null, version: row.version }))).toMatchObject({
      status: 400,
      fieldErrors: [{ field: 'note' }],
    })
    const rejected = await sessionRepository.decideAbsence('c-guitar', REHEARSAL, row.id, { decision: 'REJECT', note: 'Buổi này chạy thử toàn bộ tiết mục.', version: row.version })
    expect(rejected).toMatchObject({ status: 'REJECTED', allowedActions: [], decision: { by: { id: 'u-anh' }, note: 'Buổi này chạy thử toàn bộ tiết mục.' } })
    expect(await fail(sessionRepository.decideAbsence('c-guitar', REHEARSAL, row.id, { decision: 'APPROVE', note: null, version: rejected.version }))).toMatchObject({
      status: 422,
      code: 'ABSENCE_ALREADY_DECIDED',
    })
    expect(await titlesOf('u-bao')).toContain(`Đơn xin phép bị từ chối: ${TITLE}`)
    signInAs('u-bao')
    const mine = await sessionRepository.get('c-guitar', REHEARSAL)
    expect(mine.myAbsenceRequest).toMatchObject({ status: 'REJECTED', decision: { note: 'Buổi này chạy thử toàn bộ tiết mục.' } })
    // Đơn bị từ chối không còn hiệu lực nên gửi lại được.
    expect(mine.allowedActions).toContain('REQUEST_ABSENCE')
  })

  it('stops decisions once attendance is closed; changes go through the attendance sheet', async () => {
    signInAs('u-anh')
    const rows = await sessionRepository.absenceRequests('c-guitar', 's-song-1')
    expect(rows.map((row) => [row.requester.id, row.status, row.allowedActions])).toEqual([['u-kiet', 'APPROVED', []]])
    db.absenceRequests.push({ ...db.absenceRequests[0]!, id: 'ab-late', userId: 'u-thao', status: 'PENDING', decidedBy: null, decidedAt: null, version: 1 })
    expect(await fail(sessionRepository.decideAbsence('c-guitar', 's-song-1', 'ab-late', { decision: 'APPROVE', note: null, version: 1 }))).toMatchObject({
      status: 422,
      code: 'ATTENDANCE_CLOSED',
    })
  })
})

describe('closing attendance with leave requests (FR-ATT-04, FR-ATT-08)', () => {
  it('marks an approved request as excused and a rejected one as absent, and flags requests on the sheet', async () => {
    await requestAs('u-bao')
    const nam = await rowOf('u-nam')
    const bao = await rowOf('u-bao')
    await sessionRepository.decideAbsence('c-guitar', REHEARSAL, nam.id, { decision: 'APPROVE', note: null, version: nam.version })
    await sessionRepository.decideAbsence('c-guitar', REHEARSAL, bao.id, { decision: 'REJECT', note: 'Buổi này chạy thử toàn bộ tiết mục.', version: bao.version })

    // Đưa buổi về đang diễn ra để mở khung điểm danh.
    const session = db.sessions.find((candidate) => candidate.id === REHEARSAL)
    if (!session) throw new Error('Thiếu buổi')
    session.startAt = toVnIso(Date.now() - 10 * 60 * 1000)
    session.endAt = toVnIso(Date.now() + 60 * 60 * 1000)
    const activity = { type: 'SESSION' as const, clubId: 'c-guitar', id: REHEARSAL }
    const before = await attendanceRepository.sheet(activity, {})
    expect(before.rows.content.find((row) => row.person.id === 'u-nam')?.absenceRequest).toEqual({ status: 'APPROVED', reason: 'Về quê dự đám cưới anh trai.' })
    expect(before.rows.content.find((row) => row.person.id === 'u-bao')?.absenceRequest).toBeNull()
    expect(before.counts.unmarkedExcused).toBe(1)

    const closed = await attendanceRepository.close(activity, { action: 'CLOSE', day: null, version: before.version })
    const statusOf = (userId: string) => closed.rows.content.find((row) => row.person.id === userId)?.record?.status
    expect(statusOf('u-nam')).toBe('EXCUSED')
    expect(statusOf('u-bao')).toBe('ABSENT')
    expect(closed.counts.excused).toBe(1)
  })
})
