import type { PersonRef } from '@/api/commonTypes'

/** Buổi toàn CLB do ban chủ nhiệm tạo; buổi của ban do ban chủ nhiệm hoặc Trưởng ban, Phó ban của ban đó tạo (FR-ATT-01). */
export type SessionScopeType = 'CLUB' | 'DEPARTMENT'

export interface SessionScope {
  type: SessionScopeType
  departmentId: string | null
  departmentName: string | null
}

/** Phạm vi người gọi được tạo buổi. */
export interface SessionScopeOption {
  type: SessionScopeType
  departmentId: string | null
  name: string
}

export type SessionWhen = 'UPCOMING' | 'PAST'

/** Có khi người gọi là người phụ trách buổi: người tạo, ban chủ nhiệm, Trưởng ban, Phó ban của ban đó. */
export type SessionAction = 'VIEW_ATTENDANCE'

export interface SessionSummary {
  id: string
  clubId: string
  title: string
  scope: SessionScope
  startAt: string
  endAt: string
  location: string
  /** Không giới hạn chỗ khi giá trị là `null`. */
  capacity: number | null
  registrationDeadline: string | null
  /** Đã chốt điểm danh (FR-ATT-08): danh sách chỉ xem được. */
  attendanceClosed: boolean
}

export interface SessionDetail extends SessionSummary {
  description: string
  creator: PersonRef
  createdAt: string
  allowedActions: SessionAction[]
  version: number
}

export interface CreateSessionRequest {
  scopeType: SessionScopeType
  departmentId: string | null
  title: string
  description: string
  startAt: string
  endAt: string
  location: string
  capacity: number | null
  registrationDeadline: string | null
}

export interface SessionQuery {
  when: SessionWhen
  /** Bỏ trống là mọi buổi; `CLUB` là buổi toàn CLB; `DEPARTMENT` cần `departmentId`. */
  scopeType?: SessionScopeType
  departmentId?: string
  q?: string
  page?: number
  size?: number
}
