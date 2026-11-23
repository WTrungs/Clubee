import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type {
  CompleteHandoverRequest,
  ConfirmItemsRequest,
  Handover,
  HandoverItem,
  HandoverItemQuery,
  SaveAppointmentsRequest,
  StartHandoverRequest,
  SubstituteConfirmRequest,
} from './handoverTypes'
import type { CreateTermRequest, ExtendTermRequest, Term, TermOverview, UpdateTermRequest } from './termTypes'

const club = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}`
const terms = (clubId: string) => `${club(clubId)}/terms`
const handover = (clubId: string, handoverId: string) => `${club(clubId)}/handovers/${encodeURIComponent(handoverId)}`

export const termRepository = {
  /** Nhiệm kỳ Chuẩn bị đứng đầu, sau đó nhiệm kỳ đang phụ trách rồi các nhiệm kỳ đã đóng, mới nhất trước. */
  list: (clubId: string) => httpClient.get<Term[]>(terms(clubId)),
  /** FR-TERM-01. */
  create: (clubId: string, request: CreateTermRequest) => httpClient.post<Term>(terms(clubId), request),
  update: (clubId: string, termId: string, request: UpdateTermRequest) => httpClient.patch<Term>(`${terms(clubId)}/${encodeURIComponent(termId)}`, request),
  /** FR-TERM-08: cơ cấu, ban chủ nhiệm, trưởng phó ban và Quỹ chung của một nhiệm kỳ đã bắt đầu; mọi thành viên xem được. */
  overview: (clubId: string, termId: string) => httpClient.get<TermOverview>(`${terms(clubId)}/${encodeURIComponent(termId)}/overview`),
  /** FR-TERM-02: chức vụ thường trực hết hạn cùng nhiệm kỳ được dời theo ngày mới. */
  extend: (clubId: string, termId: string, request: ExtendTermRequest) => httpClient.post<Term>(`${terms(clubId)}/${encodeURIComponent(termId)}/extensions`, request),
  /** FR-TERM-03: nhiệm kỳ đang chạy chuyển Đang bàn giao, tạo phiên bàn giao. */
  startHandover: (clubId: string, request: StartHandoverRequest) => httpClient.post<Handover>(`${club(clubId)}/handovers`, request),
  handover: (clubId: string, handoverId: string) => httpClient.get<Handover>(handover(clubId, handoverId)),
  /** FR-TERM-03: thay cả danh sách kết quả bầu. */
  saveAppointments: (clubId: string, handoverId: string, request: SaveAppointmentsRequest) =>
    httpClient.put<Handover>(`${handover(clubId, handoverId)}/appointments`, request),
  /** FR-TERM-04: danh mục bàn giao, theo loại (quỹ, sự kiện, công việc) và trạng thái. */
  items: (clubId: string, handoverId: string, query: HandoverItemQuery) =>
    httpClient.get<Page<HandoverItem>>(`${handover(clubId, handoverId)}/items`, {
      query: { kind: query.kind, status: query.status, page: query.page, size: query.size },
    }),
  /** FR-TERM-05: ban chủ nhiệm mới xác nhận các mục; một mục đã cũ thì không mục nào được ghi (409). */
  confirmItems: (clubId: string, handoverId: string, request: ConfirmItemsRequest) => httpClient.post<Handover>(`${handover(clubId, handoverId)}/confirmations`, request),
  /** FR-TERM-07: ban chủ nhiệm hiện tại xác nhận thay các mục đang chờ khi người cũ không bàn giao; bắt buộc lý do. */
  substituteConfirm: (clubId: string, handoverId: string, request: SubstituteConfirmRequest) =>
    httpClient.post<Handover>(`${handover(clubId, handoverId)}/substitute-confirmations`, request),
  /** FR-TERM-06: nhiệm kỳ cũ Đã đóng, chức vụ cũ hết hiệu lực, nhiệm kỳ mới Đang chạy; chưa đủ điều kiện thì 422 kèm lý do. */
  complete: (clubId: string, handoverId: string, request: CompleteHandoverRequest) => httpClient.post<Handover>(`${handover(clubId, handoverId)}/transitions`, request),
}
