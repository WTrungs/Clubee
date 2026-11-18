import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type {
  CreateEventRequest,
  CreateSubcommitteeRequest,
  EventDetail,
  EventQuery,
  EventSummary,
  EventTransitionRequest,
  MyRegistration,
  Registration,
  RescheduleEventRequest,
  StaffCandidate,
  Subcommittee,
} from './eventTypes'

const events = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}/events`
const event = (clubId: string, eventId: string) => `${events(clubId)}/${encodeURIComponent(eventId)}`

export const eventRepository = {
  list: (clubId: string, query: EventQuery) =>
    httpClient.get<Page<EventSummary>>(events(clubId), { query: { status: query.status, q: query.q, page: query.page, size: query.size } }),
  get: (clubId: string, eventId: string) => httpClient.get<EventDetail>(event(clubId, eventId)),
  create: (clubId: string, request: CreateEventRequest) => httpClient.post<EventDetail>(events(clubId), request),
  transition: (clubId: string, eventId: string, request: EventTransitionRequest) =>
    httpClient.post<EventDetail>(`${event(clubId, eventId)}/transitions`, request),
  /** FR-EVT-14: dời thời gian; người đang giữ chỗ phải xác nhận lại. */
  reschedule: (clubId: string, eventId: string, request: RescheduleEventRequest) => httpClient.post<EventDetail>(`${event(clubId, eventId)}/reschedule`, request),
  leadCandidates: (clubId: string) => httpClient.get<StaffCandidate[]>(`/clubs/${encodeURIComponent(clubId)}/event-lead-candidates`),

  subcommittees: (clubId: string, eventId: string) => httpClient.get<Subcommittee[]>(`${event(clubId, eventId)}/subcommittees`),
  createSubcommittee: (clubId: string, eventId: string, request: CreateSubcommitteeRequest) =>
    httpClient.post<Subcommittee>(`${event(clubId, eventId)}/subcommittees`, request),
  addStaff: (clubId: string, eventId: string, subcommitteeId: string, userId: string) =>
    httpClient.post<Subcommittee>(`${event(clubId, eventId)}/subcommittees/${encodeURIComponent(subcommitteeId)}/members`, { userId }),
  addCollaborator: (clubId: string, eventId: string, subcommitteeId: string, email: string) =>
    httpClient.post<Subcommittee>(`${event(clubId, eventId)}/subcommittees/${encodeURIComponent(subcommitteeId)}/collaborators`, { email }),
  staffCandidates: (clubId: string, eventId: string, q: string) =>
    httpClient.get<StaffCandidate[]>(`${event(clubId, eventId)}/staff-candidates`, { query: { q } }),

  registrations: (clubId: string, eventId: string, query: { q?: string; page?: number; size?: number }) =>
    httpClient.get<Page<Registration>>(`${event(clubId, eventId)}/registrations`, { query }),
  register: (clubId: string, eventId: string) => httpClient.post<MyRegistration>(`${event(clubId, eventId)}/registrations`),
  /** FR-EVT-13: tự hủy đăng ký; chỗ trống được đôn cho người đầu danh sách chờ. */
  cancelRegistration: (clubId: string, eventId: string, registrationId: string) =>
    httpClient.post<MyRegistration>(`${event(clubId, eventId)}/registrations/${encodeURIComponent(registrationId)}/cancellation`),
  /** FR-EVT-14: xác nhận vẫn tham dự sau khi sự kiện dời giờ. */
  reconfirmRegistration: (clubId: string, eventId: string, registrationId: string) =>
    httpClient.post<MyRegistration>(`${event(clubId, eventId)}/registrations/${encodeURIComponent(registrationId)}/reconfirmation`),
}
