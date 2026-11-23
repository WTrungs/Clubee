import type { PersonRef } from '@/api/commonTypes'
import type { TermSummary } from '@/features/club/model/clubTypes'
import type { EventStatus } from '@/features/event/model/eventTypes'
import type { AdvanceStatus } from '@/features/finance/model/advanceTypes'
import type { FundKind } from '@/features/finance/model/financeTypes'
import type { StandingRole } from '@/features/org/model/orgTypes'
import type { TaskStatus } from '@/features/task/model/taskTypes'

export type HandoverStatus = 'OPEN' | 'COMPLETED'

/** `CONFIRM` cho người được bầu ban chủ nhiệm mới; `COMPLETE`, `SUBSTITUTE_CONFIRM` (FR-TERM-07) cho ban chủ nhiệm hiện tại. */
export type HandoverAction = 'EDIT_APPOINTMENTS' | 'CONFIRM' | 'SUBSTITUTE_CONFIRM' | 'COMPLETE'

/** Những gì sẽ đổi khi hoàn tất, để ban chủ nhiệm cũ xem lại trước khi bấm (FR-TERM-06). */
export interface HandoverCompletionPreview {
  /** Chức vụ thường trực còn mở sẽ kết thúc, kể cả chức đang giữ tới khi bàn giao xong. */
  endingPositionCount: number
  grantedPositionCount: number
  closingDepartments: string[]
  newDepartments: string[]
  renamedDepartments: Array<{ from: string; to: string }>
  leadReplacements: Array<{ eventName: string; from: PersonRef | null; to: PersonRef }>
  fromTermEndOn: string
  toTermStartOn: string
}

/** FR-TERM-06: gửi kèm version của phiên lúc xem; có lượt xác nhận hay sửa kết quả bầu sau đó thì 409. */
export interface CompleteHandoverRequest {
  action: 'COMPLETE'
  version: number
}

/** FR-TERM-04: quỹ, tạm ứng chưa quyết toán, sự kiện, việc của ban và tài liệu của nhiệm kỳ cũ; tài sản thêm khi có module tương ứng. */
export type HandoverItemKind = 'FUND' | 'ADVANCE' | 'EVENT' | 'TASK' | 'DOCUMENTS'

/** Chờ xác nhận, Đã xác nhận, hoặc Không cần bàn giao nữa (đối tượng đã xong, đã đóng, đã quyết toán). */
export type HandoverItemStatus = 'PENDING' | 'CONFIRMED' | 'RESOLVED'

export type EventLeadAction = 'KEEP' | 'REPLACE'

export interface HandoverItemCounts {
  total: number
  pending: number
  confirmed: number
  resolved: number
}

export interface HandoverCounts extends HandoverItemCounts {
  byKind: Record<HandoverItemKind, HandoverItemCounts>
}

/** Tiến độ bàn giao ở trang Nhiệm kỳ, mọi thành viên xem được (chỉ số đếm). */
export interface HandoverProgress {
  pending: number
  confirmed: number
}

export interface HandoverFundInfo {
  fundKind: FundKind
  balance: number
  /** Khoản chờ duyệt hoặc đã duyệt chưa ghi sổ. */
  pendingCount: number
  eventName: string | null
}

export interface HandoverTaskInfo {
  departmentName: string
  owner: PersonRef
  assigner: PersonRef
  status: TaskStatus
  dueAt: string
  overdue: boolean
}

export interface HandoverEventInfo {
  status: EventStatus
  startAt: string
  endAt: string
  /** Trưởng BTC đang hiệu lực; null khi sự kiện chưa được duyệt hoặc người giữ không còn đủ điều kiện. */
  lead: PersonRef | null
  /** Việc chưa xong của các tiểu ban, đi theo sự kiện. */
  openTaskCount: number
  /** Sự kiện đã duyệt, chưa đóng: ban chủ nhiệm mới phải chọn giữ hoặc thay Trưởng BTC khi xác nhận. */
  needsLeadDecision: boolean
}

export interface HandoverAdvanceInfo {
  fundName: string
  requester: PersonRef
  amount: number
  status: AdvanceStatus
  /** Số tiền còn phải quyết toán; tạm ứng đã duyệt mà chưa ứng thì bằng cả khoản. */
  outstanding: number
  settleBy: string
  overdue: boolean
}

