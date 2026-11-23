import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { toVnIso, vnDayAt } from '@/api/mocks/mockTime'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { signInAs } from '@/testUtils'
import { attendanceRepository } from '../model/attendanceRepository'
import { sessionRepository } from '../model/sessionRepository'
import type { CreateSessionRequest, SessionDetail, UpdateSessionRequest } from '../model/sessionTypes'

const HOUR_MS = 60 * 60 * 1000
const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const clubSession = async (fields: Partial<CreateSessionRequest> = {}) => {
  signInAs('u-anh')
  return sessionRepository.create('c-guitar', {
    scopeType: 'CLUB',
    departmentId: null,
    title: 'Workshop thu âm, ít chỗ',
    description: '',
    startAt: vnDayAt(5, 18),
    endAt: vnDayAt(5, 20),
    location: 'Phòng thu C2',
    capacity: 1,
    registrationDeadline: null,
    ...fields,
  })
}
const registerAs = async (userId: string, sessionId: string) => {
  signInAs(userId)
  return sessionRepository.register('c-guitar', sessionId)
}
const updateOf = (session: SessionDetail, fields: Partial<UpdateSessionRequest>): UpdateSessionRequest => ({
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
const titlesOf = async (userId: string) => {
  signInAs(userId)
  return (await notificationRepository.list({ category: 'SESSION', size: 50 })).content.map((item) => item.title)
}

describe('registering for a limited session (FR-ATT-03)', () => {
  it('gives the last seat to whoever the server handles first and queues the next person, never going over (BR-EVT-03)', async () => {
    const session = await clubSession()
    const ha = await registerAs('u-ha', session.id)
    const long = await registerAs('u-long', session.id)
    expect(ha.myRegistration?.status).toBe('CONFIRMED')
    expect(long.myRegistration).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 })
    expect(long.seats).toEqual({ capacity: 1, taken: 1, waitlist: 1 })
    expect(long.allowedActions).not.toContain('REGISTER')
  })

  it('promotes the waitlist in order when a seat frees up, and tells the person promoted', async () => {
    const session = await clubSession()
    const ha = await registerAs('u-ha', session.id)
    await registerAs('u-long', session.id)
    const bao = await registerAs('u-bao', session.id)
    expect(bao.myRegistration).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 2 })

    signInAs('u-ha')
    const left = await sessionRepository.cancelRegistration('c-guitar', session.id, ha.myRegistration?.id ?? '')
    expect(left.myRegistration).toBeNull()
    expect(left.allowedActions).toContain('REGISTER')
    signInAs('u-long')
    expect((await sessionRepository.get('c-guitar', session.id)).myRegistration).toMatchObject({ status: 'CONFIRMED', waitlistPosition: null })
    expect((await sessionRepository.get('c-guitar', session.id)).myRegistration?.promotedAt).not.toBeNull()
    expect(await titlesOf('u-long')).toContain('Bạn đã được nhận chỗ: Workshop thu âm, ít chỗ')
    signInAs('u-bao')
    expect((await sessionRepository.get('c-guitar', session.id)).myRegistration?.waitlistPosition).toBe(1)

    signInAs('u-anh')
    const rows = (await sessionRepository.registrations('c-guitar', session.id, {})).content
    expect(rows.map((row) => [row.attendee.id, row.status, row.waitlistPosition])).toEqual([
      ['u-long', 'CONFIRMED', null],
      ['u-bao', 'WAITLISTED', 1],
    ])
  })

  it('lets a seat holder cancel only until the club cut-off before the start, and a waiting person until the start', async () => {
    const soon = await clubSession({ startAt: toVnIso(Date.now() + 10 * HOUR_MS), endAt: toVnIso(Date.now() + 12 * HOUR_MS) })
    const holder = await registerAs('u-ha', soon.id)
    expect(holder.myRegistration?.allowedActions).toEqual([])
    expect(Date.parse(holder.myRegistration?.cancelDeadline ?? '')).toBe(Date.parse(soon.startAt) - 24 * HOUR_MS)
    expect(await fail(sessionRepository.cancelRegistration('c-guitar', soon.id, holder.myRegistration?.id ?? ''))).toMatchObject({ status: 422, code: 'CANCEL_DEADLINE_PASSED' })

    const waiting = await registerAs('u-long', soon.id)
    expect(waiting.myRegistration).toMatchObject({ status: 'WAITLISTED', allowedActions: ['CANCEL'], cancelDeadline: soon.startAt })
    const after = await sessionRepository.cancelRegistration('c-guitar', soon.id, waiting.myRegistration?.id ?? '')
    expect(after.seats).toEqual({ capacity: 1, taken: 1, waitlist: 0 })
  })

  it('checks who may register, then duplicates, then the state of the session', async () => {
    signInAs('u-anh')
    const music = await sessionRepository.create('c-guitar', {
      scopeType: 'DEPARTMENT',
      departmentId: 'd-music',
      title: 'Lớp phối khí, ít chỗ',
      description: '',
      startAt: vnDayAt(5, 18),
      endAt: vnDayAt(5, 20),
      location: 'Phòng C1',
      capacity: 5,
      registrationDeadline: null,
    })
    expect(await fail(registerAs('u-ha', music.id))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    expect(await fail(registerAs('u-yen', music.id))).toMatchObject({ status: 403 })
    await registerAs('u-bao', music.id)
    expect(await fail(registerAs('u-bao', music.id))).toMatchObject({ status: 409, code: 'ALREADY_REGISTERED' })
    expect(await fail(registerAs('u-bao', 's-music-rehearsal'))).toMatchObject({ status: 422, code: 'REGISTRATION_NOT_REQUIRED' })

    const late = await clubSession({ registrationDeadline: toVnIso(Date.now() - HOUR_MS) })
    expect(late.allowedActions).not.toContain('REGISTER')
    expect(await fail(registerAs('u-ha', late.id))).toMatchObject({ status: 422, code: 'REGISTRATION_CLOSED' })
    signInAs('u-ha')
    expect(await fail(sessionRepository.registrations('c-guitar', late.id, {}))).toMatchObject({ status: 403 })
  })
})

