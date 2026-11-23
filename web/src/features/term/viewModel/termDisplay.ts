import type { StandingRole } from '@/features/org/model/orgTypes'
import { positionRoleLabel } from '@/features/org/viewModel/orgDisplay'
import { daysUntil, formatDate } from '@/shared/format/formatDate'
import type { Tone } from '@/shared/ui/tone'
import type { Appointment } from '../model/handoverTypes'
import type { DepartmentPlanEntry, Term, TermStatus } from '../model/termTypes'

export const termStatusDisplay: Record<TermStatus, { label: string; tone: Tone }> = {
  PREPARING: { label: 'Chuẩn bị', tone: 'info' },
  RUNNING: { label: 'Đang chạy', tone: 'success' },
  HANDING_OVER: { label: 'Đang bàn giao', tone: 'warning' },
  CLOSED: { label: 'Đã đóng', tone: 'neutral' },
}

const TERM_LIFECYCLE: TermStatus[] = ['PREPARING', 'RUNNING', 'HANDING_OVER', 'CLOSED']

export interface TermLifecycleStep {
  status: TermStatus
  label: string
  state: 'done' | 'current' | 'upcoming'
}

/** Các bước ST-TERM; nhiệm kỳ Đã đóng coi như đã đi hết mọi bước. */
export function termLifecycleSteps(status: TermStatus): TermLifecycleStep[] {
  const index = TERM_LIFECYCLE.indexOf(status)
  return TERM_LIFECYCLE.map((step, position) => ({
    status: step,
    label: termStatusDisplay[step].label,
    state: position < index || status === 'CLOSED' ? 'done' : position === index ? 'current' : 'upcoming',
  }))
}

export function termPeriod(term: Pick<Term, 'startOn' | 'endOn'>): string {
  return `${formatDate(term.startOn)} – ${formatDate(term.endOn)}`
}

/** Thời gian còn lại tính theo ngày kết thúc đã khai; ngày kết thúc vẫn thuộc nhiệm kỳ. */
export function termRemainingText(endOn: string, now: Date = new Date()): string {
  const days = daysUntil(endOn, now)
  if (Number.isNaN(days)) return ''
  if (days > 0) return `Còn ${days} ngày`
  if (days === 0) return 'Kết thúc hôm nay'
  return `Đã quá ngày kết thúc ${-days} ngày`
}

export interface TermGroups {
  current: Term | null
  preparing: Term | null
  past: Term[]
}

/** Mỗi CLB có đúng một nhiệm kỳ đang phụ trách và tối đa một nhiệm kỳ Chuẩn bị (BR-TERM-01). */
export function groupTerms(terms: Term[]): TermGroups {
  return {
    current: terms.find((term) => term.status === 'RUNNING' || term.status === 'HANDING_OVER') ?? null,
    preparing: terms.find((term) => term.status === 'PREPARING') ?? null,
    past: terms.filter((term) => term.status === 'CLOSED'),
  }
}

export type PlanEntryKind = 'KEEP' | 'RENAME' | 'NEW' | 'DROP'

export const planEntryKindDisplay: Record<PlanEntryKind, { label: string; tone: Tone }> = {
  KEEP: { label: 'Giữ nguyên', tone: 'neutral' },
  RENAME: { label: 'Đổi tên', tone: 'info' },
  NEW: { label: 'Ban mới', tone: 'success' },
  DROP: { label: 'Sẽ đóng', tone: 'warning' },
}

type PlanEntryShape = Pick<DepartmentPlanEntry, 'departmentId' | 'dropped' | 'name' | 'currentName'>

export function planEntryKind(entry: PlanEntryShape): PlanEntryKind {
  if (entry.departmentId === null) return 'NEW'
  if (entry.dropped) return 'DROP'
  return entry.currentName !== null && entry.name.trim() !== entry.currentName ? 'RENAME' : 'KEEP'
}

/** Ví dụ "Giữ 4 ban · đổi tên 1 · thêm 1 · bỏ 1"; phần bằng 0 thì không nêu. */
export function planSummary(plan: PlanEntryShape[]): string {
  const count = (kind: PlanEntryKind) => plan.filter((entry) => planEntryKind(entry) === kind).length
  const parts = [
    `Giữ ${count('KEEP') + count('RENAME')} ban`,
    ...(count('RENAME') > 0 ? [`đổi tên ${count('RENAME')}`] : []),
    ...(count('NEW') > 0 ? [`thêm ${count('NEW')}`] : []),
    ...(count('DROP') > 0 ? [`bỏ ${count('DROP')}`] : []),
  ]
  return parts.join(' · ')
}

const ROLE_ORDER: StandingRole[] = ['PRESIDENT', 'VICE_PRESIDENT', 'TREASURER', 'DEPARTMENT_HEAD', 'DEPARTMENT_VICE_HEAD']

/** Ví dụ "Chủ nhiệm" hoặc "Trưởng ban Truyền thông". */
export function appointmentTitle(appointment: Pick<Appointment, 'role' | 'department'>): string {
  const role = positionRoleLabel[appointment.role]
  return appointment.department ? `${role} ${appointment.department.name}` : role
}

export interface AppointmentGroups {
  board: Appointment[]
  departments: Appointment[]
}

/** Ban chủ nhiệm mới trước, rồi trưởng, phó ban theo tên ban; cùng chức vụ thì theo tên người. */
export function groupAppointments(appointments: Appointment[]): AppointmentGroups {
  const sorted = appointments.toSorted(
    (a, b) =>
      (a.department?.name ?? '').localeCompare(b.department?.name ?? '', 'vi') ||
      ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
      a.person.fullName.localeCompare(b.person.fullName, 'vi'),
  )
  return { board: sorted.filter((appointment) => appointment.department === null), departments: sorted.filter((appointment) => appointment.department !== null) }
}

/** Nhiệm kỳ đang chạy đã qua ngày kết thúc mà chưa bàn giao: ban chủ nhiệm vẫn giữ quyền nhưng không gán chức vụ thường trực mới. */
export function isTermOverdue(term: Pick<Term, 'status' | 'endOn'>, now: Date): boolean {
  return term.status === 'RUNNING' && daysUntil(term.endOn, now) < 0
}

/** FR-TERM-02: câu nêu trước khi gia hạn; `endOn` null khi ô ngày chưa hợp lệ. */
export function extensionPreviewText(positionCount: number, endOn: string | null): string {
  if (positionCount === 0) return 'Không có chức vụ thường trực nào hết hạn cùng nhiệm kỳ; chỉ ngày kết thúc nhiệm kỳ đổi.'
  return endOn ? `${positionCount} chức vụ thường trực dời hạn tới ${formatDate(endOn)}.` : `${positionCount} chức vụ thường trực hết hạn cùng nhiệm kỳ sẽ dời theo ngày mới.`
}

/** Gợi ý ở dải báo nhiệm kỳ quá hạn, chỉ nêu việc người xem làm được. */
export function overdueHintText(can: { create: boolean; startHandover: boolean; extend: boolean }): string | null {
  const next = can.create ? 'Hãy khai báo nhiệm kỳ mới rồi bàn giao.' : can.startHandover ? 'Hãy bắt đầu bàn giao sang nhiệm kỳ kế tiếp.' : null
  if (!can.extend) return next
  return next ? `${next} Chưa bầu được ban chủ nhiệm mới thì gia hạn nhiệm kỳ.` : 'Chưa bầu được ban chủ nhiệm mới thì gia hạn nhiệm kỳ.'
}