/** Một mục gộp mọi tài liệu gắn nhiệm kỳ cũ; số lượng đổi thì phải xác nhận lại. */
export interface HandoverDocumentsInfo {
  termName: string
  count: number
}

/** FR-TERM-07: mục do ban chủ nhiệm hiện tại xác nhận thay người cũ không bàn giao. */
export interface HandoverSubstitute {
  by: PersonRef
  reason: string
}

/** Quyết định về Trưởng BTC; chỉ áp dụng khi bàn giao hoàn tất (BR-TERM-02). */
export interface EventLeadDecision {
  action: EventLeadAction
  person: PersonRef
}

/** Mục bàn giao (FR-TERM-04) kèm sẵn dữ liệu cần xem, vì người được bầu chưa có quyền mở quỹ, sự kiện, công việc. */
export interface HandoverItem {
  id: string
  kind: HandoverItemKind
  status: HandoverItemStatus
  title: string
  fund: HandoverFundInfo | null
  advance: HandoverAdvanceInfo | null
  task: HandoverTaskInfo | null
  event: HandoverEventInfo | null
  documents: HandoverDocumentsInfo | null
  eventLead: EventLeadDecision | null
  /** Vì sao mục quay về Chờ xác nhận hoặc không cần bàn giao nữa. */
  note: string | null
  confirmedBy: PersonRef | null
  confirmedAt: string | null
  substitute: HandoverSubstitute | null
  allowedActions: Array<'CONFIRM' | 'SUBSTITUTE_CONFIRM'>
  version: number
}

export interface HandoverItemQuery {
  kind?: HandoverItemKind
  status?: HandoverItemStatus
  page?: number
  size?: number
}

export interface EventLeadDecisionRequest {
  action: EventLeadAction
  /** Bắt buộc khi thay; là người sẽ làm Trưởng BTC khi bàn giao hoàn tất. */
  userId?: string
}

export interface ItemConfirmationRequest {
  itemId: string
  version: number
  eventLead?: EventLeadDecisionRequest
}

/** FR-TERM-05: xác nhận nhiều mục một lần; một mục đã cũ thì không mục nào được ghi. */
export interface ConfirmItemsRequest {
  items: ItemConfirmationRequest[]
}

/** FR-TERM-07: xác nhận thay các mục đang chờ, bắt buộc lý do; một mục đã cũ thì không mục nào được ghi. */
export interface SubstituteConfirmRequest {
  items: Array<{ itemId: string; version: number }>
  reason: string
}

export interface DepartmentOption {
  id: string
  /** Tên ban theo kế hoạch của nhiệm kỳ mới. */
  name: string
}

/** Một dòng kết quả bầu (FR-TERM-03); chỉ thành chức vụ khi bàn giao hoàn tất (BR-TERM-02). */
export interface Appointment {
  id: string
  role: StandingRole
  department: DepartmentOption | null
  person: PersonRef
  /** Tính lại mỗi lần đọc: người được bầu có thể đã đổi trạng thái hoặc đổi ban. */
  eligible: boolean
  ineligibleReason: string | null
}

export interface Handover {
  id: string
  fromTerm: TermSummary
  toTerm: TermSummary
  status: HandoverStatus
  startedAt: string
  startedBy: PersonRef
  completedAt: string | null
  completedBy: PersonRef | null
  appointments: Appointment[]
  /** Ban giữ lại trong kế hoạch của nhiệm kỳ mới; chỉ các ban này mới bầu trưởng, phó ban trước được. */
  departmentOptions: DepartmentOption[]
  /** Số mục bàn giao theo trạng thái, tổng và theo loại. */
  counts: HandoverCounts
  /** Lý do chưa hoàn tất được; rỗng là đủ điều kiện. */
  blockers: string[]
  /** Chỉ có khi phiên còn mở. */
  completionPreview: HandoverCompletionPreview | null
  allowedActions: HandoverAction[]
  version: number
}

/** FR-TERM-03: bắt đầu bàn giao từ nhiệm kỳ đang chạy sang nhiệm kỳ Chuẩn bị. */
export interface StartHandoverRequest {
  fromTermId: string
  toTermId: string
}

export interface AppointmentRequest {
  role: StandingRole
  departmentId: string | null
  userId: string
}

/** Gửi cả danh sách kết quả bầu; danh sách cũ bị thay thế. */
export interface SaveAppointmentsRequest {
  appointments: AppointmentRequest[]
  version: number
}
