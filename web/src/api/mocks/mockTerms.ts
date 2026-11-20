import type { EventStatus } from '@/features/event/model/eventTypes'
import type { TaskStatus } from '@/features/task/model/taskTypes'
import type { DepartmentOption, HandoverCompletionPreview, HandoverCounts, HandoverItemCounts, HandoverItemKind, HandoverItemStatus } from '@/features/term/model/handoverTypes'
import type { DepartmentPlanEntry } from '@/features/term/model/termTypes'
import { formatMoney } from '@/shared/format/formatMoney'
import { db, type DbAppointment, type DbDepartment, type DbHandover, type DbHandoverItem, type DbHandoverSnapshot, type DbPlanEntry, type DbTerm } from './db'
import { can } from './mockAccess'
import { fundBalance, PENDING_STATUSES } from './mockFinance'
import { newId } from './mockHttp'
import { canAccessClub, departmentMemberCount, eligibleMembers, membershipOf, personRef } from './mockMembers'
import { notify, structureTarget, termsTarget } from './mockNotifications'
import {
  BOARD_ROLES,
  currentTermOf,
  endPositions,
  EVENT_STAFF_ACTIVE,
  grantPosition,
  isBoardMember,
  isPositionOpen,
  positionHolderOf,
  positionTitleOf,
  positionTitles,
  STANDING_ROLES,
} from './mockPermissions'
import { replaceEventLead } from './mockStaffEvents'
import { nowIso, shiftDate, vnToday } from './mockTime'

/** Luật nhiệm kỳ dùng chung cho các handler (SRS 5.5); mỗi CLB có tối đa một nhiệm kỳ Chuẩn bị. */
export function preparingTermOf(clubId: string): DbTerm | undefined {
  return db.terms.find((term) => term.clubId === clubId && term.status === 'PREPARING')
}

/** FR-TERM-01: ban chủ nhiệm khai báo nhiệm kỳ mới khi nhiệm kỳ hiện tại Đang chạy và chưa có nhiệm kỳ Chuẩn bị. */
export function canCreateTerm(userId: string, clubId: string): boolean {
  return can(userId, clubId, 'MANAGE_TERMS') && currentTermOf(clubId)?.status === 'RUNNING' && !preparingTermOf(clubId)
}

export function activeDepartmentsOf(clubId: string): DbDepartment[] {
  return db.departments.filter((department) => department.clubId === clubId && department.status === 'ACTIVE').toSorted((a, b) => a.name.localeCompare(b.name, 'vi'))
}

/** Dòng kế hoạch của một ban đã có luôn mang cùng một mã, để lần đọc nào cũng khớp nhau. */
export const planEntryIdOf = (departmentId: string) => `pe-${departmentId}`

/** Ban giữ nguyên: tên, mô tả để trống nghĩa là theo ban ở Cơ cấu, nên đổi tên ở Cơ cấu sau đó vẫn hiện đúng. */
export const keptEntry = (department: DbDepartment): DbPlanEntry => ({
  id: planEntryIdOf(department.id),
  departmentId: department.id,
  name: null,
  description: null,
  dropped: false,
})

/** FR-TERM-01: chép các ban đang hoạt động làm mẫu cho nhiệm kỳ mới. */
export function copyDepartmentPlan(clubId: string): DbPlanEntry[] {
  return activeDepartmentsOf(clubId).map(keptEntry)
}

/** Dòng kế hoạch đã điền tên, mô tả thật sẽ áp dụng khi hoàn tất bàn giao. */
export interface ResolvedPlanEntry {
  id: string
  departmentId: string | null
  name: string
  description: string
  dropped: boolean
}

/** Kế hoạch khớp cơ cấu hiện tại: ban khai báo sau lúc chép thì coi là giữ, dòng của ban đã đóng thì bỏ. */
export function resolvedPlan(term: DbTerm, plan: DbPlanEntry[] = term.departmentPlan ?? []): ResolvedPlanEntry[] {
  const active = new Map(activeDepartmentsOf(term.clubId).map((department) => [department.id, department]))
  const kept = plan.filter((entry) => entry.departmentId === null || active.has(entry.departmentId))
  const planned = new Set(kept.map((entry) => entry.departmentId))
  const added = [...active.values()].filter((department) => !planned.has(department.id)).map(keptEntry)
  return [...kept, ...added].map((entry) => {
    const department = entry.departmentId ? active.get(entry.departmentId) : undefined
    return {
      id: entry.id,
      departmentId: entry.departmentId,
      name: entry.name ?? department?.name ?? '',
      description: entry.description ?? department?.description ?? '',
      dropped: entry.dropped,
    }
  })
}

