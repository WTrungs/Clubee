import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { toVnIso, vnDate } from '@/api/mocks/mockTime'
import { sessionRepository } from '@/features/attendance/model/sessionRepository'
import { signInAs } from '@/testUtils'
import { calendarRepository } from '../model/calendarRepository'
import type { CalendarItem } from '../model/calendarTypes'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const calendarOf = async (userId: string, clubId?: string) => {
  signInAs(userId)
  return calendarRepository.mine({ from: vnDate(-14), to: vnDate(30), clubId })
}
const relationsOf = (items: CalendarItem[], id: string) => items.find((item) => item.id === id)?.relations

describe('my calendar (FR-ATT-09)', () => {
  it('shows sessions in my scope, the ones I registered for or created, and events by how I relate to them', async () => {
    const linh = await calendarOf('u-linh')
    expect(relationsOf(linh.items, 's-media-plan')).toEqual(['REGISTERED', 'CREATOR'])
    expect(relationsOf(linh.items, 's-weekly-now')).toEqual(['AUDIENCE'])
    expect(relationsOf(linh.items, 'e-winter')).toEqual(['REGISTERED', 'STAFF'])
    // Buổi của ban khác không thuộc phạm vi.
    expect(relationsOf(linh.items, 's-music-rehearsal')).toBeUndefined()

    const ha = await calendarOf('u-ha')
    expect(relationsOf(ha.items, 's-media-plan')).toEqual(['AUDIENCE'])
    expect(relationsOf(ha.items, 'e-winter')).toEqual(['STAFF', 'OPEN'])
    expect(relationsOf(ha.items, 'e-livestream')).toEqual(['REGISTERED'])
    await sessionRepository.register('c-guitar', 's-media-plan')
    expect(relationsOf((await calendarOf('u-ha')).items, 's-media-plan')).toEqual(['WAITLISTED'])

    const bao = await calendarOf('u-bao')
    expect(relationsOf(bao.items, 'e-winter')).toEqual(['STAFF', 'OPEN'])
    // Sự kiện chưa duyệt không lên lịch.
    expect(bao.items.map((item) => item.id)).not.toContain('e-busking')
    expect(bao.items.map((item) => item.id)).not.toContain('e-camp')
    const starts = bao.items.map((item) => Date.parse(item.startAt))
    expect(starts).toEqual(starts.toSorted((a, b) => a - b))
  })

  it('marks an event waitlist, stops offering an event past its deadline and keeps a closed event for its organisers', async () => {
    const winter = db.events.find((event) => event.id === 'e-winter')
    if (!winter) throw new Error('Thiếu e-winter')
    const waiting = db.registrations.find((registration) => registration.eventId === 'e-winter' && registration.userId === 'u-mai')
    if (waiting) waiting.status = 'WAITLISTED'
    expect(relationsOf((await calendarOf('u-mai')).items, 'e-winter')).toEqual(['WAITLISTED'])
    winter.registrationDeadline = toVnIso(Date.now() - 60 * 60 * 1000)
    expect(relationsOf((await calendarOf('u-bao')).items, 'e-winter')).toEqual(['STAFF'])
    winter.status = 'CLOSED'
    expect(relationsOf((await calendarOf('u-bao')).items, 'e-winter')).toEqual(['STAFF'])
  })

  it('leaves out scope sessions and open events for someone on leave (BR-MEM-05)', async () => {
    const yen = await calendarOf('u-yen', 'c-guitar')
    expect(yen.items).toEqual([])
  })

  it('gathers every club, filters by one, and keeps other clubs private', async () => {
    const ha = await calendarOf('u-ha')
    expect(ha.clubs.map((club) => club.id).toSorted()).toEqual(['c-english', 'c-guitar'])
    expect(relationsOf(ha.items, 's-english-travel')).toEqual(['AUDIENCE'])
    const english = await calendarOf('u-ha', 'c-english')
    expect(new Set(english.items.map((item) => item.clubId))).toEqual(new Set(['c-english']))
    expect((await calendarOf('u-linh')).items.map((item) => item.id)).not.toContain('s-english-travel')
  })

  it('keeps cancelled sessions and events, flagged', async () => {
    signInAs('u-anh')
    const session = await sessionRepository.get('c-guitar', 's-song-2')
    await sessionRepository.cancel('c-guitar', 's-song-2', { reason: 'Trùng lịch diễn của CLB.', version: session.version })
    const bao = await calendarOf('u-bao')
    expect(bao.items.find((item) => item.id === 's-song-2')).toMatchObject({ cancelled: true, relations: ['AUDIENCE'] })
    const winter = db.events.find((event) => event.id === 'e-winter')
    if (winter) Object.assign(winter, { status: 'CANCELLED', statusBeforeCancel: 'REGISTRATION_OPEN' })
    // Người đã đăng ký vẫn thấy sự kiện đã hủy trên lịch.
    expect((await calendarOf('u-mai')).items.find((item) => item.id === 'e-winter')).toMatchObject({ cancelled: true, relations: ['REGISTERED'] })
  })

  it('rejects ranges that are invalid, reversed or longer than 62 days', async () => {
    signInAs('u-ha')
    expect(await fail(calendarRepository.mine({ from: '2026-02-30', to: vnDate(0) }))).toMatchObject({ status: 400, fieldErrors: [{ field: 'from' }] })
    expect(await fail(calendarRepository.mine({ from: vnDate(5), to: vnDate(0) }))).toMatchObject({ status: 400, fieldErrors: [{ field: 'to' }] })
    expect(await fail(calendarRepository.mine({ from: vnDate(0), to: vnDate(62) }))).toMatchObject({ status: 400, fieldErrors: [{ field: 'to', message: 'Mỗi lần xem tối đa 62 ngày.' }] })
    expect((await calendarRepository.mine({ from: vnDate(0), to: vnDate(61) })).items.length).toBeGreaterThan(0)
  })
})
