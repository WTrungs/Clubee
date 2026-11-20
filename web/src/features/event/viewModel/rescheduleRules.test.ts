import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { eventActivity } from '@/api/mocks/mockAttendance'
import { expireReconfirmations } from '@/api/mocks/mockRegistrations'
import { registerJob } from '@/api/mocks/mockSchedule'
import { toVnIso } from '@/api/mocks/mockTime'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { signInAs } from '@/testUtils'
import { eventRepository } from '../model/eventRepository'
import type { RescheduleEventRequest } from '../model/eventTypes'

const HOUR_MS = 60 * 60 * 1000
const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const eventOf = (id: string) => {
  const event = db.events.find((candidate) => candidate.id === id)
  if (!event) throw new Error(`Thiếu ${id}`)
  return event
}
const winter = () => eventOf('e-winter')
const guitar = () => {
  const club = db.clubs.find((candidate) => candidate.id === 'c-guitar')
  if (!club) throw new Error('Thiếu c-guitar')
  return club
}
const fromNow = (hours: number) => toVnIso(Date.now() + hours * HOUR_MS)
const reschedule = (userId: string, changes: Partial<RescheduleEventRequest> = {}, eventId = 'e-winter') => {
  signInAs(userId)
  return eventRepository.reschedule('c-guitar', eventId, { startAt: fromNow(14 * 24), endAt: fromNow(14 * 24 + 3), reason: 'Hội trường bận sửa chữa.', version: eventOf(eventId).version, ...changes })
}
const mineOf = async (userId: string) => {
  signInAs(userId)
  return (await eventRepository.get('c-guitar', 'e-winter')).myRegistration
}
const register = (userId: string) => {
  signInAs(userId)
  return eventRepository.register('c-guitar', 'e-winter')
}
const eventNotices = async (userId: string, title: string) => {
  signInAs(userId)
  return (await notificationRepository.list({ category: 'EVENT', size: 100 })).content.filter((notification) => notification.title === title)
}
const bodyOf = async (userId: string, title: string) => {
  const [first] = await eventNotices(userId, title)
  return first ? (await notificationRepository.get(first.id)).body : null
}
const movedTitle = 'Sự kiện dời thời gian: Đêm nhạc Mùa đông'

afterEach(() => vi.useRealTimers())