/** Ban còn người thì chưa bỏ được, giống luật đóng ban (FR-ORG-01); trả null khi bỏ được. */
export function dropBlockedReason(department: DbDepartment): string | null {
  const members = departmentMemberCount(department.id)
  return members > 0 ? `Ban ${department.name} còn ${members} thành viên có ban chính là ban này nên chưa bỏ được; chuyển họ sang ban khác ở trang Cơ cấu.` : null
}

export function toPlanEntries(term: DbTerm): DepartmentPlanEntry[] {
  return resolvedPlan(term).map((entry) => {
    const department = db.departments.find((candidate) => candidate.id === entry.departmentId)
    return {
      ...entry,
      currentName: department?.name ?? null,
      memberCount: department ? departmentMemberCount(department.id) : 0,
      dropBlockedReason: department ? dropBlockedReason(department) : null,
    }
  })
}

/** Mỗi CLB có tối đa một phiên bàn giao đang mở, đúng lúc nhiệm kỳ đang phụ trách ở Đang bàn giao. */
export function openHandoverOf(clubId: string): DbHandover | undefined {
  return db.handovers.find((handover) => handover.clubId === clubId && handover.status === 'OPEN')
}

/** Phiên bàn giao gần nhất mà nhiệm kỳ là bên giao hoặc bên nhận. */
export function handoverOfTerm(termId: string): DbHandover | undefined {
  return db.handovers.filter((handover) => handover.fromTermId === termId || handover.toTermId === termId).at(-1)
}

/** Người được bầu vào ban chủ nhiệm mới; họ xác nhận từng mục bàn giao dù chưa có quyền ban chủ nhiệm (FR-TERM-05). */
export function isBoardAppointee(userId: string, handover: DbHandover): boolean {
  return handover.appointments.some((appointment) => appointment.userId === userId && BOARD_ROLES.includes(appointment.role))
}

/** Phiên bàn giao chỉ ban chủ nhiệm cũ và ban chủ nhiệm mới xem được, vì danh mục chứa số dư quỹ, việc của các ban. */
export function canViewHandover(userId: string, handover: DbHandover): boolean {
  return isBoardMember(userId, handover.clubId) || isBoardAppointee(userId, handover)
}

/** Ban giữ lại trong kế hoạch của nhiệm kỳ mới, kèm tên theo kế hoạch; ban mới chưa có mã nên chưa bầu trưởng ban được. */
export function keptDepartmentOptions(toTerm: DbTerm): DepartmentOption[] {
  return resolvedPlan(toTerm).flatMap((entry) => (entry.departmentId && !entry.dropped ? [{ id: entry.departmentId, name: entry.name }] : []))
}

export const appointmentTitle = (appointment: Pick<DbAppointment, 'role'>, departmentName: string | null) =>
  departmentName ? `${positionTitles[appointment.role]} ${departmentName}` : positionTitles[appointment.role]

/** BR-ORG-01 cho kết quả bầu: Chính thức, trưởng, phó ban thuộc đúng ban được giữ lại. Trả null khi hợp lệ. */
export function appointmentProblem(appointment: Pick<DbAppointment, 'role' | 'departmentId' | 'userId'>, handover: DbHandover): string | null {
  const membership = membershipOf(appointment.userId, handover.clubId)
  const name = personRef(appointment.userId).fullName
  if (membership?.status !== 'ACTIVE') return `${name} không còn là thành viên Chính thức.`
  if (BOARD_ROLES.includes(appointment.role)) return null
  const toTerm = db.terms.find((term) => term.id === handover.toTermId)
  const department = toTerm ? keptDepartmentOptions(toTerm).find((option) => option.id === appointment.departmentId) : undefined
  if (!department) return 'Ban này không còn được giữ trong kế hoạch của nhiệm kỳ mới.'
  if (membership.departmentId !== department.id) return `${name} không có ban chính là ban ${department.name}.`
  return null
}

