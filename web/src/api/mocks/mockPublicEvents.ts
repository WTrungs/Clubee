import type { PublicEventDetail, PublicEventSummary } from '@/features/event/model/eventTypes'
import { db, type DbClub } from './db'
import { seatsTaken } from './mockRegistrations'
import type { DbEvent } from './seed/eventSeed'

/** BR-EVT-02: nhận đăng ký khi sự kiện Mở đăng ký và chưa quá hạn đăng ký. */
export const acceptsRegistrations = (event: DbEvent, now = Date.now()) =>
  event.status === 'REGISTRATION_OPEN' && (event.registrationDeadline === null || Date.parse(event.registrationDeadline) > now)

const clubOf = (event: DbEvent): DbClub | undefined => db.clubs.find((club) => club.id === event.clubId)

/** Sự kiện có trang công khai: mở cho khách, đang Mở đăng ký hoặc Đang diễn ra, CLB còn Hoạt động. */
export function publicEventOf(eventId: string): DbEvent | undefined {
  const event = db.events.find((candidate) => candidate.id === eventId)
  if (!event?.openToGuests || (event.status !== 'REGISTRATION_OPEN' && event.status !== 'ONGOING')) return undefined
  return clubOf(event)?.status === 'ACTIVE' ? event : undefined
}

/** FR-CLB-07: sự kiện mở cho khách đang nhận đăng ký, sắp diễn ra trước. */
export const guestEventsOf = (clubId: string) =>
  db.events
    .filter((event) => event.clubId === clubId && event.openToGuests && acceptsRegistrations(event))
    .toSorted((a, b) => a.startAt.localeCompare(b.startAt))

export function toPublicEventSummary(event: DbEvent): PublicEventSummary {
  return {
    id: event.id,
    clubId: event.clubId,
    clubName: clubOf(event)?.name ?? '',
    name: event.name,
    startAt: event.startAt,
    endAt: event.endAt,
    format: event.format,
    location: event.location,
    capacity: event.capacity,
    seatsLeft: event.capacity === null ? null : Math.max(event.capacity - seatsTaken(event.id), 0),
    registrationDeadline: event.registrationDeadline,
  }
}

export function toPublicEventDetail(event: DbEvent): PublicEventDetail {
  const club = clubOf(event)
  return {
    ...toPublicEventSummary(event),
    description: event.description,
    clubShortName: club?.shortName ?? '',
    clubLogoUrl: club?.logoUrl ?? null,
    registrationOpen: acceptsRegistrations(event),
  }
}
