import type { PersonRef } from '@/api/commonTypes'
import type { PositionRole } from '@/features/org/model/orgTypes'
import type { TaskStatus } from '@/features/task/model/taskTypes'

/** Việc đang làm, việc chờ người giao nghiệm thu, hoặc chức vụ cần người thay (FR-MEM-08, 09). */
export type BacklogKind = 'TASK' | 'TASK_REVIEW' | 'POSITION'

/** Chưa xử lý, hoặc đã xử lý (có người xử lý, hoặc đối tượng đã xong nên không cần nữa). */
export type BacklogStatus = 'OPEN' | 'RESOLVED'

/** Giao lại việc hoặc người nghiệm thu; chỉ định người giữ chức; hoặc ghi nhận không cần thay (chỉ với chức vụ). */
export type BacklogAction = 'REASSIGN' | 'APPOINT' | 'DISMISS'

export interface BacklogTaskInfo {
  /** Ví dụ "Ban Hậu cần" hoặc "Tiểu ban Hậu cần". */
  scopeName: string
  eventName: string | null
  status: TaskStatus
  dueAt: string
  overdue: boolean
  /** Người đang làm (với việc chờ nghiệm thu) hoặc người giao (với việc đang làm). */
  counterpart: PersonRef
}

export interface BacklogPositionInfo {
  role: PositionRole
  scopeName: string
  eventName: string | null
}

export interface BacklogResolution {
  action: BacklogAction
  /** Người nhận việc hoặc nhận chức; null khi không cần thay. */
  person: PersonRef | null
  reason: string | null
  by: PersonRef
  at: string
}

export interface BacklogItem {
  id: string
  kind: BacklogKind
  formerMember: PersonRef
  status: BacklogStatus
  title: string
  task: BacklogTaskInfo | null
  position: BacklogPositionInfo | null
  resolution: BacklogResolution | null
  /** Vì sao mục tự thành đã xử lý khi không ai xử lý (việc đã xong, sự kiện đã đóng, đã có người giữ vai trò…). */
  resolvedNote: string | null
  /** Vì sao chưa chỉ định được người giữ chức thường trực lúc này (đang bàn giao, nhiệm kỳ quá hạn, chức Chủ nhiệm, Phó chủ nhiệm). */
  appointBlockedReason: string | null
  createdAt: string
  allowedActions: BacklogAction[]
  version: number
}

export interface BacklogQuery {
  status?: BacklogStatus
  kind?: BacklogKind
  formerMemberId?: string
  page?: number
  size?: number
}

export interface BacklogCandidate extends PersonRef {
  departmentName: string | null
}

/** REASSIGN, APPOINT cần `userId`; DISMISS cần `reason`. */
export interface ResolveBacklogRequest {
  action: BacklogAction
  userId?: string
  reason?: string
  version: number
}
