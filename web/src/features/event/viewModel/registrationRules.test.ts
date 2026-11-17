import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { toVnIso } from '@/api/mocks/mockTime'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { signInAs } from '@/testUtils'
import { eventRepository } from '../model/eventRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const winter = () => {
  const event = db.events.find((candidate) => candidate.id === 'e-winter')
  if (!event) throw new Error('Thiếu e-winter')
  return event
}
const guitar = () => {
  const club = db.clubs.find((candidate) => candidate.id === 'c-guitar')
  if (!club) throw new Error('Thiếu c-guitar')
  return club
}
const register = (userId: string) => {
  signInAs(userId)
  return eventRepository.register('c-guitar', 'e-winter')
}
const mineOf = async (userId: string) => {
  signInAs(userId)
  return (await eventRepository.get('c-guitar', 'e-winter')).myRegistration
}
const cancelOwn = async (userId: string) => {
  const mine = await mineOf(userId)
  if (!mine) throw new Error(`${userId} chưa đăng ký`)
  return eventRepository.cancelRegistration('c-guitar', 'e-winter', mine.id)
}
const fromNowHours = (hours: number) => toVnIso(Date.now() + hours * 60 * 60 * 1000)

afterEach(() => vi.useRealTimers())

describe('cancelling a registration (FR-EVT-13, ST-REG)', () => {
  it('frees the seat for the first person on the waitlist and tells them (BR-EVT-03, FR-NOT-02)', async () => {
    expect((await register('u-ha')).status).toBe('CONFIRMED')
    expect(await register('u-bao')).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 })
    expect(await register('u-son')).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 2 })

    const cancelled = await cancelOwn('u-mai')
    expect(cancelled).toMatchObject({ status: 'CANCELLED', allowedActions: [] })
    expect(await mineOf('u-bao')).toMatchObject({ status: 'CONFIRMED', waitlistPosition: null, promotedAt: expect.any(String) })
    expect(await mineOf('u-son')).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 })
    const detail = await eventRepository.get('c-guitar', 'e-winter')
    expect(detail).toMatchObject({ confirmedCount: 12, waitlistCount: 1 })

    signInAs('u-bao')
    expect((await notificationRepository.list({ category: 'EVENT' })).content[0]?.title).toBe('Bạn đã được nhận chỗ: Đêm nhạc Mùa đông')
    signInAs('u-linh')
    expect((await eventRepository.registrations('c-guitar', 'e-winter', { size: 50 })).content.find((row) => row.attendee.id === 'u-bao')?.promotedAt).toEqual(expect.any(String))
  })

  it('lets only the person who registered cancel', async () => {
    const mai = await mineOf('u-mai')
    signInAs('u-ha')
    expect(await fail(eventRepository.cancelRegistration('c-guitar', 'e-winter', mai?.id ?? ''))).toMatchObject({ status: 404, code: 'REGISTRATION_NOT_FOUND' })
    expect((await mineOf('u-mai'))?.status).toBe('CONFIRMED')
  })

  it('stops seat holders after the cancel deadline, but lets the waitlist leave until the start', async () => {
    await register('u-ha')
    await register('u-bao')
    winter().startAt = fromNowHours(10)
    const mai = await mineOf('u-mai')
    expect(mai?.allowedActions).toEqual([])
    const late = await fail(cancelOwn('u-mai'))
    expect(late).toMatchObject({ status: 422, code: 'CANCEL_DEADLINE_PASSED', detail: expect.stringMatching(/^Đã qua hạn hủy đăng ký \(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\)/) })
    expect((await cancelOwn('u-bao')).status).toBe('CANCELLED')

    // Hạn hủy mới có hiệu lực ngay cho lần hủy sau.
    guitar().registrationCancelHours = 0
    expect((await mineOf('u-mai'))?.allowedActions).toEqual(['CANCEL'])
    expect((await cancelOwn('u-mai')).status).toBe('CANCELLED')
  })

  it('lets someone register again after cancelling, with one active registration at a time (BR-EVT-04)', async () => {
    const first = await cancelOwn('u-mai')
    const again = await register('u-mai')
    expect(again.id).not.toBe(first.id)
    expect(again.status).toBe('CONFIRMED')
    expect(db.registrations.filter((registration) => registration.userId === 'u-mai' && registration.eventId === 'e-winter' && registration.status !== 'CANCELLED')).toHaveLength(1)
    expect(await fail(register('u-mai'))).toMatchObject({ status: 409, code: 'ALREADY_REGISTERED' })
  })

  it('refuses to cancel twice or once the event is cancelled', async () => {
    const mai = await mineOf('u-mai')
    await cancelOwn('u-mai')
    signInAs('u-mai')
    expect(await fail(eventRepository.cancelRegistration('c-guitar', 'e-winter', mai?.id ?? ''))).toMatchObject({ status: 422, code: 'REGISTRATION_CANCELLED' })
    winter().status = 'CANCELLED'
    const huy = db.registrations.find((registration) => registration.userId === 'u-huy' && registration.eventId === 'e-winter')
    signInAs('u-huy')
    expect(await fail(eventRepository.cancelRegistration('c-guitar', 'e-winter', huy?.id ?? ''))).toMatchObject({ status: 422, code: 'REGISTRATION_LOCKED' })
  })

  it('fills every freed seat from the waitlist but never goes over capacity', async () => {
    await register('u-ha')
    await register('u-bao')
    await register('u-son')
    await register('u-hieu')
    await cancelOwn('u-mai')
    await cancelOwn('u-huy')
    const seated = db.registrations.filter((registration) => registration.eventId === 'e-winter' && registration.status === 'CONFIRMED')
    expect(seated).toHaveLength(winter().capacity ?? 0)
    expect([(await mineOf('u-bao'))?.status, (await mineOf('u-son'))?.status, (await mineOf('u-hieu'))?.status]).toEqual(['CONFIRMED', 'CONFIRMED', 'WAITLISTED'])
  })

  it('keeps arrival order on the waitlist when two people register in the same second (BR-EVT-03)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-17T10:00:00.100+07:00'))
    await register('u-ha')
    await register('u-son')
    vi.setSystemTime(new Date('2026-11-17T10:00:00.900+07:00'))
    await register('u-bao')
    expect(await mineOf('u-son')).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 })
    expect(await mineOf('u-bao')).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 2 })
    await cancelOwn('u-mai')
    expect((await mineOf('u-son'))?.status).toBe('CONFIRMED')
    expect(await mineOf('u-bao')).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 })
  })
})