describe('changing seats after people registered (FR-ATT-03)', () => {
  it('refuses fewer seats than taken or no limit, and promotes the waitlist when seats grow', async () => {
    const session = await clubSession()
    await registerAs('u-ha', session.id)
    await registerAs('u-long', session.id)
    signInAs('u-anh')
    const current = await sessionRepository.get('c-guitar', session.id)
    expect(await fail(sessionRepository.update('c-guitar', session.id, updateOf(current, { capacity: null })))).toMatchObject({ status: 422, code: 'CAPACITY_REQUIRED' })
    const grown = await sessionRepository.update('c-guitar', session.id, updateOf(current, { capacity: 2 }))
    expect(grown.seats).toEqual({ capacity: 2, taken: 2, waitlist: 0 })
    expect(await titlesOf('u-long')).toContain('Bạn đã được nhận chỗ: Workshop thu âm, ít chỗ')
    signInAs('u-anh')
    expect(await fail(sessionRepository.update('c-guitar', session.id, updateOf(grown, { capacity: 1 })))).toMatchObject({ status: 422, code: 'CAPACITY_BELOW_TAKEN' })
  })
})

describe('attendance audience of a limited session', () => {
  it('expects the seat holders only, not the whole scope or the waitlist', async () => {
    const plan = { type: 'SESSION' as const, clubId: 'c-guitar', id: 's-media-plan' }
    await registerAs('u-ha', 's-media-plan')
    signInAs('u-linh')
    const sheet = await attendanceRepository.sheet(plan, {})
    expect(sheet.counts.expected).toBe(2)
    expect(sheet.rows.content.map((row) => row.person.id).toSorted()).toEqual(['u-linh', 'u-vy'])
  })

  it('keeps the seeded past session with the same audience as before seats were tracked', async () => {
    signInAs('u-anh')
    const sheet = await attendanceRepository.sheet({ type: 'SESSION', clubId: 'c-guitar', id: 's-fingerstyle' }, {})
    const seated = db.sessionRegistrations.filter((registration) => registration.sessionId === 's-fingerstyle' && registration.status === 'CONFIRMED')
    expect(sheet.counts.expected).toBe(seated.length)
    expect(sheet.counts.expected).toBeGreaterThan(10)
    expect(sheet.rows.content.map((row) => row.person.id)).not.toContain('u-yen')
  })
})
