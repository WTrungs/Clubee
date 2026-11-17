import type { PersonRef } from '@/api/commonTypes'

export type PositionRole =
  | 'PRESIDENT'
  | 'VICE_PRESIDENT'
  | 'TREASURER'
  | 'DEPARTMENT_HEAD'
  | 'DEPARTMENT_VICE_HEAD'
  | 'EVENT_LEAD'
  | 'SUBCOMMITTEE_LEAD'

/** Chức vụ thường trực theo nhiệm kỳ, gán ở màn Cơ cấu; chức vụ sự kiện gán ở module Sự kiện. */
export type StandingRole = Exclude<PositionRole, 'EVENT_LEAD' | 'SUBCOMMITTEE_LEAD'>

export type DepartmentStatus = 'ACTIVE' | 'CLOSED'

export type PositionScopeType = 'CLUB' | 'DEPARTMENT' | 'EVENT' | 'SUBCOMMITTEE'

export interface PositionScope {
  type: PositionScopeType
  id: string
  /** Ban ở nhiệm kỳ đã đóng mang tên lúc nhiệm kỳ đóng (BR-DATA-02). */
  name: string
}

/** Trạng thái: `UPCOMING` là đã gán nhưng chưa tới ngày bắt đầu (FR-ORG-02), `ENDED` là đã qua ngày hiệu lực cuối. */
export type PositionStatus = 'UPCOMING' | 'ACTIVE' | 'ENDED'

export interface Position {
  id: string
  role: PositionRole
  scope: PositionScope
  holder: PersonRef
  startOn: string
  /** Ngày hiệu lực cuối; `null` với chức vụ sự kiện còn chạy. */
  endOn: string | null
  status: PositionStatus
  /** Đã qua ngày cuối nhiệm kỳ nhưng còn hiệu lực tới khi bàn giao xong (BR-TERM-02). */
  untilHandover: boolean
  /** Ngày thao tác thu hồi (kể cả do rời CLB, bàn giao), có thể trước ngày hiệu lực cuối; null là chưa từng bị thu hồi. */
  revokedOn: string | null
  /** Lý do thu hồi, chỉ ban chủ nhiệm nhận (SRS 3.5). */
  revokeReason: string | null
  assignedBy: PersonRef | null
  allowedActions: Array<'REVOKE'>
  version: number
}

export interface Department {
  id: string
  name: string
  description: string
  status: DepartmentStatus
  closedOn: string | null
  closeReason: string | null
  /** Trưởng ban, phó ban đang hoặc sắp có hiệu lực. */
  leads: Position[]
  memberCount: number
  /** Việc của ban chưa Hoàn thành hoặc Đã hủy; quá hạn (BR-TASK-03) và sắp đến hạn (theo số ngày nhắc của CLB, FR-TASK-06) tính trong số đó. */
  openTaskCount: number
  overdueTaskCount: number
  dueSoonTaskCount: number
  /** Có `TRANSFER_MEMBERS` khi ban đang hoạt động còn thành viên và người xem quản lý được thành viên (FR-MEM-10). */
  allowedActions: Array<'EDIT' | 'CLOSE' | 'ASSIGN_POSITION' | 'TRANSFER_MEMBERS'>
  version: number
}

export interface DepartmentRequest {
  name: string
  description: string
}

export interface UpdateDepartmentRequest extends DepartmentRequest {
  version: number
}

export interface CloseDepartmentRequest {
  action: 'CLOSE'
  reason: string
  version: number
}

export interface CreatePositionRequest {
  userId: string
  role: StandingRole
  scopeId: string
  startOn: string
  endOn: string
}

export interface RevokePositionRequest {
  reason: string
  /** Ngày người mới nhận bàn giao; chức vụ cũ hết hiệu lực từ ngày này. */
  handoverOn: string
  version: number
}

export interface PositionCandidate extends PersonRef {
  departmentName: string | null
}

/** FR-ORG-06: thiếu nhiệm kỳ là chức vụ đang hoặc sắp hiệu lực, nhiệm kỳ đã đóng là chức vụ thường trực của nhiệm kỳ đó. */
export interface PositionQuery {
  termId?: string
  scopeType?: PositionScopeType
  scopeId?: string
  userId?: string
  q?: string
  page?: number
  size?: number
}
