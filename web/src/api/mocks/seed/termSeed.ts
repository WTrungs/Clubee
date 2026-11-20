import type { EventLeadAction, HandoverItemKind, HandoverItemStatus } from '@/features/term/model/handoverTypes'
import type { StandingRole } from '@/features/org/model/orgTypes'

/** Kết quả bầu (FR-TERM-03): chỉ thành chức vụ khi bàn giao hoàn tất (BR-TERM-02). Chức vụ cấp ban có `departmentId`. */
export interface DbAppointment {
  id: string
  role: StandingRole
  departmentId: string | null
  userId: string
}

/** Phiên bàn giao (SRS 4.1): từ nhiệm kỳ đang phụ trách sang nhiệm kỳ Chuẩn bị. */
export interface DbHandover {
  id: string
  clubId: string
  fromTermId: string
  toTermId: string
  status: 'OPEN' | 'COMPLETED'
  startedAt: string
  startedBy: string
  completedAt: string | null
  completedBy: string | null
  appointments: DbAppointment[]
  version: number
}

/** Phần dữ liệu mà người xác nhận đã thấy; đổi sau khi xác nhận thì mục phải xác nhận lại. */
export type DbHandoverSnapshot =
  | { kind: 'FUND'; balance: number; pendingIds: string[] }
  | { kind: 'TASK'; ownerId: string }
  | { kind: 'EVENT'; leadId: string | null; needsLeadDecision: boolean }

/** Mục bàn giao (SRS 4.1, FR-TERM-04): một quỹ, một sự kiện chưa đóng hoặc một việc của ban chưa xong. */
export interface DbHandoverItem {
  id: string
  handoverId: string
  kind: HandoverItemKind
  refId: string
  status: HandoverItemStatus
  snapshot: DbHandoverSnapshot
  note: string | null
  confirmedBy: string | null
  confirmedAt: string | null
  /** Quyết định về Trưởng BTC; giữ thì `userId` là Trưởng BTC lúc xác nhận. */
  eventLead: { action: EventLeadAction; userId: string } | null
  version: number
}
