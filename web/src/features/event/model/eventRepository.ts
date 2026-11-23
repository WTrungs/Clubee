import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type {
  CoHost,
  CoHostDecisionRequest,
  CreateEventRequest,
  CreateSubcommitteeRequest,
  EventDetail,
  EventReport,
  EventQuery,
  EventSummary,
  EventTransitionRequest,
  GuestRegistrationRow,
  InviteCoHostRequest,
  MyRegistration,
  PendingStaffSignup,
  Registration,
  RemoveCoHostRequest,
  RescheduleEventRequest,
  SetSubcommitteeLeadRequest,
  SharedEvent,
  StaffSignupInfo,
  StaffSignupRequest,
  StaffSignupSetting,
  StaffCandidate,
  Subcommittee,
} from './eventTypes'

const events = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}/events`
const event = (clubId: string, eventId: string) => `${events(clubId)}/${encodeURIComponent(eventId)}`
const subcommittee = (clubId: string, eventId: string, subcommitteeId: string) => `${event(clubId, eventId)}/subcommittees/${encodeURIComponent(subcommitteeId)}`

export const eventRepository = {
  list: (clubId: string, query: EventQuery) =>
    httpClient.get<Page<EventSummary>>(events(clubId), { query: { status: query.status, q: query.q, termId: query.termId, page: query.page, size: query.size } }),
  get: (clubId: string, eventId: string) => httpClient.get<EventDetail>(event(clubId, eventId)),
  create: (clubId: string, request: CreateEventRequest) => httpClient.post<EventDetail>(events(clubId), request),
  transition: (clubId: string, eventId: string, request: EventTransitionRequest) =>
    httpClient.post<EventDetail>(`${event(clubId, eventId)}/transitions`, request),
  /** FR-EVT-14: dời thời gian; người đang giữ chỗ phải xác nhận lại. */
  reschedule: (clubId: string, eventId: string, request: RescheduleEventRequest) => httpClient.post<EventDetail>(`${event(clubId, eventId)}/reschedule`, request),
  leadCandidates: (clubId: string) => httpClient.get<StaffCandidate[]>(`/clubs/${encodeURIComponent(clubId)}/event-lead-candidates`),

  /** FR-RPT-05: báo cáo sự kiện thay cho tiến độ (FR-EVT-09 nằm trong phần công việc). */
  report: (clubId: string, eventId: string) => httpClient.get<EventReport>(`${event(clubId, eventId)}/report`),
  subcommittees: (clubId: string, eventId: string) => httpClient.get<Subcommittee[]>(`${event(clubId, eventId)}/subcommittees`),
  createSubcommittee: (clubId: string, eventId: string, request: CreateSubcommitteeRequest) =>
    httpClient.post<Subcommittee>(`${event(clubId, eventId)}/subcommittees`, request),
  /** `coHostId` có giá trị thì thêm thành viên của CLB đồng tổ chức đó (FR-EVT-08). */
  addStaff: (clubId: string, eventId: string, subcommitteeId: string, userId: string, coHostId: string | null = null) =>
    httpClient.post<Subcommittee>(`${subcommittee(clubId, eventId, subcommitteeId)}/members`, coHostId ? { userId, coHostId } : { userId }),
  addCollaborator: (clubId: string, eventId: string, subcommitteeId: string, email: string) =>
    httpClient.post<Subcommittee>(`${subcommittee(clubId, eventId, subcommitteeId)}/collaborators`, { email }),
  setSubcommitteeLead: (clubId: string, eventId: string, subcommitteeId: string, request: SetSubcommitteeLeadRequest) =>
    httpClient.put<Subcommittee>(`${subcommittee(clubId, eventId, subcommitteeId)}/lead`, request),
  staffCandidates: (clubId: string, eventId: string, q: string, coHostId: string | null = null) =>
    httpClient.get<StaffCandidate[]>(`${event(clubId, eventId)}/staff-candidates`, { query: { q, coHostId: coHostId ?? undefined } }),

  coHosts: (clubId: string, eventId: string) => httpClient.get<CoHost[]>(`${event(clubId, eventId)}/co-hosts`),
  inviteCoHost: (clubId: string, eventId: string, request: InviteCoHostRequest) => httpClient.post<CoHost>(`${event(clubId, eventId)}/co-hosts`, request),
  removeCoHost: (clubId: string, eventId: string, coHostId: string, request: RemoveCoHostRequest) =>
    httpClient.post<CoHost>(`${event(clubId, eventId)}/co-hosts/${encodeURIComponent(coHostId)}/removal`, request),
  /** Lời mời đồng tổ chức gửi tới CLB này (tab Sự kiện chung). */
  coHostInvitations: (clubId: string) => httpClient.get<SharedEvent[]>(`/clubs/${encodeURIComponent(clubId)}/co-host-invitations`),
  decideCoHost: (clubId: string, invitationId: string, request: CoHostDecisionRequest) =>
    httpClient.post<SharedEvent>(`/clubs/${encodeURIComponent(clubId)}/co-host-invitations/${encodeURIComponent(invitationId)}/decision`, request),

  registrations: (clubId: string, eventId: string, query: { q?: string; page?: number; size?: number }) =>
    httpClient.get<Page<Registration>>(`${event(clubId, eventId)}/registrations`, { query }),
  register: (clubId: string, eventId: string) => httpClient.post<MyRegistration>(`${event(clubId, eventId)}/registrations`),
  /** FR-EVT-13: tự hủy đăng ký; chỗ trống được đôn cho người đầu danh sách chờ. */
  cancelRegistration: (clubId: string, eventId: string, registrationId: string) =>
    httpClient.post<MyRegistration>(`${event(clubId, eventId)}/registrations/${encodeURIComponent(registrationId)}/cancellation`),
  /** FR-EVT-14: xác nhận vẫn tham dự sau khi sự kiện dời giờ. */
  reconfirmRegistration: (clubId: string, eventId: string, registrationId: string) =>
    httpClient.post<MyRegistration>(`${event(clubId, eventId)}/registrations/${encodeURIComponent(registrationId)}/reconfirmation`),
  /** FR-EVT-12, FR-ATT-07: BTC tra khách mời theo mã, email, SĐT và ghi có mặt theo ngày. */
  guestRegistrations: (clubId: string, eventId: string, query: { q?: string; day?: string | null }) =>
    httpClient.get<GuestRegistrationRow[]>(`${event(clubId, eventId)}/guest-registrations`, { query: { q: query.q, day: query.day ?? undefined } }),
  checkInGuest: (clubId: string, eventId: string, registrationId: string, day: string | null) =>
    httpClient.post<GuestRegistrationRow>(`${event(clubId, eventId)}/guest-registrations/${encodeURIComponent(registrationId)}/check-ins`, { day }),
  /** FR-EVT-06: BTC mở, đóng đăng ký nhân sự; thành viên tự vào tiểu ban, đủ chỉ tiêu thì gửi yêu cầu cho Trưởng BTC. */
  setStaffSignup: (clubId: string, eventId: string, setting: StaffSignupSetting) => httpClient.put<StaffSignupSetting>(`${event(clubId, eventId)}/staff-signup`, setting),
  staffSignup: (clubId: string, eventId: string) => httpClient.get<StaffSignupInfo>(`${event(clubId, eventId)}/staff-signup`),
  signUpStaff: (clubId: string, eventId: string, request: StaffSignupRequest) => httpClient.post<StaffSignupInfo>(`${event(clubId, eventId)}/staff-signups`, request),
  staffSignupRequests: (clubId: string, eventId: string) => httpClient.get<PendingStaffSignup[]>(`${event(clubId, eventId)}/staff-signup-requests`),
  approveStaffSignup: (clubId: string, eventId: string, requestId: string) =>
    httpClient.post<PendingStaffSignup>(`${event(clubId, eventId)}/staff-signup-requests/${encodeURIComponent(requestId)}/approval`),
  rejectStaffSignup: (clubId: string, eventId: string, requestId: string, reason: string) =>
    httpClient.post<PendingStaffSignup>(`${event(clubId, eventId)}/staff-signup-requests/${encodeURIComponent(requestId)}/rejection`, { reason }),
}