/** Những lý do chưa hoàn tất được bàn giao, đọc lại mỗi lần (BR-ORG-02, BR-TERM-01, BR-TERM-04). */
export function handoverBlockers(handover: DbHandover): string[] {
  const toTerm = db.terms.find((term) => term.id === handover.toTermId)
  if (!toTerm) return ['Không tìm thấy nhiệm kỳ nhận bàn giao.']
  const options = keptDepartmentOptions(toTerm)
  const blockers: string[] = []
  const hasPresident = handover.appointments.some((appointment) => appointment.role === 'PRESIDENT' && appointmentProblem(appointment, handover) === null)
  if (!hasPresident) blockers.push('Chưa có Chủ nhiệm đủ điều kiện cho nhiệm kỳ mới.')
  const pending = handoverCounts(handover.id).pending
  if (pending > 0) blockers.push(`Còn ${pending} mục bàn giao chờ ban chủ nhiệm mới xác nhận.`)
  for (const appointment of handover.appointments) {
    const problem = appointmentProblem(appointment, handover)
    // Ban đã bỏ khỏi kế hoạch không còn trong `options`; vẫn nêu tên ban để mỗi dòng lý do phân biệt được.
    const departmentName =
      options.find((option) => option.id === appointment.departmentId)?.name ?? db.departments.find((department) => department.id === appointment.departmentId)?.name ?? null
    if (problem) blockers.push(`${appointmentTitle(appointment, departmentName)} (${personRef(appointment.userId).fullName}): ${problem}`)
  }
  const plan = resolvedPlan(toTerm)
  for (const entry of plan) {
    const department = entry.dropped ? db.departments.find((candidate) => candidate.id === entry.departmentId) : undefined
    const blocked = department ? dropBlockedReason(department) : null
    if (blocked) blockers.push(blocked)
  }
  // Khai báo hoặc đổi tên ban ở Cơ cấu trong lúc bàn giao có thể trùng tên một ban trong kế hoạch.
  const kept = plan.filter((entry) => !entry.dropped)
  const duplicates = new Map<string, string>()
  for (const entry of kept) {
    const key = entry.name.trim().toLowerCase()
    if (kept.filter((other) => other.name.trim().toLowerCase() === key).length > 1) duplicates.set(key, entry.name)
  }
  for (const name of duplicates.values()) blockers.push(`Kế hoạch ban có nhiều ban tên ${name}; đổi tên một trong các ban ở trang Nhiệm kỳ.`)
  if (toTerm.endOn <= vnToday()) blockers.push(`Ngày kết thúc của ${toTerm.name} phải sau hôm nay; sửa ở trang Nhiệm kỳ.`)
  return blockers
}

/** Nhiệm kỳ đang chạy đã qua ngày kết thúc mà chưa bắt đầu bàn giao. */
export function isTermOverdue(clubId: string): boolean {
  const term = currentTermOf(clubId)
  return term?.status === 'RUNNING' && vnToday() > term.endOn
}

/** Gán chức vụ thường trực mới được khi có nhiệm kỳ đang chạy, chưa quá ngày kết thúc và không đang bàn giao (nhóm chốt ngày 14/11). */
export function canAssignStanding(clubId: string): boolean {
  return currentTermOf(clubId)?.status === 'RUNNING' && !isTermOverdue(clubId)
}

/** Câu báo khi thiếu Chủ nhiệm (BR-ORG-02), chỉ đúng việc người dùng làm được ở trạng thái nhiệm kỳ hiện tại. */
export function lastPresidentHint(clubId: string): string {
  if (openHandoverOf(clubId)) return 'CLB đang bàn giao: Chủ nhiệm mới ghi ở kết quả bầu và nhận chức khi bàn giao hoàn tất.'
  if (isTermOverdue(clubId)) return 'Nhiệm kỳ đã quá ngày kết thúc: bắt đầu bàn giao ở trang Nhiệm kỳ (khai báo nhiệm kỳ mới nếu chưa có) rồi ghi Chủ nhiệm mới ở kết quả bầu.'
  return 'Gán Chủ nhiệm mới nhận bàn giao từ ngày chuyển giao trước.'
}

