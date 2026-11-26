import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { signInAs } from '@/testUtils'
import { eventRepository } from '../model/eventRepository'

const versionOf = (eventId: string) => db.events.find((event) => event.id === eventId)?.version ?? 0
const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)

describe('event registration (FR-EVT-11)', () => {
  it('fills the last seat, then sends later registrations to the waitlist in order (BR-EVT-03)', async () => {
    signInAs('u-ha')
    const first = await eventRepository.register('c-guitar', 'e-winter')
    expect(first.status).toBe('CONFIRMED')

    signInAs('u-bao')
    const second = await eventRepository.register('c-guitar', 'e-winter')
    expect(second).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 })

    const event = await eventRepository.get('c-guitar', 'e-winter')
    expect(event.confirmedCount).toBe(event.capacity)
    expect(event.waitlistCount).toBe(1)
  })

  it('rejects a second registration by the same person (BR-EVT-04)', async () => {
    signInAs('u-ha')
    await eventRepository.register('c-guitar', 'e-winter')
    const error = await fail(eventRepository.register('c-guitar', 'e-winter'))
    expect(error?.status).toBe(409)
    expect((await eventRepository.get('c-guitar', 'e-winter')).allowedActions).not.toContain('REGISTER')
  })

  it('only accepts registrations while registration is open (BR-EVT-02)', async () => {
    signInAs('u-ha')
    const error = await fail(eventRepository.register('c-guitar', 'e-workshop'))
    expect(error?.status).toBe(422)
  })

  it('hides the attendee list from members outside the organising committee (SRS 3.5)', async () => {
    signInAs('u-thao')
    const event = await eventRepository.get('c-guitar', 'e-winter')
    expect(event.allowedActions).not.toContain('VIEW_REGISTRATIONS')
    const error = await fail(eventRepository.registrations('c-guitar', 'e-winter', {}))
    expect(error?.status).toBe(403)
    expect(error?.detail).toBe('Chỉ ban tổ chức và ban chủ nhiệm được xem danh sách tham dự.')
  })
})

