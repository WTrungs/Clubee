import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type { AdvanceDetail, AdvanceQuery, AdvanceSummary, AdvanceTransitionRequest, ProposeAdvanceRequest } from './advanceTypes'

const advances = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}/advances`

/** FR-FIN-07: tạm ứng. */
export const advanceRepository = {
  list: (clubId: string, query: AdvanceQuery) =>
    httpClient.get<Page<AdvanceSummary>>(advances(clubId), {
      query: { fundId: query.fundId, status: query.status, mine: query.mine, overdue: query.overdue, q: query.q, page: query.page, size: query.size },
    }),
  get: (clubId: string, advanceId: string) => httpClient.get<AdvanceDetail>(`${advances(clubId)}/${encodeURIComponent(advanceId)}`),
  propose: (clubId: string, request: ProposeAdvanceRequest) => httpClient.post<AdvanceDetail>(advances(clubId), request),
  transition: (clubId: string, advanceId: string, request: AdvanceTransitionRequest) =>
    httpClient.post<AdvanceDetail>(`${advances(clubId)}/${encodeURIComponent(advanceId)}/transitions`, request),
}