const TASK_FINISHED: TaskStatus[] = ['DONE', 'CANCELLED']
/** Dự thảo là riêng tư của người đề xuất; Đã đóng, Đã hủy thì không còn gì để bàn giao. */
const EVENT_NOT_HANDED_OVER: EventStatus[] = ['DRAFT', 'CLOSED', 'CANCELLED']
const KIND_ORDER: Record<HandoverItemKind, number> = { FUND: 0, EVENT: 1, TASK: 2 }
const STATUS_ORDER: Record<HandoverItemStatus, number> = { PENDING: 0, CONFIRMED: 1, RESOLVED: 2 }

export function handoverItemsOf(handoverId: string): DbHandoverItem[] {
  return db.handoverItems.filter((item) => item.handoverId === handoverId)
}

/** Ứng viên Trưởng BTC: thành viên Thử việc hoặc Chính thức của CLB (BR-ORG-01), như khi duyệt sự kiện. */
export function isLeadCandidate(clubId: string, userId: string): boolean {
  return eligibleMembers(clubId).some((member) => member.id === userId)
}

/** FR-TERM-04 với các loại đã có dữ liệu: quỹ đang mở, sự kiện chưa đóng, việc của ban chưa xong; việc của tiểu ban đi theo sự kiện. */
function handoverTargets(clubId: string): Array<Pick<DbHandoverItem, 'kind' | 'refId'>> {
  return [
    ...db.funds.filter((fund) => fund.clubId === clubId && fund.status === 'OPEN').map((fund) => ({ kind: 'FUND' as const, refId: fund.id })),
    ...db.events.filter((event) => event.clubId === clubId && !EVENT_NOT_HANDED_OVER.includes(event.status)).map((event) => ({ kind: 'EVENT' as const, refId: event.id })),
    ...db.tasks
      .filter((task) => task.clubId === clubId && task.scopeType === 'DEPARTMENT' && !TASK_FINISHED.includes(task.status))
      .map((task) => ({ kind: 'TASK' as const, refId: task.id })),
  ]
}

/** Lý do mục không cần bàn giao nữa; null khi đối tượng vẫn cần bàn giao. */
function resolvedReason(item: Pick<DbHandoverItem, 'kind' | 'refId'>): string | null {
  if (item.kind === 'FUND') return db.funds.find((fund) => fund.id === item.refId)?.status === 'OPEN' ? null : 'Quỹ đã quyết toán nên không cần bàn giao nữa.'
  if (item.kind === 'TASK') {
    const status = db.tasks.find((task) => task.id === item.refId)?.status
    if (status === 'DONE') return 'Công việc đã hoàn thành nên không cần bàn giao nữa.'
    if (status === undefined || status === 'CANCELLED') return 'Công việc đã hủy nên không cần bàn giao nữa.'
    return null
  }
  const status = db.events.find((event) => event.id === item.refId)?.status
  if (status === 'CLOSED') return 'Sự kiện đã đóng nên không cần bàn giao nữa.'
  if (status === undefined || status === 'CANCELLED') return 'Sự kiện đã hủy nên không cần bàn giao nữa.'
  if (status === 'DRAFT') return 'Đề xuất đã về Dự thảo nên chưa cần bàn giao.'
  return null
}

function currentSnapshot(item: Pick<DbHandoverItem, 'kind' | 'refId'>): DbHandoverSnapshot {
  if (item.kind === 'FUND') {
    const pendingIds = db.transactions.filter((transaction) => transaction.fundId === item.refId && PENDING_STATUSES.includes(transaction.status)).map((transaction) => transaction.id)
    return { kind: 'FUND', balance: fundBalance(item.refId), pendingIds }
  }
  if (item.kind === 'TASK') return { kind: 'TASK', ownerId: db.tasks.find((task) => task.id === item.refId)?.ownerId ?? '' }
  const status = db.events.find((event) => event.id === item.refId)?.status
  return { kind: 'EVENT', leadId: positionHolderOf('EVENT_LEAD', item.refId), needsLeadDecision: status !== undefined && EVENT_STAFF_ACTIVE.includes(status) }
}

