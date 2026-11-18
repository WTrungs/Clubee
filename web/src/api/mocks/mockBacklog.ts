import type { BacklogAction, BacklogCandidate, BacklogItem, BacklogKind, BacklogStatus } from '@/features/member/model/backlogTypes'
import { matchesKeyword } from '@/shared/lib/searchText'
import { db, type DbBacklogItem, type DbPosition } from './db'
import { can } from './mockAccess'
import { eligibleMembers, personRef } from './mockMembers'
import { currentTermOf, DEPARTMENT_ROLES, isPositionOpen, isPresidency, positionHolderOf, positionTitleOf, PRESIDENCY_ROLES, STANDING_ROLES } from './mockPermissions'
import { isTaskOverdue, lockedEventStatusOf, managesScope, resolveScope, subcommitteeMembers } from './mockScopes'
import { leadsOtherSubcommittee } from './mockStaffEvents'
import { canAssignStanding, isTermOverdue, openHandoverOf } from './mockTerms'
import type { DbEvent } from './seed/eventSeed'

const KIND_ORDER: Record<BacklogKind, number> = { POSITION: 0, TASK: 1, TASK_REVIEW: 2 }

const taskOf = (item: DbBacklogItem) => db.tasks.find((task) => task.id === item.refId)
const positionOf = (item: DbBacklogItem) => db.positions.find((position) => position.id === item.refId)
const nameOf = (userId: string) => personRef(userId).fullName

/** Trưởng BTC gắn với sự kiện; trưởng tiểu ban gắn với tiểu ban của sự kiện. */
function eventOfPosition(position: DbPosition): DbEvent | undefined {
  const eventId = position.role === 'EVENT_LEAD' ? position.scopeId : db.subcommittees.find((subcommittee) => subcommittee.id === position.scopeId)?.eventId
  return db.events.find((event) => event.id === eventId)
}

/** Vì sao mục tự thành đã xử lý dù chưa ai xử lý; null khi vẫn cần ban chủ nhiệm xử lý (FR-MEM-09). */
function autoResolvedNote(item: DbBacklogItem): string | null {
  if (item.kind !== 'POSITION') {
    const task = taskOf(item)
    if (!task || task.status === 'CANCELLED') return 'Việc đã hủy.'
    if (task.status === 'DONE') return 'Việc đã hoàn thành.'
    // Việc của tiểu ban thuộc sự kiện Đã đóng, Đã hủy chỉ còn để tra cứu (FR-EVT-16), không giao lại được.
    const eventStatus = lockedEventStatusOf(task)
    if (eventStatus === 'CLOSED') return 'Sự kiện đã đóng nên việc chỉ còn để tra cứu.'
    if (eventStatus === 'CANCELLED') return 'Sự kiện đã hủy nên việc chỉ còn để tra cứu.'
    if (item.kind === 'TASK' && task.ownerId !== item.formerMemberId) return `Việc đã được giao cho ${nameOf(task.ownerId)}.`
    if (item.kind === 'TASK_REVIEW' && task.assignerId !== item.formerMemberId) return `${nameOf(task.assignerId)} đã nhận nghiệm thu việc này.`
    return null
  }
  const position = positionOf(item)
  if (!position) return 'Không còn chức vụ này.'
  if (!STANDING_ROLES.includes(position.role)) {
    const event = eventOfPosition(position)
    if (!event || event.status === 'CLOSED') return 'Sự kiện đã đóng.'
    if (event.status === 'CANCELLED') return 'Sự kiện đã hủy.'
    const holder = positionHolderOf(position.role, position.scopeId)
    return holder ? `${nameOf(holder)} đã giữ vai trò này.` : null
  }
  if (DEPARTMENT_ROLES.includes(position.role) && db.departments.find((department) => department.id === position.scopeId)?.status === 'CLOSED') return 'Ban đã đóng.'
  // Chức vụ bắt đầu trước nhiệm kỳ đang phụ trách thì nhiệm kỳ của nó đã đóng.
  const current = currentTermOf(position.clubId)
  if (current && position.startOn < current.startOn) return 'Nhiệm kỳ của chức vụ này đã kết thúc.'
  return null
}