describe('rescheduling an event (FR-EVT-14)', () => {
  it('is for the event lead and the board, checked before the version (BR-ACL-01)', async () => {
    expect(await fail(reschedule('u-ha', { version: 999 }))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    db.permissionOverrides.push({ clubId: 'c-guitar', role: 'EVENT_LEAD', permission: 'RUN_EVENT', enabled: false, updatedBy: 'u-anh', updatedAt: '2026-11-16T10:00:00+07:00' })
    expect(await fail(reschedule('u-bao'))).toMatchObject({ status: 403, detail: expect.stringContaining('dời thời gian sự kiện') })
    expect(winter().scheduleChanges).toEqual([])
    expect((await reschedule('u-anh')).lastScheduleChange?.actor.fullName).toBe('Nguyễn Minh Anh')
  })

  it('refuses a stale version, other statuses and an event that already started', async () => {
    const before = winter().startAt
    expect(await fail(reschedule('u-bao', { version: winter().version - 1 }))).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' })
    expect(winter().startAt).toBe(before)
    expect(await fail(reschedule('u-anh', {}, 'e-busking'))).toMatchObject({ status: 422, code: 'INVALID_TRANSITION' })
    winter().startAt = fromNow(-1)
    expect(await fail(reschedule('u-bao'))).toMatchObject({ status: 422, code: 'EVENT_STARTED' })
    signInAs('u-bao')
    expect((await eventRepository.get('c-guitar', 'e-winter')).allowedActions).not.toContain('RESCHEDULE')
  })

  it('checks every value and names the field', async () => {
    const fields = async (changes: Partial<Omit<RescheduleEventRequest, 'version'>>) => (await fail(reschedule('u-bao', changes)))?.fieldErrors.map((error) => error.field)
    expect(await fields({ startAt: fromNow(-2), endAt: fromNow(1), registrationDeadline: null })).toEqual(['startAt'])
    expect(await fields({ endAt: fromNow(24) })).toEqual(['endAt'])
    expect(await fields({ startAt: winter().startAt, endAt: winter().endAt })).toEqual(['startAt'])
    expect(await fields({ registrationDeadline: fromNow(15 * 24) })).toEqual(['registrationDeadline'])
    expect(await fields({ reason: 'gấp' })).toEqual(['reason'])
    // Không gửi hạn đăng ký thì giữ hạn cũ, nên dời sớm hơn hạn cũ vẫn bị chặn.
    expect(await fields({ startAt: fromNow(2 * 24), endAt: fromNow(2 * 24 + 3), registrationDeadline: undefined })).toEqual(['registrationDeadline'])
    expect(winter().scheduleChanges).toEqual([])
  })

  it('only moves the time of an approved event that has no registrations yet', async () => {
    const workshop = eventOf('e-workshop')
    const deadline = workshop.registrationDeadline
    const moved = await reschedule('u-anh', { startAt: fromNow(30 * 24), endAt: fromNow(30 * 24 + 2) }, 'e-workshop')
    expect(moved).toMatchObject({ status: 'APPROVED', registrationDeadline: deadline, version: 2 })
    expect(moved.lastScheduleChange).toMatchObject({ fromStartAt: expect.any(String), toStartAt: moved.startAt, reason: 'Hội trường bận sửa chữa.' })
  })

  it('asks every seat holder to confirm again, keeps the waitlist, and tells everyone (ST-REG, FR-NOT-02)', async () => {
    await register('u-ha')
    await register('u-son')
    const moved = await reschedule('u-anh', { registrationDeadline: fromNow(13 * 24) })
    expect(moved).toMatchObject({ confirmedCount: 12, waitlistCount: 1, registrationDeadline: expect.any(String) })

    const mai = await mineOf('u-mai')
    expect(mai).toMatchObject({ status: 'RECONFIRM_PENDING', allowedActions: ['RECONFIRM', 'CANCEL'] })
    expect(Date.parse(mai?.reconfirmDeadline ?? '') - Date.now()).toBeGreaterThan(47 * HOUR_MS)
    expect(Date.parse(mai?.reconfirmDeadline ?? '') - Date.now()).toBeLessThanOrEqual(48 * HOUR_MS)
    expect(mai?.cancelDeadline).toBe(mai?.reconfirmDeadline)
    expect(await mineOf('u-son')).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1, reconfirmDeadline: null })

    expect(await bodyOf('u-mai', movedTitle)).toMatch(/^Từ .+ sang .+\. Hãy xác nhận tham dự trước \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}, quá hạn thì đăng ký bị hủy\. Lý do: Hội trường bận sửa chữa\.$/)
    expect(await bodyOf('u-son', movedTitle)).toMatch(/Bạn vẫn giữ thứ tự trong danh sách chờ\. Lý do: /)
    // Vừa là BTC vừa đăng ký thì chỉ nhận một tin.
    expect(await eventNotices('u-ha', movedTitle)).toHaveLength(1)
    expect(await bodyOf('u-bao', movedTitle)).toMatch(/11 người giữ chỗ cần xác nhận lại trước/)
    // Người dời đã chọn giờ mới nên giữ Nhận chỗ và không nhận tin của chính mình.
    expect(await mineOf('u-anh')).toMatchObject({ status: 'CONFIRMED', reconfirmDeadline: null })
    expect(await eventNotices('u-anh', movedTitle)).toHaveLength(0)
    // Người Chờ xác nhận lại vẫn giữ chỗ nên vẫn nằm trong danh sách dự kiến điểm danh.
    expect(eventActivity(winter()).expected(null)).toContain('u-mai')
  })

  it('caps the confirmation deadline at the new start and follows the club setting', async () => {
    const soon = await reschedule('u-bao', { startAt: fromNow(10), endAt: fromNow(13), registrationDeadline: null })
    expect((await mineOf('u-mai'))?.reconfirmDeadline).toBe(soon.startAt)
    guitar().rescheduleConfirmHours = 1
    await reschedule('u-bao')
    const deadline = Date.parse((await mineOf('u-mai'))?.reconfirmDeadline ?? '')
    expect(deadline - Date.now()).toBeLessThanOrEqual(HOUR_MS)
    expect(deadline - Date.now()).toBeGreaterThan(HOUR_MS - 60_000)
  })
})