const nameOf = (userId: string | null) => (userId ? personRef(userId).fullName : 'người cũ')

/** Câu giải thích khi phần người xác nhận đã thấy thay đổi; null là mục vẫn còn đúng như lúc xác nhận. */
function driftNote(item: DbHandoverItem, next: DbHandoverSnapshot, clubId: string): string | null {
  const before = item.snapshot
  if (before.kind === 'FUND' && next.kind === 'FUND') {
    const added = next.pendingIds.filter((id) => !before.pendingIds.includes(id)).length
    const parts = [
      ...(before.balance !== next.balance ? [`Số dư đổi từ ${formatMoney(before.balance)} thành ${formatMoney(next.balance)} sau khi xác nhận.`] : []),
      ...(added > 0 ? [`Có thêm ${added} khoản chờ duyệt hoặc chờ ghi sổ sau khi xác nhận.`] : []),
    ]
    return parts.length > 0 ? parts.join(' ') : null
  }
  if (before.kind === 'TASK' && next.kind === 'TASK') {
    return before.ownerId === next.ownerId ? null : `Người làm đổi từ ${nameOf(before.ownerId)} thành ${nameOf(next.ownerId)} sau khi xác nhận.`
  }
  if (before.kind === 'EVENT' && next.kind === 'EVENT') {
    if (!before.needsLeadDecision && next.needsLeadDecision) return 'Sự kiện đã được duyệt nên cần chọn giữ hoặc thay Trưởng BTC.'
    if (before.leadId !== next.leadId) {
      if (next.leadId === null) return `${nameOf(before.leadId)} không còn là Trưởng BTC sau khi xác nhận.`
      if (before.leadId === null) return `Sự kiện có Trưởng BTC ${nameOf(next.leadId)} sau khi xác nhận.`
      return `Trưởng BTC đổi từ ${nameOf(before.leadId)} thành ${nameOf(next.leadId)} sau khi xác nhận.`
    }
    const chosen = item.eventLead
    if (chosen?.action === 'REPLACE' && !isLeadCandidate(clubId, chosen.userId)) return `${nameOf(chosen.userId)} không còn đủ điều kiện làm Trưởng BTC nên cần chọn lại.`
  }
  return null
}

function resetItem(item: DbHandoverItem, status: HandoverItemStatus, note: string, snapshot: DbHandoverSnapshot) {
  Object.assign(item, { status, note, snapshot, confirmedBy: null, confirmedAt: null, eventLead: null })
  item.version += 1
}

function refreshItem(item: DbHandoverItem, clubId: string) {
  const resolved = resolvedReason(item)
  if (resolved !== null) {
    if (item.status !== 'RESOLVED') resetItem(item, 'RESOLVED', resolved, item.snapshot)
    return
  }
  const next = currentSnapshot(item)
  if (item.status === 'RESOLVED') return resetItem(item, 'PENDING', 'Mục này cần bàn giao trở lại.', next)
  const drift = item.status === 'CONFIRMED' ? driftNote(item, next, clubId) : null
  if (drift !== null) return resetItem(item, 'PENDING', drift, next)
  // Mục chờ xác nhận cũng tăng version khi số liệu đổi, để người bấm xác nhận theo số liệu cũ nhận 409.
  if (JSON.stringify(item.snapshot) !== JSON.stringify(next)) {
    item.snapshot = next
    item.version += 1
  }
}

/** Khớp danh mục với dữ liệu lúc đọc (FR-TERM-04): thêm đối tượng mới, mục đã xác nhận mà đổi thì về Chờ xác nhận, đối tượng đã xong thì không cần bàn giao. */
export function syncHandoverItems(handover: DbHandover): void {
  if (handover.status !== 'OPEN') return
  const items = handoverItemsOf(handover.id)
  const known = new Set(items.map((item) => `${item.kind}|${item.refId}`))
  for (const target of handoverTargets(handover.clubId)) {
    if (known.has(`${target.kind}|${target.refId}`)) continue
    db.handoverItems.push({
      id: newId('hi'),
      handoverId: handover.id,
      ...target,
      status: 'PENDING',
      snapshot: currentSnapshot(target),
      note: null,
      confirmedBy: null,
      confirmedAt: null,
      eventLead: null,
      version: 1,
    })
  }
  for (const item of items) refreshItem(item, handover.clubId)
}

