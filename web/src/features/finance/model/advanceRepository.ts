import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type {
  AdvanceDetail,
  AdvanceQuery,
  AdvanceSummary,
  AdvanceTransitionRequest,
  CloseAdvanceRequest,
  ProposeAdvanceRequest,
  SettlementLineDecisionRequest,
  SubmitSettlementLineRequest,
} from './advanceTypes'

const advances = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}/advances`

/** FR-FIN-07, FR-FIN-08: tạm ứng và quyết toán tạm ứng. */
export const advanceRepository = {
  list: (clubId: string, query: AdvanceQuery) =>
    httpClient.get<Page<AdvanceSummary>>(advances(clubId), {
      query: { fundId: query.fundId, status: query.status, mine: query.mine, overdue: query.overdue, q: query.q, page: query.page, size: query.size },
    }),
  get: (clubId: string, advanceId: string) => httpClient.get<AdvanceDetail>(`${advances(clubId)}/${encodeURIComponent(advanceId)}`),
  propose: (clubId: string, request: ProposeAdvanceRequest) => httpClient.post<AdvanceDetail>(advances(clubId), request),
  transition: (clubId: string, advanceId: string, request: AdvanceTransitionRequest) =>
    httpClient.post<AdvanceDetail>(`${advances(clubId)}/${encodeURIComponent(advanceId)}/transitions`, request),
  submitLine: (clubId: string, advanceId: string, request: SubmitSettlementLineRequest) =>
    httpClient.post<AdvanceDetail>(`${advances(clubId)}/${encodeURIComponent(advanceId)}/settlement-lines`, request),
  decideLine: (clubId: string, advanceId: string, lineId: string, request: SettlementLineDecisionRequest) =>
    httpClient.post<AdvanceDetail>(`${advances(clubId)}/${encodeURIComponent(advanceId)}/settlement-lines/${encodeURIComponent(lineId)}/decision`, request),
  close: (clubId: string, advanceId: string, request: CloseAdvanceRequest) =>
    httpClient.post<AdvanceDetail>(`${advances(clubId)}/${encodeURIComponent(advanceId)}/closure`, request),
}
