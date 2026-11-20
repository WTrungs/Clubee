import { formatDateTime } from '@/shared/format/formatDate'
import type { PersonRef } from '@/api/commonTypes'
import type { Tone } from '@/shared/ui/tone'
import type { TaskAction, TaskChange, TaskDetail, TaskHistoryEntry, TaskPriority, TaskStatus, TaskSummary, TaskTransitionAction } from '../model/taskTypes'

export const taskStatusDisplay: Record<TaskStatus, { label: string; tone: Tone }> = {
  ASSIGNED: { label: 'Mới giao', tone: 'info' },
  IN_PROGRESS: { label: 'Đang làm', tone: 'progress' },
  PENDING_REVIEW: { label: 'Chờ nghiệm thu', tone: 'warning' },
  DONE: { label: 'Hoàn thành', tone: 'success' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
}

/** Một dòng lịch sử trạng thái: giao việc hoặc chuyển trạng thái. */
export function historyActionText(entry: Pick<TaskHistoryEntry, 'fromStatus' | 'toStatus'>): string {
  if (entry.fromStatus === null) return 'giao việc'
  if (entry.toStatus === 'CANCELLED') return 'hủy việc'
  return `chuyển ${taskStatusDisplay[entry.fromStatus].label} → ${taskStatusDisplay[entry.toStatus].label}`
}

const peopleText = (names: string[]) => (names.length === 0 ? 'không có ai' : names.join(', '))

/** Một lần đổi người, đổi hạn (FR-TASK-05), ví dụ "đổi hạn từ 01/12/2026 21:00 thành 05/12/2026 21:00". */
export function changeText(change: TaskChange): string {
  if (change.field === 'DUE_AT') return `đổi hạn từ ${formatDateTime(change.fromDueAt)} thành ${formatDateTime(change.toDueAt)}`
  const what = { OWNER: 'người chính', ASSIGNER: 'người nghiệm thu', COLLABORATORS: 'người phối hợp' }[change.field]
  return `đổi ${what} từ ${peopleText(change.fromPeople)} thành ${peopleText(change.toPeople)}`
}

export interface TimelineEntry {
  id: string
  at: string
  /** Hệ thống tự ghi (ví dụ mốc quá hạn) thì để null. */
  actor: PersonRef | null
  text: string
  /** Ghi chú nộp, nhận xét, lý do hủy hoặc lý do đổi. */
  note: string | null
}

/** Gộp lịch sử trạng thái, các lần đổi người, đổi hạn và các mốc quá hạn thành một dòng thời gian, mới nhất trước. */
export function taskTimeline(task: Pick<TaskDetail, 'history' | 'changes' | 'overdueHistory'>): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...task.history.map((entry) => ({ id: entry.id, at: entry.at, actor: entry.actor, text: historyActionText(entry), note: entry.note })),
    ...task.changes.map((change) => ({ id: change.id, at: change.at, actor: change.actor, text: changeText(change), note: `Lý do: ${change.reason}` })),
    ...task.overdueHistory.map((mark) => ({ id: `overdue-${mark.dueAt}`, at: mark.flaggedAt, actor: null, text: `ghi nhận quá hạn (hạn ${formatDateTime(mark.dueAt)})`, note: null })),
  ]
  return entries.toSorted((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

/** Câu tóm tắt số lần quá hạn, null khi chưa từng quá hạn (BR-TASK-03). */
export const overdueSummary = (count: number) => (count === 0 ? null : `Từng quá hạn ${count} lần; đổi hạn không xóa các mốc này.`)

export const taskPriorityDisplay: Record<TaskPriority, { label: string; tone: Tone }> = {
  LOW: { label: 'Thấp', tone: 'neutral' },
  MEDIUM: { label: 'Trung bình', tone: 'info' },
  HIGH: { label: 'Cao', tone: 'warning' },
  URGENT: { label: 'Khẩn cấp', tone: 'danger' },
}

export const PRIORITIES: TaskPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']

/** Các cột Kanban theo thứ tự ST-TASK; Đã hủy chỉ hiện khi bật trong bộ lọc. */
export const BOARD_STATUSES: TaskStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'PENDING_REVIEW', 'DONE']
export const ALL_STATUSES: TaskStatus[] = [...BOARD_STATUSES, 'CANCELLED']

export const actionTarget: Record<TaskTransitionAction, TaskStatus> = {
  START: 'IN_PROGRESS',
  SUBMIT: 'PENDING_REVIEW',
  APPROVE: 'DONE',
  REQUEST_CHANGES: 'IN_PROGRESS',
  CANCEL: 'CANCELLED',
}

export const actionLabel: Record<TaskTransitionAction, string> = {
  START: 'Bắt đầu làm',
  SUBMIT: 'Nộp kết quả',
  APPROVE: 'Nghiệm thu đạt',
  REQUEST_CHANGES: 'Yêu cầu làm lại',
  CANCEL: 'Hủy việc',
}

export const actionSuccessMessage: Record<TaskTransitionAction, string> = {
  START: 'Đã chuyển việc sang Đang làm.',
  SUBMIT: 'Đã nộp kết quả, chờ người giao nghiệm thu.',
  APPROVE: 'Đã nghiệm thu, việc chuyển sang Hoàn thành.',
  REQUEST_CHANGES: 'Đã trả việc về Đang làm kèm nhận xét.',
  CANCEL: 'Đã hủy việc.',
}

/** Thao tác cần thêm thông tin trước khi gửi: nộp kết quả, nhận xét bắt buộc, hay chỉ xác nhận. */
export type ActionInput = 'none' | 'submission' | 'reason' | 'confirm'

export const actionInput: Record<TaskTransitionAction, ActionInput> = {
  START: 'none',
  SUBMIT: 'submission',
  APPROVE: 'confirm',
  REQUEST_CHANGES: 'reason',
  CANCEL: 'reason',
}

const isTransition = (action: TaskAction): action is TaskTransitionAction => action in actionTarget

/** Cột thả hợp lệ cho một thẻ, suy từ allowedActions máy chủ trả về; không tự suy quyền. */
export function getDropTargets(task: Pick<TaskSummary, 'status' | 'allowedActions'>): Map<TaskStatus, TaskTransitionAction> {
  const targets = new Map<TaskStatus, TaskTransitionAction>()
  for (const action of task.allowedActions) {
    if (!isTransition(action)) continue
    const target = actionTarget[action]
    if (target !== task.status && !targets.has(target)) targets.set(target, action)
  }
  return targets
}

export function transitionActions(task: Pick<TaskSummary, 'allowedActions'>): TaskTransitionAction[] {
  return task.allowedActions.filter(isTransition)
}

/** Nút ở chân sheet: các bước tiến của việc; hủy, đổi người, đổi hạn nằm trong menu Thao tác khác. */
export function footerActions(task: Pick<TaskSummary, 'allowedActions'>): TaskTransitionAction[] {
  return transitionActions(task).filter((action) => action !== 'CANCEL')
}

export type TaskMenuAction = 'REASSIGN' | 'CHANGE_DUE' | 'CANCEL'

/** Mục của menu Thao tác khác, theo thứ tự hiện. */
export function menuActions(task: Pick<TaskSummary, 'allowedActions'>): TaskMenuAction[] {
  return (['REASSIGN', 'CHANGE_DUE', 'CANCEL'] as const).filter((action) => task.allowedActions.includes(action))
}

/** Nhóm thẻ theo trạng thái; trong cột, việc quá hạn rồi gần hạn lên trước. */
export function groupByStatus<T extends Pick<TaskSummary, 'status' | 'dueAt' | 'overdue'>>(tasks: T[]): Record<TaskStatus, T[]> {
  const groups: Record<TaskStatus, T[]> = { ASSIGNED: [], IN_PROGRESS: [], PENDING_REVIEW: [], DONE: [], CANCELLED: [] }
  for (const task of tasks) groups[task.status].push(task)
  for (const status of ALL_STATUSES) {
    groups[status].sort((a, b) => Number(b.overdue) - Number(a.overdue) || Date.parse(a.dueAt) - Date.parse(b.dueAt))
  }
  return groups
}
