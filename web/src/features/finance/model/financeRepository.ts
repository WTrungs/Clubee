import type { FileRef } from '@/api/commonTypes'
import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type {
  CreateTransactionRequest,
  FundDetail,
  FundQuery,
  FundSummary,
  FundTransitionRequest,
  TransactionDetail,
  TransactionQuery,
  TransactionSummary,
  TransactionTransitionRequest,
} from './financeTypes'

const club = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}`

export const financeRepository = {
  funds: (clubId: string, query: FundQuery) =>
    httpClient.get<Page<FundSummary>>(`${club(clubId)}/funds`, { query: { kind: query.kind, status: query.status, page: query.page, size: query.size } }),
  fund: (clubId: string, fundId: string) => httpClient.get<FundDetail>(`${club(clubId)}/funds/${encodeURIComponent(fundId)}`),
  /** FR-FIN-06: máy chủ chỉ trả các dòng người gọi được xem. */
  transactions: (clubId: string, query: TransactionQuery) =>
    httpClient.get<Page<TransactionSummary>>(`${club(clubId)}/transactions`, {
      query: {
        fundId: query.fundId,
        status: query.status,
        type: query.type,
        category: query.category,
        from: query.from,
        to: query.to,
        q: query.q,
        mine: query.mine,
        page: query.page,
        size: query.size,
      },
    }),
  /** `fundId`: quỹ đang xem, để chuyển quỹ hiện đúng chiều tiền như trong sổ quỹ. */
  transaction: (clubId: string, transactionId: string, fundId?: string) =>
    httpClient.get<TransactionDetail>(`${club(clubId)}/transactions/${encodeURIComponent(transactionId)}`, { query: { fundId } }),
  /** FR-FIN-11: Thủ quỹ quyết toán quỹ sự kiện. */
  settle: (clubId: string, fundId: string, version: number) =>
    httpClient.post<FundDetail>(`${club(clubId)}/funds/${encodeURIComponent(fundId)}/transitions`, { action: 'SETTLE', version } satisfies FundTransitionRequest),
  create: (clubId: string, request: CreateTransactionRequest) => httpClient.post<TransactionDetail>(`${club(clubId)}/transactions`, request),
  /** ST-EXP: rút, duyệt, từ chối, ghi sổ (FR-FIN-02..04). */
  transition: (clubId: string, transactionId: string, request: TransactionTransitionRequest) =>
    httpClient.post<TransactionDetail>(`${club(clubId)}/transactions/${encodeURIComponent(transactionId)}/transitions`, request),
  /** Chứng từ tải lên trước, rồi gửi mã tệp cùng giao dịch (IF-05). */
  uploadAttachment: (clubId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return httpClient.post<FileRef>(`${club(clubId)}/transaction-attachments`, form)
  },
}
