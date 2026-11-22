import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type {
  DuesCampaignDetail,
  DuesCampaignQuery,
  DuesCampaignSummary,
  DuesCandidate,
  DuesItem,
  DuesItemQuery,
  MyDuesItem,
  OpenDuesRequest,
  RecordDuesPaymentRequest,
  SetExemptionRequest,
  UpdateDuesCampaignRequest,
} from './duesTypes'

const campaigns = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}/dues-campaigns`
const campaign = (clubId: string, campaignId: string) => `${campaigns(clubId)}/${encodeURIComponent(campaignId)}`

/** FR-FIN-09, FR-FIN-10: đợt đóng quỹ, xác nhận đã nộp. */
export const duesRepository = {
  /** FR-FIN-13: khoản đóng của chính mình, mọi đợt (kể cả đã đóng) của CLB. */
  mine: (clubId: string) => httpClient.get<MyDuesItem[]>('/me/dues', { query: { clubId } }),
  list: (clubId: string, query: DuesCampaignQuery) =>
    httpClient.get<Page<DuesCampaignSummary>>(campaigns(clubId), { query: { status: query.status, page: query.page, size: query.size } }),
  candidates: (clubId: string, q: string) => httpClient.get<DuesCandidate[]>(`/clubs/${encodeURIComponent(clubId)}/dues-candidates`, { query: { q: q || undefined } }),
  open: (clubId: string, request: OpenDuesRequest) => httpClient.post<DuesCampaignDetail>(campaigns(clubId), request),
  get: (clubId: string, campaignId: string) => httpClient.get<DuesCampaignDetail>(campaign(clubId, campaignId)),
  update: (clubId: string, campaignId: string, request: UpdateDuesCampaignRequest) => httpClient.patch<DuesCampaignDetail>(campaign(clubId, campaignId), request),
  items: (clubId: string, campaignId: string, query: DuesItemQuery) =>
    httpClient.get<Page<DuesItem>>(`${campaign(clubId, campaignId)}/items`, { query: { status: query.status, q: query.q, page: query.page, size: query.size } }),
  setExemption: (clubId: string, campaignId: string, itemId: string, request: SetExemptionRequest) =>
    httpClient.put<DuesItem>(`${campaign(clubId, campaignId)}/items/${encodeURIComponent(itemId)}/exemption`, request),
  recordPayment: (clubId: string, campaignId: string, itemId: string, request: RecordDuesPaymentRequest) =>
    httpClient.post<DuesItem>(`${campaign(clubId, campaignId)}/items/${encodeURIComponent(itemId)}/payments`, request),
  close: (clubId: string, campaignId: string, version: number) => httpClient.post<DuesCampaignDetail>(`${campaign(clubId, campaignId)}/closure`, { version }),
}
