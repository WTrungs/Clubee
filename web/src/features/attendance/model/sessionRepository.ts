import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type {
  CancelSessionRequest,
  CreateSessionRequest,
  CreateSessionSeriesRequest,
  CreateSessionSeriesResult,
  SessionDetail,
  SessionQuery,
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
  scopes: (clubId: string) => httpClient.get<SessionScopeOption[]>(`/clubs/${encodeURIComponent(clubId)}/session-scopes`),
}