describe('event lifecycle (ST-EVT)', () => {
  it('lets a member propose, the board reject with a reason, and the proposer resubmit', async () => {
    signInAs('u-bao')
    const submitted = await eventRepository.transition('c-guitar', 'e-camp', { action: 'SUBMIT', version: versionOf('e-camp') })
    expect(submitted.status).toBe('PENDING_APPROVAL')

    signInAs('u-anh')
    const missingReason = await fail(eventRepository.transition('c-guitar', 'e-camp', { action: 'REJECT', version: versionOf('e-camp') }))
    expect(missingReason?.status).toBe(400)
    const rejected = await eventRepository.transition('c-guitar', 'e-camp', { action: 'REJECT', version: versionOf('e-camp'), reason: 'Cần thêm dự trù kinh phí.' })
    expect(rejected).toMatchObject({ status: 'DRAFT', rejectionReason: 'Cần thêm dự trù kinh phí.' })
  })

  it('keeps a rejected draft visible to the board but not to other members', async () => {
    signInAs('u-bao')
    await eventRepository.transition('c-guitar', 'e-camp', { action: 'SUBMIT', version: versionOf('e-camp') })
    signInAs('u-anh')
    await eventRepository.transition('c-guitar', 'e-camp', { action: 'REJECT', version: versionOf('e-camp'), reason: 'Cần thêm dự trù kinh phí.' })

    const seenByBoard = await eventRepository.get('c-guitar', 'e-camp')
    expect(seenByBoard).toMatchObject({ status: 'DRAFT', rejectionReason: 'Cần thêm dự trù kinh phí.' })
    expect(seenByBoard.allowedActions).not.toContain('SUBMIT')

    signInAs('u-ha')
    const error = await fail(eventRepository.get('c-guitar', 'e-camp'))
    expect(error?.status).toBe(404)
  })

  it('makes the proposer the event lead on approval by default (FR-EVT-03)', async () => {
    signInAs('u-anh')
    const approved = await eventRepository.transition('c-guitar', 'e-busking', { action: 'APPROVE', version: versionOf('e-busking') })
    expect(approved.status).toBe('APPROVED')
    expect(approved.lead?.id).toBe('u-ha')
  })

  it('refuses approval by someone outside the board, with the reason', async () => {
    signInAs('u-ha')
    const busking = await eventRepository.get('c-guitar', 'e-busking')
    expect(busking.allowedActions).not.toContain('APPROVE')
    const error = await fail(eventRepository.transition('c-guitar', 'e-busking', { action: 'APPROVE', version: busking.version }))
    expect(error?.status).toBe(403)
  })

  it('creates board events directly as approved (FR-EVT-01) and member proposals as drafts (FR-EVT-02)', async () => {
    const base = {
      name: 'Buổi tập mở',
      description: '',
      startAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      endAt: new Date(Date.now() + 5 * 86_400_000 + 7_200_000).toISOString(),
      format: 'OFFLINE' as const,
      location: 'Phòng tập',
      onlineUrl: null,
      capacity: null,
      registrationDeadline: null,
      openToGuests: false,
    }
    signInAs('u-anh')
    expect((await eventRepository.create('c-guitar', { ...base, leadUserId: 'u-kiet' })).status).toBe('APPROVED')
    signInAs('u-ha')
    const draft = await eventRepository.create('c-guitar', { ...base, leadUserId: null })
    expect(draft.status).toBe('DRAFT')
    expect(draft.allowedActions).toContain('SUBMIT')
  })

  it('stops a cancelled event at the step it reached and keeps the reason', async () => {
    signInAs('u-anh')
    const cancelled = await eventRepository.transition('c-guitar', 'e-workshop', { action: 'CANCEL', version: versionOf('e-workshop'), reason: 'Không đặt được phòng.' })
    expect(cancelled).toMatchObject({ status: 'CANCELLED', statusBeforeCancel: 'APPROVED', cancellationReason: 'Không đặt được phòng.' })
    expect(cancelled.allowedActions).not.toContain('CANCEL')
  })
})

describe('organising committee (FR-EVT-04, 05)', () => {
  it('allows one person to lead at most one subcommittee per event (BR-ORG-04)', async () => {
    signInAs('u-bao')
    const error = await fail(eventRepository.createSubcommittee('c-guitar', 'e-winter', { name: 'Lễ tân', description: '', quota: 2, leadUserId: 'u-long' }))
    expect(error?.status).toBe(422)
    const created = await eventRepository.createSubcommittee('c-guitar', 'e-winter', { name: 'Lễ tân', description: '', quota: 2, leadUserId: 'u-mai' })
    expect(created.lead?.id).toBe('u-mai')
  })

  it('shows invite candidates with only name and department (FR-EVT-05)', async () => {
    signInAs('u-bao')
    const candidates = await eventRepository.staffCandidates('c-guitar', 'e-winter', 'trâm')
    // FR-TASK-09: kèm hoạt động chồng giờ (ở đây không có), không thêm thông tin cá nhân nào khác.
    expect(candidates).toEqual([{ id: 'u-tram', fullName: 'Ngô Bảo Trâm', departmentName: 'Hậu cần', conflicts: [] }])
  })

  it('lets the event lead pick a lead for the first subcommittee of an event without any yet', async () => {
    signInAs('u-nam')
    expect(db.subcommittees.some((subcommittee) => subcommittee.eventId === 'e-workshop')).toBe(false)
    const candidates = await eventRepository.staffCandidates('c-guitar', 'e-workshop', '')
    const leadId = candidates[0]?.id
    expect(leadId).toBeDefined()
    const created = await eventRepository.createSubcommittee('c-guitar', 'e-workshop', { name: 'Hậu cần', description: '', quota: null, leadUserId: leadId ?? null })
    expect(created.lead?.id).toBe(leadId)
  })
})
