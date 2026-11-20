import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { vnDayAt } from '@/api/mocks/mockTime'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { signInAs } from '@/testUtils'
import { sessionRepository } from '../model/sessionRepository'
import type { CreateSessionRequest } from '../model/sessionTypes'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const request = (fields: Partial<CreateSessionRequest> = {}): CreateSessionRequest => ({
  scopeType: 'DEPARTMENT',
  departmentId: 'd-media',
  title: 'Họp ban Truyền thông tuần này',
  description: '',
  startAt: vnDayAt(4, 18),
  endAt: vnDayAt(4, 20),
  location: 'Phòng truyền thông A2',
  capacity: null,
  registrationDeadline: null,
  ...fields,
})
const sessionTitlesOf = async (userId: string) => {
  signInAs(userId)
  return (await notificationRepository.list({ category: 'SESSION', size: 50 })).content.map((item) => item.title)
}

describe('creating a session (FR-ATT-01)', () => {
  it('offers the board the whole club and every active department, a department head only their own', async () => {
    signInAs('u-anh')
    const board = await sessionRepository.scopes('c-guitar')
    expect(board[0]).toEqual({ type: 'CLUB', departmentId: null, name: 'Toàn CLB' })
    expect(board.map((scope) => scope.departmentId)).not.toContain('d-photo')
    signInAs('u-linh')
    expect(await sessionRepository.scopes('c-guitar')).toEqual([{ type: 'DEPARTMENT', departmentId: 'd-media', name: 'Ban Truyền thông' }])
    signInAs('u-ha')
    expect(await sessionRepository.scopes('c-guitar')).toEqual([])
  })

  it('lets a department head create a session for their department and tells its working members only', async () => {
    signInAs('u-linh')
    const created = await sessionRepository.create('c-guitar', request())
    expect(created).toMatchObject({ scope: { type: 'DEPARTMENT', departmentId: 'd-media', departmentName: 'Truyền thông' }, allowedActions: ['VIEW_ATTENDANCE', 'EDIT', 'CANCEL'] })
    for (const userId of ['u-ha', 'u-vy']) expect(await sessionTitlesOf(userId)).toContain('Buổi sinh hoạt mới: Họp ban Truyền thông tuần này')
    // Tạm nghỉ (BR-MEM-05), người tạo và người ban khác không nhận.
    for (const userId of ['u-yen', 'u-linh', 'u-long']) expect(await sessionTitlesOf(userId)).toEqual([])
  })

  it('tells every working member of the club about a club-wide session', async () => {
    signInAs('u-anh')
    await sessionRepository.create('c-guitar', request({ scopeType: 'CLUB', departmentId: null, title: 'Sinh hoạt toàn CLB' }))
    for (const userId of ['u-ha', 'u-long', 'u-thao']) expect(await sessionTitlesOf(userId)).toContain('Buổi sinh hoạt mới: Sinh hoạt toàn CLB')
    expect(await sessionTitlesOf('u-yen')).toEqual([])
  })

  it('refuses scopes the caller does not lead, with the reason', async () => {
    signInAs('u-linh')
    const other = await fail(sessionRepository.create('c-guitar', request({ departmentId: 'd-logistics' })))
    expect(other).toMatchObject({ status: 403, detail: 'Bạn chỉ tạo được buổi sinh hoạt cho ban đang hoạt động mà mình là Trưởng ban hoặc Phó ban.' })
    const club = await fail(sessionRepository.create('c-guitar', request({ scopeType: 'CLUB', departmentId: null })))
    expect(club).toMatchObject({ status: 403, detail: 'Chỉ ban chủ nhiệm tạo được buổi sinh hoạt toàn CLB.' })
    signInAs('u-ha')
    expect((await fail(sessionRepository.create('c-guitar', request())))?.status).toBe(403)
    expect(db.sessions.filter((session) => session.title === 'Họp ban Truyền thông tuần này')).toEqual([])
  })

  it('checks the fields again on the server', async () => {
    signInAs('u-linh')
    const error = await fail(sessionRepository.create('c-guitar', request({ location: ' ', endAt: vnDayAt(4, 17), capacity: 0, registrationDeadline: vnDayAt(4, 19) })))
    expect(error?.status).toBe(400)
    expect(error?.fieldErrors.map((fieldError) => fieldError.field).sort()).toEqual(['capacity', 'endAt', 'location', 'registrationDeadline'])
  })
})

describe('reading sessions', () => {
  it('lists upcoming sessions soonest first and past sessions newest first', async () => {
    signInAs('u-ha')
    const upcoming = await sessionRepository.list('c-guitar', { when: 'UPCOMING' })
    expect(upcoming.content.map((session) => session.id)).toEqual(['s-weekly-now', 's-song-2', 's-media-plan', 's-music-rehearsal', 's-song-3', 's-song-4'])
    const past = await sessionRepository.list('c-guitar', { when: 'PAST' })
    expect(past.content.map((session) => session.id)).toEqual(['s-fingerstyle', 's-song-1', 's-media-photo'])
  })

  it('filters by scope and keyword', async () => {
    signInAs('u-ha')
    const club = await sessionRepository.list('c-guitar', { when: 'UPCOMING', scopeType: 'CLUB' })
    expect(club.content.map((session) => session.id)).toEqual(['s-weekly-now'])
    const media = await sessionRepository.list('c-guitar', { when: 'UPCOMING', scopeType: 'DEPARTMENT', departmentId: 'd-media' })
    expect(media.content.map((session) => session.id)).toEqual(['s-media-plan'])
    const keyword = await sessionRepository.list('c-guitar', { when: 'UPCOMING', q: 'tap duot' })
    expect(keyword.content.map((session) => session.id)).toEqual(['s-music-rehearsal'])
  })

  it('shows the attendance tab only to the people running the session, and editing only before it starts (FR-ATT-02)', async () => {
    signInAs('u-ha')
    expect((await sessionRepository.get('c-guitar', 's-media-plan')).allowedActions).toEqual([])
    signInAs('u-linh')
    expect((await sessionRepository.get('c-guitar', 's-media-plan')).allowedActions).toEqual(['VIEW_ATTENDANCE', 'EDIT', 'CANCEL'])
    expect((await sessionRepository.get('c-guitar', 's-media-photo')).allowedActions).toEqual(['VIEW_ATTENDANCE'])
    signInAs('u-mai')
    expect((await sessionRepository.get('c-guitar', 's-media-plan')).allowedActions).toEqual(['VIEW_ATTENDANCE', 'EDIT', 'CANCEL'])
  })

  it('keeps sessions inside their club (NFR-SEC-02)', async () => {
    signInAs('u-tam')
    expect((await fail(sessionRepository.list('c-guitar', { when: 'UPCOMING' })))?.status).toBe(403)
    expect((await fail(sessionRepository.get('c-guitar', 's-weekly-now')))?.status).toBe(403)
    signInAs('u-tu')
    expect((await fail(sessionRepository.get('c-english', 's-weekly-now')))?.status).toBe(404)
  })
})
