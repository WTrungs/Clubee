import type { PersonRef } from '@/api/commonTypes'
import type { PositionRole } from './orgTypes'

/** Quyền thao tác mà ma trận quyền bật, tắt theo từng chức vụ (SRS 3.3). Quyền xem thông tin theo SRS 3.5 không nằm ở đây. */
export const PERMISSION_KEYS = [
  'CONFIGURE_CLUB',
  'MANAGE_TERMS',
  'MANAGE_DEPARTMENTS',
  'ASSIGN_POSITIONS',
  'EDIT_PERMISSIONS',
  'MANAGE_MEMBERS',
  'CREATE_EVENT',
  'APPROVE_EVENT',
  'RUN_EVENT',
  'MANAGE_EVENT_STAFF',
  'ASSIGN_TASK',
  'MANAGE_SESSIONS',
  'SEND_ANNOUNCEMENT',
  'PROPOSE_EXPENSE',
  'APPROVE_EXPENSE',
  'RECORD_LEDGER',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

/** Trạng thái ô với người xem: khóa cứng (BR-ACL-04, 05), hàng chức vụ mình giữ (BR-ACL-03), vô nghĩa (BR-ACL-02), sửa được. */
export type PermissionCellState = 'EDITABLE' | 'LOCKED' | 'OWN_ROLE' | 'NOT_APPLICABLE'

export interface PermissionMatrixCell {
  role: PositionRole
  permission: PermissionKey
  enabled: boolean
  defaultEnabled: boolean
  state: PermissionCellState
  /** Lý do ô không sửa được, để hiện bằng chữ cạnh biểu tượng khóa. */
  lockReason: string | null
}

export interface PermissionMatrix {
  roles: PositionRole[]
  permissions: PermissionKey[]
  cells: PermissionMatrixCell[]
  /** Số ô đang khác mặc định. */
  changedFromDefault: number
  updatedAt: string | null
  updatedBy: PersonRef | null
  allowedActions: Array<'EDIT' | 'RESET'>
  version: number
}

export interface PermissionChange {
  role: PositionRole
  permission: PermissionKey
  enabled: boolean
}

export interface UpdatePermissionMatrixRequest {
  changes: PermissionChange[]
  version: number
}

/** Một lần đổi một ô, lấy từ nhật ký thao tác (BR-DATA-03). */
export interface PermissionMatrixChangeLog {
  id: string
  at: string
  actor: PersonRef
  role: PositionRole
  permission: PermissionKey
  before: boolean
  after: boolean
  /** Đổi do bấm khôi phục mặc định. */
  reset: boolean
}
