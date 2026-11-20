import type { EventQuery } from '../model/eventTypes'

export const eventQueryKeys = {
  all: ['events'] as const,
  lists: ['events', 'list'] as const,
  list: (clubId: string, query: EventQuery) => ['events', 'list', clubId, query] as const,
  /** Mọi trang chi tiết sự kiện; tạm ứng đổi thì số tạm ứng mở và gợi ý đóng sự kiện đổi theo (BR-EVT-05). */
  details: ['events', 'detail'] as const,
  detail: (clubId: string, eventId: string) => ['events', 'detail', clubId, eventId] as const,
  subcommittees: (clubId: string, eventId: string) => ['events', 'subcommittees', clubId, eventId] as const,
  candidates: (clubId: string, eventId: string, q: string, coHostId: string | null = null) => ['events', 'candidates', clubId, eventId, q, coHostId] as const,
  progress: (clubId: string, eventId: string) => ['events', 'progress', clubId, eventId] as const,
  coHosts: (clubId: string, eventId: string) => ['events', 'coHosts', clubId, eventId] as const,
  coHostInvitations: (clubId: string) => ['events', 'coHostInvitations', clubId] as const,
  registrationsOf: (clubId: string, eventId: string) => ['events', 'registrations', clubId, eventId] as const,
  registrations: (clubId: string, eventId: string, query: { q?: string; page?: number }) => ['events', 'registrations', clubId, eventId, query] as const,
  leadCandidates: (clubId: string) => ['events', 'leadCandidates', clubId] as const,
}
