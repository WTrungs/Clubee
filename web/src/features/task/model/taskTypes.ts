import type { FileRef, PersonRef } from '@/api/commonTypes'

export type { FileRef, PersonRef }

/** ST-TASK: Mới giao → Đang làm → Chờ nghiệm thu → Hoàn thành; Chờ nghiệm thu → Đang làm; → Đã hủy. */
export type TaskStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'PENDING_REVIEW' | 'DONE' | 'CANCELLED'

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

/** Chuyển trạng thái của FR-TASK-03, 04 và hủy việc của FR-TASK-05. */
export type TaskTransitionAction = 'START' | 'SUBMIT' | 'APPROVE' | 'REQUEST_CHANGES' | 'CANCEL'

/** Sửa việc mà trạng thái giữ nguyên (FR-TASK-05): đổi người chính, người phối hợp, đổi hạn. */
export type TaskEditAction = 'REASSIGN' | 'CHANGE_DUE'

export type TaskAction = TaskTransitionAction | TaskEditAction

/** Trường được đổi; người nghiệm thu chỉ đổi khi xử lý tồn đọng của người đã rời CLB (FR-MEM-09). */
export type TaskChangeField = 'OWNER' | 'COLLABORATORS' | 'ASSIGNER' | 'DUE_AT'

interface TaskChangeBase {
  id: string
  at: string
  actor: PersonRef
  reason: string
}

/** Một lần đổi người hoặc đổi hạn; họ tên chụp lúc đổi (BR-DATA-02). */
export type TaskChange = TaskChangeBase &
  ({ field: 'DUE_AT'; fromDueAt: string; toDueAt: string } | { field: Exclude<TaskChangeField, 'DUE_AT'>; fromPeople: string[]; toPeople: string[] })

export type TaskScopeType = 'DEPARTMENT' | 'SUBCOMMITTEE'

export type DueFilter = 'OVERDUE' | 'THIS_WEEK' | 'LATER'

export interface TaskScope {
  type: TaskScopeType
  id: string
  name: string
  eventId: string | null
  eventName: string | null
}

export interface TaskSubmission {
  note: string
  attachments: FileRef[]
  submittedAt: string
}

export interface TaskHistoryEntry {
  id: string
  at: string
  actor: PersonRef
  fromStatus: TaskStatus | null
  toStatus: TaskStatus
  note: string | null
}

export interface TaskSummary {
  id: string
  clubId: string
  clubName: string
  title: string
  scope: TaskScope
  assigner: PersonRef
  owner: PersonRef
  collaborators: PersonRef[]
  dueAt: string
  priority: TaskPriority
  status: TaskStatus
  /** BR-TASK-03: cờ quá hạn do máy chủ tính, không phải trạng thái. */
  overdue: boolean
  /** Còn trong khoảng nhắc trước hạn mà CLB cấu hình (FR-TASK-06). */
  dueSoon: boolean
  allowedActions: TaskAction[]
  version: number
}

export interface TaskDetail extends TaskSummary {
  description: string
  submission: TaskSubmission | null
  reviewComment: string | null
  /** Câu máy chủ giải thích vì sao việc chỉ xem được (sự kiện Đã đóng, Đã hủy); null khi không bị khóa. */
  readOnlyReason: string | null
  /** Lý do hủy khi việc Đã hủy. */
  cancelReason: string | null
  history: TaskHistoryEntry[]
  /** Các lần đổi người, đổi hạn, mới nhất trước (FR-TASK-05). */
  changes: TaskChange[]
  /** Các lần hệ thống ghi nhận quá hạn, mỗi hạn một lần, mới nhất trước; đổi hạn không xóa (BR-TASK-03). */
  overdueHistory: OverdueMark[]
  createdAt: string
}

export interface OverdueMark {
  dueAt: string
  flaggedAt: string
}

/** Gửi trường nào thì đổi trường đó; lý do luôn bắt buộc (FR-TASK-05). */
export interface UpdateTaskRequest {
  ownerId?: string
  collaboratorIds?: string[]
  dueAt?: string
  reason: string
  version: number
}

export interface TaskTransitionRequest {
  action: TaskTransitionAction
  version: number
  /** Ghi chú khi nộp kết quả. */
  note?: string
  /** Nhận xét bắt buộc khi yêu cầu làm lại (FR-TASK-04), lý do bắt buộc khi hủy (FR-TASK-05). */
  reason?: string
  attachmentIds?: string[]
}

export interface CreateTaskRequest {
  title: string
  description: string
  scopeType: TaskScopeType
  scopeId: string
  ownerId: string
  collaboratorIds: string[]
  dueAt: string
  priority: TaskPriority
}

export interface AssignableMember extends PersonRef {
  departmentName: string | null
}

/** Phạm vi người dùng được giao việc (BR-TASK-01) kèm người nhận hợp lệ. */
export interface AssignableScope {
  type: TaskScopeType
  id: string
  name: string
  eventName: string | null
  members: AssignableMember[]
}

export interface TaskQuery {
  status?: TaskStatus[]
  priority?: TaskPriority[]
  due?: DueFilter
  clubId?: string
  eventId?: string
  q?: string
  page?: number
  size?: number
  sort?: string
}

export interface TaskFacets {
  clubs: Array<{ id: string; name: string }>
  events: Array<{ id: string; name: string; clubName: string }>
}

/** FR-TASK-08: phạm vi xem khối lượng việc: toàn CLB (ban chủ nhiệm), một ban, một sự kiện. */
export type WorkloadScopeType = 'CLUB' | 'DEPARTMENT' | 'EVENT'

export interface WorkloadScope {
  type: WorkloadScopeType
  /** Bằng `null` khi là toàn CLB. */
  id: string | null
  name: string
}

/** Một người trong phạm vi: việc làm chính còn mở (Mới giao, Đang làm, Chờ nghiệm thu), trong đó quá hạn, và việc phối hợp còn mở. */
export interface WorkloadRow {
  person: PersonRef
  /** Ban chính, vai trong BTC, hoặc ghi chú người ngoài phạm vi còn giữ việc. */
  detail: string | null
  onLeave: boolean
  open: number
  overdue: number
  collaborating: number
}

export interface Workload {
  scope: WorkloadScope
  rows: WorkloadRow[]
}