/** Trạng thái suy ra mỗi lần đọc: đã có người xử lý, hoặc đối tượng không còn cần thay (FR-MEM-09). */
export function backlogState(item: DbBacklogItem): { status: BacklogStatus; note: string | null } {
  if (item.resolution) return { status: 'RESOLVED', note: null }
  const note = autoResolvedNote(item)
  return note ? { status: 'RESOLVED', note } : { status: 'OPEN', note: null }
}

export interface AppointBlock {
  status: 403 | 422
  code: 'HANDOVER_IN_PROGRESS' | 'TERM_OVERDUE' | 'NO_RUNNING_TERM' | 'FORBIDDEN'
  message: string
}

/** Vì sao chưa chỉ định được người giữ chức thường trực lúc này (quyết định 11/11, 14/11 và 05/11); null là chỉ định được. */
export function appointBlock(item: DbBacklogItem, viewerId: string): AppointBlock | null {
  const position = item.kind === 'POSITION' ? positionOf(item) : undefined
  if (!position || !STANDING_ROLES.includes(position.role)) return null
  // Quyền trước trạng thái, cùng thứ tự với gán chức vụ ở Cơ cấu.
  if (!can(viewerId, item.clubId, 'ASSIGN_POSITIONS')) {
    return { status: 403, code: 'FORBIDDEN', message: 'Chức vụ của bạn không được gán chức vụ thường trực theo bảng phân quyền của CLB.' }
  }
  if (openHandoverOf(item.clubId)) {
    return { status: 422, code: 'HANDOVER_IN_PROGRESS', message: 'CLB đang bàn giao nhiệm kỳ nên chưa chỉ định chức vụ thường trực; người mới ghi ở kết quả bầu.' }
  }
  if (isTermOverdue(item.clubId)) {
    return { status: 422, code: 'TERM_OVERDUE', message: 'Nhiệm kỳ đã quá ngày kết thúc nên chưa chỉ định chức vụ thường trực; hãy bàn giao sang nhiệm kỳ mới.' }
  }
  if (!canAssignStanding(item.clubId)) return { status: 422, code: 'NO_RUNNING_TERM', message: 'CLB chưa có nhiệm kỳ đang chạy.' }
  if (PRESIDENCY_ROLES.includes(position.role) && !isPresidency(viewerId, item.clubId)) {
    return { status: 403, code: 'FORBIDDEN', message: 'Chỉ Chủ nhiệm, Phó chủ nhiệm chỉ định được Chủ nhiệm, Phó chủ nhiệm.' }
  }
  return null
}

export function backlogActions(item: DbBacklogItem, viewerId: string): BacklogAction[] {
  if (backlogState(item).status === 'RESOLVED') return []
  if (item.kind !== 'POSITION') return ['REASSIGN']
  return [...(appointBlock(item, viewerId) === null ? (['APPOINT'] as const) : []), 'DISMISS']
}

