import type { EventQuery } from '../model/eventTypes'

export const eventQueryKeys = {
  all: ['events'] as const,
  lists: ['events', 'list'] as const,
  list: (clubId: string, query: EventQuery) => ['events', 'list', clubId, query] as const,
  detail: (clubId: string, eventId: string) => ['events', 'detail', clubId, eventId] as const,
  subcommittees: (clubId: string, eventId: string) => ['events', 'subcommittees', clubId, eventId] as const,
  candidates: (clubId: string, eventId: string, q: string) => ['events', 'candidates', clubId, eventId, q] as const,
  registrationsOf: (clubId: string, eventId: string) => ['events', 'registrations', clubId, eventId] as const,
  registrations: (clubId: string, eventId: string, query: { q?: string; page?: number }) => ['events', 'registrations', clubId, eventId, query] as const,
  leadCandidates: (clubId: string) => ['events', 'leadCandidates', clubId] as const,
}
