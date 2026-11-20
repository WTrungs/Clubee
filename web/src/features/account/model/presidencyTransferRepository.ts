import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type {
  AdminTransferQuery,
  AdminTransferRequest,
  MemberTransferRequest,
  PresidencyTransferOverview,
  TransferCandidate,
  TransferDecisionRequest,
} from './presidencyTransferTypes'

const club = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}`
const adminRequest = (requestId: string) => `/admin/presidency-transfer-requests/${encodeURIComponent(requestId)}`

/** FR-ACC-08: phía thành viên gọi theo CLB hiện hành, phía Admin gọi khu `/admin`. */
export const presidencyTransferRepository = {
  overview: (clubId: string) => httpClient.get<PresidencyTransferOverview>(`${club(clubId)}/presidency-transfer-request`),
  request: (clubId: string, reason: string) => httpClient.post<MemberTransferRequest>(`${club(clubId)}/presidency-transfer-requests`, { reason }),
  cancel: (clubId: string, requestId: string, version: number) =>
    httpClient.post<MemberTransferRequest>(`${club(clubId)}/presidency-transfer-requests/${encodeURIComponent(requestId)}/cancellation`, { version }),
  adminList: (query: AdminTransferQuery) =>
    httpClient.get<Page<AdminTransferRequest>>('/admin/presidency-transfer-requests', { query: { status: query.status, page: query.page, size: query.size } }),
  candidates: (requestId: string) => httpClient.get<TransferCandidate[]>(`${adminRequest(requestId)}/candidates`),
  decide: (requestId: string, request: TransferDecisionRequest) => httpClient.post<AdminTransferRequest>(`${adminRequest(requestId)}/decision`, request),
}