/** Ứng viên theo loại mục: người nhận việc trong phạm vi, người quản lý phạm vi, hoặc người đủ điều kiện giữ chức (BR-ORG-01, BR-ORG-04, BR-MEM-05). */
export function backlogCandidates(item: DbBacklogItem, keyword: string | null): BacklogCandidate[] {
  const clubId = item.clubId
  const candidates = (): BacklogCandidate[] => {
    if (item.kind !== 'POSITION') {
      const task = taskOf(item)
      if (!task) return []
      if (item.kind === 'TASK') return task.scopeType === 'DEPARTMENT' ? eligibleMembers(clubId, { departmentId: task.scopeId }) : subcommitteeMembers(task.scopeId, clubId)
      return eligibleMembers(clubId).filter((member) => managesScope(member.id, clubId, task.scopeType, task.scopeId))
    }
    const position = positionOf(item)
    if (!position) return []
    if (STANDING_ROLES.includes(position.role)) {
      const holders = new Set(
        db.positions.filter((candidate) => candidate.role === position.role && candidate.scopeId === position.scopeId && isPositionOpen(candidate)).map((candidate) => candidate.userId),
      )
      const departmentId = DEPARTMENT_ROLES.includes(position.role) ? position.scopeId : undefined
      return eligibleMembers(clubId, { statuses: ['ACTIVE'], departmentId }).filter((member) => !holders.has(member.id))
    }
    if (position.role === 'EVENT_LEAD') return eligibleMembers(clubId)
    const eventId = eventOfPosition(position)?.id ?? ''
    return eligibleMembers(clubId).filter((member) => !leadsOtherSubcommittee(eventId, member.id, position.scopeId))
  }
  return candidates().filter((candidate) => candidate.id !== item.formerMemberId && matchesKeyword(candidate.fullName, keyword))
}

function positionInfo(position: DbPosition) {
  if (STANDING_ROLES.includes(position.role)) {
    const department = db.departments.find((candidate) => candidate.id === position.scopeId)
    return { title: positionTitleOf(position), scopeName: department ? `Ban ${department.name}` : (db.clubs.find((club) => club.id === position.clubId)?.name ?? ''), eventName: null }
  }
  const event = eventOfPosition(position)
  if (position.role === 'EVENT_LEAD') return { title: 'Trưởng BTC', scopeName: event?.name ?? '', eventName: event?.name ?? null }
  const subcommittee = db.subcommittees.find((candidate) => candidate.id === position.scopeId)
  return { title: `Trưởng tiểu ban ${subcommittee?.name ?? ''}`.trim(), scopeName: `Tiểu ban ${subcommittee?.name ?? ''}`.trim(), eventName: event?.name ?? null }
}

export function toBacklogItem(item: DbBacklogItem, viewerId: string): BacklogItem {
  const state = backlogState(item)
  const task = item.kind === 'POSITION' ? undefined : taskOf(item)
  const position = item.kind === 'POSITION' ? positionOf(item) : undefined
  const info = position ? positionInfo(position) : null
  const scope = task ? resolveScope(task.scopeType, task.scopeId) : null
  return {
    id: item.id,
    kind: item.kind,
    formerMember: personRef(item.formerMemberId),
    status: state.status,
    title: task?.title ?? info?.title ?? '',
    task:
      task && scope
        ? {
            scopeName: scope.name,
            eventName: scope.eventName,
            status: task.status,
            dueAt: task.dueAt,
            overdue: isTaskOverdue(task),
            counterpart: personRef(item.kind === 'TASK' ? task.assignerId : task.ownerId),
          }
        : null,
    position: position && info ? { role: position.role, scopeName: info.scopeName, eventName: info.eventName } : null,
    resolution: item.resolution
      ? {
          action: item.resolution.action,
          person: item.resolution.userId ? personRef(item.resolution.userId) : null,
          reason: item.resolution.reason,
          by: personRef(item.resolution.by),
          at: item.resolution.at,
        }
      : null,
    resolvedNote: state.note,
    appointBlockedReason: state.status === 'OPEN' ? (appointBlock(item, viewerId)?.message ?? null) : null,
    createdAt: item.createdAt,
    allowedActions: backlogActions(item, viewerId),
    version: item.version,
  }
}

/** Nhóm theo người cũ (theo tên), trong mỗi người: chức vụ, việc đang làm, việc chờ nghiệm thu; cũ trước. */
export function compareBacklogItems(a: DbBacklogItem, b: DbBacklogItem): number {
  return (
    nameOf(a.formerMemberId).localeCompare(nameOf(b.formerMemberId), 'vi') ||
    a.formerMemberId.localeCompare(b.formerMemberId) ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  )
}

export { eventOfPosition, positionOf, taskOf }
