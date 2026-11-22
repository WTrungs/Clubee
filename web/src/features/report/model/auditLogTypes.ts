import type { PersonRef } from '@/api/commonTypes'
import type { Page } from '@/api/pagination'

/** Loại đối tượng của nhật ký thao tác (BR-DATA-03). */
export type AuditObjectType =
  | 'ACCOUNT'
  | 'CLUB'
  | 'POSITION'
  | 'PERMISSION'
  | 'TRANSFER_REQUEST'
  | 'MEMBERSHIP'
  | 'TRANSACTION'
  | 'ATTENDANCE'
  | 'TERM'
  | 'HANDOVER_ITEM'

/** Một dòng nhật ký (FR-RPT-06): chỉ đọc; tên người làm và mô tả đối tượng chụp lúc ghi (BR-DATA-02). */
export interface AuditLogEntry {
  id: string
  at: string
  actor: PersonRef
  action: string
  objectType: AuditObjectType
  objectId: string
  objectLabel: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  reason: string | null
  /** Họ tên lúc ghi của các mã người dùng nằm trong `before`, `after` (ví dụ Trưởng BTC giữ lại, Chủ nhiệm mới; BR-DATA-02). */
  names: Record<string, string>
}

export interface AuditLogQuery {
  actorId?: string
  objectType?: AuditObjectType
  objectId?: string
  /** yyyy-mm-dd, theo giờ Việt Nam, tính cả hai đầu. */
  from?: string
  to?: string
  page?: number
  size?: number
}

export type AuditLogPage = Page<AuditLogEntry>