export function handoverCounts(handoverId: string): HandoverCounts {
  const empty = (): HandoverItemCounts => ({ total: 0, pending: 0, confirmed: 0, resolved: 0 })
  const counts: HandoverCounts = { ...empty(), byKind: { FUND: empty(), EVENT: empty(), TASK: empty() } }
  const field = { PENDING: 'pending', CONFIRMED: 'confirmed', RESOLVED: 'resolved' } as const
  for (const item of handoverItemsOf(handoverId)) {
    for (const bucket of [counts, counts.byKind[item.kind]]) {
      bucket.total += 1
      bucket[field[item.status]] += 1
    }
  }
  return counts
}

/** Quỹ chung trước quỹ sự kiện, sự kiện theo ngày bắt đầu, việc theo hạn. */
function itemSortKey(item: DbHandoverItem): string {
  if (item.kind === 'FUND') {
    const fund = db.funds.find((candidate) => candidate.id === item.refId)
    return fund?.kind === 'GENERAL' ? '0' : `1${db.events.find((event) => event.id === fund?.eventId)?.startAt ?? ''}`
  }
  if (item.kind === 'EVENT') return db.events.find((event) => event.id === item.refId)?.startAt ?? ''
  return db.tasks.find((task) => task.id === item.refId)?.dueAt ?? ''
}

/** Theo loại (quỹ, sự kiện, công việc), trong mỗi loại mục chờ xác nhận đứng trước. */
export function compareHandoverItems(a: DbHandoverItem, b: DbHandoverItem): number {
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || itemSortKey(a).localeCompare(itemSortKey(b)) || a.id.localeCompare(b.id)
}

/** FR-TERM-05: người được bầu Chủ nhiệm, Phó chủ nhiệm, Thủ quỹ mới, còn đủ điều kiện (kể cả người tái đắc cử). */
export function isEligibleBoardAppointee(userId: string, handover: DbHandover): boolean {
  return handover.appointments.some((appointment) => appointment.userId === userId && BOARD_ROLES.includes(appointment.role) && appointmentProblem(appointment, handover) === null)
}

const termOf = (termId: string) => db.terms.find((term) => term.id === termId) as DbTerm

/** Ngày theo thực tế (quyết định 11/11): nhiệm kỳ cũ kết thúc hôm qua nhưng không trước ngày bắt đầu, nhiệm kỳ mới bắt đầu hôm nay. */
function completionDates(fromTerm: DbTerm): { fromTermEndOn: string; toTermStartOn: string } {
  const today = vnToday()
  const yesterday = shiftDate(today, -1)
  return { fromTermEndOn: yesterday < fromTerm.startOn ? fromTerm.startOn : yesterday, toTermStartOn: today }
}

/** Chức vụ thường trực còn mở của CLB, kể cả chức hết hạn cùng nhiệm kỳ đang được giữ tới khi bàn giao xong (BR-TERM-02). */
const openStandingPositions = (clubId: string) => db.positions.filter((position) => position.clubId === clubId && STANDING_ROLES.includes(position.role) && isPositionOpen(position))

const leadReplacementsOf = (handover: DbHandover) =>
  handoverItemsOf(handover.id).filter((item) => item.kind === 'EVENT' && item.status === 'CONFIRMED' && item.eventLead?.action === 'REPLACE')

export function completionPreview(handover: DbHandover): HandoverCompletionPreview {
  const fromTerm = termOf(handover.fromTermId)
  const toTerm = termOf(handover.toTermId)
  const plan = resolvedPlan(toTerm)
  const departmentOf = (id: string | null) => db.departments.find((department) => department.id === id)
  return {
    endingPositionCount: openStandingPositions(handover.clubId).length,
    grantedPositionCount: handover.appointments.length,
    closingDepartments: plan.filter((entry) => entry.dropped).map((entry) => departmentOf(entry.departmentId)?.name ?? entry.name),
    newDepartments: plan.filter((entry) => entry.departmentId === null).map((entry) => entry.name),
    renamedDepartments: plan.flatMap((entry) => {
      const department = entry.dropped ? undefined : departmentOf(entry.departmentId)
      return department && department.name !== entry.name ? [{ from: department.name, to: entry.name }] : []
    }),
    leadReplacements: leadReplacementsOf(handover).map((item) => ({
      eventName: db.events.find((event) => event.id === item.refId)?.name ?? '',
      from: item.snapshot.kind === 'EVENT' && item.snapshot.leadId ? personRef(item.snapshot.leadId) : null,
      to: personRef(item.eventLead?.userId ?? ''),
    })),
    ...completionDates(fromTerm),
  }
}