describe('confirming again after a reschedule (FR-EVT-14)', () => {
  it('puts the registration back to confirmed for its owner only', async () => {
    await reschedule('u-bao')
    const mai = await mineOf('u-mai')
    signInAs('u-ha')
    expect(await fail(eventRepository.reconfirmRegistration('c-guitar', 'e-winter', mai?.id ?? ''))).toMatchObject({ status: 404, code: 'REGISTRATION_NOT_FOUND' })
    signInAs('u-mai')
    expect(await eventRepository.reconfirmRegistration('c-guitar', 'e-winter', mai?.id ?? '')).toMatchObject({ status: 'CONFIRMED', reconfirmDeadline: null, allowedActions: ['CANCEL'] })
    expect(await fail(eventRepository.reconfirmRegistration('c-guitar', 'e-winter', mai?.id ?? ''))).toMatchObject({ status: 422, code: 'NOT_RECONFIRM_PENDING' })
  })

  it('lets someone decline the new time until the confirmation deadline, even inside the usual cancel window', async () => {
    await register('u-ha')
    await register('u-son')
    await reschedule('u-bao', { startAt: fromNow(20), endAt: fromNow(23), registrationDeadline: null })
    const mai = await mineOf('u-mai')
    expect(mai?.allowedActions).toEqual(['RECONFIRM', 'CANCEL'])
    signInAs('u-mai')
    expect((await eventRepository.cancelRegistration('c-guitar', 'e-winter', mai?.id ?? '')).status).toBe('CANCELLED')
    expect((await mineOf('u-son'))?.status).toBe('CONFIRMED')
  })

  it('cancels whoever did not confirm in time, tells them once, and fills the seats from the waitlist', async () => {
    await register('u-ha')
    await register('u-son')
    await reschedule('u-bao')
    const mai = await mineOf('u-mai')
    const huy = await mineOf('u-huy')
    signInAs('u-huy')
    await eventRepository.reconfirmRegistration('c-guitar', 'e-winter', huy?.id ?? '')

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 49 * HOUR_MS)
    expect(await mineOf('u-mai')).toBeNull()
    expect(db.registrations.find((registration) => registration.id === mai?.id)).toMatchObject({ status: 'CANCELLED', cancelKind: 'EXPIRED' })
    expect(await mineOf('u-huy')).toMatchObject({ status: 'CONFIRMED' })
    expect(await mineOf('u-son')).toMatchObject({ status: 'CONFIRMED', promotedAt: expect.any(String) })
    await mineOf('u-mai')
    expect(await eventNotices('u-mai', 'Đăng ký đã bị hủy: Đêm nhạc Mùa đông')).toHaveLength(1)
    expect(await eventNotices('u-son', 'Bạn đã được nhận chỗ: Đêm nhạc Mùa đông')).toHaveLength(1)

    signInAs('u-mai')
    const late = await fail(eventRepository.reconfirmRegistration('c-guitar', 'e-winter', mai?.id ?? ''))
    expect(late).toMatchObject({ status: 422, code: 'RECONFIRM_DEADLINE_PASSED', detail: expect.stringMatching(/^Đã quá hạn xác nhận \(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\)/) })
  })

  it('refuses a late confirmation even before the expiry job has run', async () => {
    await reschedule('u-bao')
    const mai = await mineOf('u-mai')
    const stored = db.registrations.find((registration) => registration.id === mai?.id)
    if (!stored) throw new Error('Thiếu đăng ký của u-mai')
    stored.reconfirmDeadline = fromNow(-1)
    registerJob('registrationReconfirmExpiry', () => {})
    try {
      signInAs('u-mai')
      expect(await fail(eventRepository.reconfirmRegistration('c-guitar', 'e-winter', stored.id))).toMatchObject({ status: 422, code: 'RECONFIRM_DEADLINE_PASSED' })
      expect(stored.status).toBe('RECONFIRM_PENDING')
    } finally {
      registerJob('registrationReconfirmExpiry', expireReconfirmations)
    }
  })

  it('leaves the registrations of a cancelled event as they were', async () => {
    await reschedule('u-bao')
    winter().status = 'CANCELLED'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 49 * HOUR_MS)
    expect((await mineOf('u-mai'))?.status).toBe('RECONFIRM_PENDING')
    expect(await eventNotices('u-mai', 'Đăng ký đã bị hủy: Đêm nhạc Mùa đông')).toHaveLength(0)
  })
})
