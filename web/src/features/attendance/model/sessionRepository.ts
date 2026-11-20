import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type { CreateSessionRequest, SessionDetail, SessionQuery, SessionScopeOption, SessionSummary } from './sessionTypes'

const sessions = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}/sessions`

export const sessionRepository = {
  list: (clubId: string, query: SessionQuery) =>
    httpClient.get<Page<SessionSummary>>(sessions(clubId), {
      query: { when: query.when, scopeType: query.scopeType, departmentId: query.departmentId, q: query.q, page: query.page, size: query.size },
    }),
  get: (clubId: string, sessionId: string) => httpClient.get<SessionDetail>(`${sessions(clubId)}/${encodeURIComponent(sessionId)}`),
  create: (clubId: string, request: CreateSessionRequest) => httpClient.post<SessionDetail>(sessions(clubId), request),
  scopes: (clubId: string) => httpClient.get<SessionScopeOption[]>(`/clubs/${encodeURIComponent(clubId)}/session-scopes`),
}