/** FR-TERM-06: áp dụng bàn giao khi đã đủ điều kiện (người gọi kiểm `handoverBlockers` trước); thứ tự bước tránh kết thúc nhầm chức mới của người tái đắc cử. */
export function completeHandover(handover: DbHandover, actorId: string): void {
  const clubId = handover.clubId
  const fromTerm = termOf(handover.fromTermId)
  const toTerm = termOf(handover.toTermId)
  const { fromTermEndOn, toTermStartOn } = completionDates(fromTerm)
  const plan = resolvedPlan(toTerm)
  const replacements = leadReplacementsOf(handover)
  const closedDepartments = activeDepartmentsOf(clubId).map((department) => ({ id: department.id, name: department.name }))

  endPositions((position) => position.clubId === clubId && STANDING_ROLES.includes(position.role), { reason: `Kết thúc ${fromTerm.name}`, handoverOn: toTermStartOn })

  // BR-TERM-04: ban bị bỏ chuyển Đã đóng; ban giữ lại vẫn là bản ghi cũ; ban mới thuộc nhiệm kỳ mới.
  for (const entry of plan) {
    const department = entry.departmentId ? db.departments.find((candidate) => candidate.id === entry.departmentId) : undefined
    if (department && entry.dropped) {
      Object.assign(department, { status: 'CLOSED' as const, closedOn: toTermStartOn, closeReason: `Bỏ khi chuyển sang ${toTerm.name}` })
      department.version += 1
    } else if (department) {
      if (department.name === entry.name && department.description === entry.description) continue
      Object.assign(department, { name: entry.name, description: entry.description })
      department.version += 1
    } else {
      db.departments.push({
        id: newId('d'),
        clubId,
        termId: toTerm.id,
        name: entry.name,
        description: entry.description,
        status: 'ACTIVE',
        closedOn: null,
        closeReason: null,
        createdAt: nowIso(),
        version: 1,
      })
    }
  }

  const granted = handover.appointments.map((appointment) =>
    grantPosition({ userId: appointment.userId, clubId, role: appointment.role, scopeId: appointment.departmentId ?? clubId, assignedBy: actorId, startOn: toTermStartOn, endOn: toTerm.endOn }),
  )

  for (const item of replacements) {
    const event = db.events.find((candidate) => candidate.id === item.refId)
    if (event && item.eventLead) replaceEventLead(event, item.eventLead.userId, actorId, `Ban chủ nhiệm ${toTerm.name} thay Trưởng BTC khi nhận bàn giao.`)
  }

  Object.assign(fromTerm, { status: 'CLOSED' as const, endOn: fromTermEndOn, closedAt: nowIso(), closedDepartments })
  fromTerm.version += 1
  Object.assign(toTerm, { status: 'RUNNING' as const, startOn: toTermStartOn, departmentPlan: null })
  toTerm.version += 1
  Object.assign(handover, { status: 'COMPLETED' as const, completedAt: nowIso(), completedBy: actorId })
  handover.version += 1

  const members = db.memberships.filter((membership) => membership.clubId === clubId && canAccessClub(membership.userId, clubId)).map((membership) => membership.userId)
  notify(members, {
    clubId,
    category: 'TERM',
    title: `${toTerm.name} bắt đầu`,
    body: `${fromTerm.name} đã kết thúc. Ban chủ nhiệm mới nhận quyền từ hôm nay.`,
    target: termsTarget(clubId),
    actorId,
  })
  for (const position of granted) {
    notify([position.userId], { clubId, category: 'POSITION', title: `Bạn nhận chức ${positionTitleOf(position)} ${toTerm.name}`, target: structureTarget(clubId), actorId })
  }
}
