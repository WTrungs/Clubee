import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type {
  AbsenceDecisionRequest,
  AbsenceRequestRow,
  CancelSessionRequest,
  CreateAbsenceRequest,
  CreateSessionRequest,
  CreateSessionSeriesRequest,
  CreateSessionSeriesResult,
  SessionDetail,
  SessionQuery,
  SessionRegistrationRow,
  SessionScopeOption,
  SessionSummary,
  UpdateSessionRequest,
} from './sessionTypes'

const sessions = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}/sessions`

export const sessionRepository = {
  list: (clubId: string, query: SessionQuery) =>
    httpClient.get<Page<SessionSummary>>(sessions(clubId), {
      query: { when: query.when, scopeType: query.scopeType, departmentId: query.departmentId, q: query.q, page: query.page, size: query.size },
    }),
  get: (clubId: string, sessionId: string) => httpClient.get<SessionDetail>(`${sessions(clubId)}/${encodeURIComponent(sessionId)}`),
  create: (clubId: string, request: CreateSessionRequest) => httpClient.post<SessionDetail>(sessions(clubId), request),
  createSeries: (clubId: string, request: CreateSessionSeriesRequest) =>
    httpClient.post<CreateSessionSeriesResult>(`/clubs/${encodeURIComponent(clubId)}/session-series`, request),
  update: (clubId: string, sessionId: string, request: UpdateSessionRequest) =>
    httpClient.patch<SessionDetail>(`${sessions(clubId)}/${encodeURIComponent(sessionId)}`, request),
  cancel: (clubId: string, sessionId: string, request: CancelSessionRequest) =>
    httpClient.post<SessionDetail>(`${sessions(clubId)}/${encodeURIComponent(sessionId)}/cancellation`, request),
  /** FR-ATT-03: tự đăng ký; hết chỗ thì vào danh sách chờ. Trả buổi sau khi đăng ký. */
  register: (clubId: string, sessionId: string) => httpClient.post<SessionDetail>(`${sessions(clubId)}/${encodeURIComponent(sessionId)}/registrations`, {}),
  cancelRegistration: (clubId: string, sessionId: string, registrationId: string) =>
    httpClient.post<SessionDetail>(`${sessions(clubId)}/${encodeURIComponent(sessionId)}/registrations/${encodeURIComponent(registrationId)}/cancellation`, {}),
  registrations: (clubId: string, sessionId: string, query: { q?: string; page?: number; size?: number }) =>
    httpClient.get<Page<SessionRegistrationRow>>(`${sessions(clubId)}/${encodeURIComponent(sessionId)}/registrations`, { query }),
  /** FR-ATT-04: xin phép vắng, rút đơn; người phụ trách xem và duyệt. */
  requestAbsence: (clubId: string, sessionId: string, request: CreateAbsenceRequest) =>
    httpClient.post<SessionDetail>(`${sessions(clubId)}/${encodeURIComponent(sessionId)}/absence-requests`, request),
  withdrawAbsence: (clubId: string, sessionId: string, requestId: string, version: number) =>
    httpClient.post<SessionDetail>(`${sessions(clubId)}/${encodeURIComponent(sessionId)}/absence-requests/${encodeURIComponent(requestId)}/withdrawal`, { version }),
  absenceRequests: (clubId: string, sessionId: string) => httpClient.get<AbsenceRequestRow[]>(`${sessions(clubId)}/${encodeURIComponent(sessionId)}/absence-requests`),
  decideAbsence: (clubId: string, sessionId: string, requestId: string, request: AbsenceDecisionRequest) =>
    httpClient.post<AbsenceRequestRow>(`${sessions(clubId)}/${encodeURIComponent(sessionId)}/absence-requests/${encodeURIComponent(requestId)}/decision`, request),
  scopes: (clubId: string) => httpClient.get<SessionScopeOption[]>(`/clubs/${encodeURIComponent(clubId)}/session-scopes`),
}
