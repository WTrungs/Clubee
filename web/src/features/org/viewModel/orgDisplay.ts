import { formatDate } from '@/shared/format/formatDate'
import type { Tone } from '@/shared/ui/tone'
import type { Department, Position, PositionRole, PositionScopeType, PositionStatus, StandingRole } from '../model/orgTypes'

export const positionRoleLabel: Record<PositionRole, string> = {
  PRESIDENT: 'Chủ nhiệm',
  VICE_PRESIDENT: 'Phó chủ nhiệm',
  TREASURER: 'Thủ quỹ',
  DEPARTMENT_HEAD: 'Trưởng ban',
  DEPARTMENT_VICE_HEAD: 'Phó ban',
  EVENT_LEAD: 'Trưởng BTC',
  SUBCOMMITTEE_LEAD: 'Trưởng tiểu ban',
}

export const BOARD_ROLES = ['PRESIDENT', 'VICE_PRESIDENT', 'TREASURER'] as const satisfies readonly StandingRole[]
export const DEPARTMENT_ROLES = ['DEPARTMENT_HEAD', 'DEPARTMENT_VICE_HEAD'] as const satisfies readonly StandingRole[]
export const STANDING_ROLES = [...BOARD_ROLES, ...DEPARTMENT_ROLES] as const
const PRESIDENCY_ROLES: readonly StandingRole[] = ['PRESIDENT', 'VICE_PRESIDENT']

/** Chức vụ được chọn khi gán; chỉ Chủ nhiệm, Phó chủ nhiệm gán được chức Chủ nhiệm, Phó chủ nhiệm (máy chủ trả `ASSIGN_PRESIDENCY`). */
export function assignableRoles(canAssignPresidency: boolean): StandingRole[] {
  return STANDING_ROLES.filter((role) => canAssignPresidency || !PRESIDENCY_ROLES.includes(role))
}

/** Chức vụ cấp ban cần chọn ban; chức vụ ban chủ nhiệm có phạm vi là cả CLB (SRS 3.2). */
export function needsDepartment(role: StandingRole | ''): boolean {
  return (DEPARTMENT_ROLES as readonly string[]).includes(role)
}

/** Tên chức vụ kèm phạm vi, ví dụ "Trưởng ban Truyền thông" hoặc "Trưởng BTC · Đêm nhạc Mùa đông". */
export function positionTitle(position: Pick<Position, 'role' | 'scope'>): string {
  const role = positionRoleLabel[position.role]
  if (position.scope.type === 'CLUB') return role
  if (position.scope.type === 'EVENT') return `${role} · ${position.scope.name}`
  return `${role} ${position.scope.name}`
}

/** Trưởng ban đang hiệu lực; người nhận bàn giao chưa tới ngày bắt đầu chưa tính. */
export function currentHead<T extends Pick<Position, 'role' | 'status'>>(leads: T[]): T | undefined {
  return leads.find((lead) => lead.role === 'DEPARTMENT_HEAD' && lead.status === 'ACTIVE')
}

export const positionStatusDisplay: Record<PositionStatus, { label: string; tone: Tone }> = {
  UPCOMING: { label: 'Sắp hiệu lực', tone: 'info' },
  ACTIVE: { label: 'Đang giữ', tone: 'success' },
  ENDED: { label: 'Đã kết thúc', tone: 'neutral' },
}

/** Thời hạn chức vụ, ví dụ "01/09/2026 – 31/08/2027"; chức vụ sự kiện còn chạy chưa có ngày cuối. */
export function positionPeriod(position: Pick<Position, 'startOn' | 'endOn' | 'untilHandover'>): string {
  if (position.untilHandover) return `Từ ${formatDate(position.startOn)}, đến khi bàn giao xong`
  if (position.endOn === null) return `Từ ${formatDate(position.startOn)}, đến khi sự kiện đóng`
  // Chức vụ bị hủy trước ngày bắt đầu thì ngày cuối sớm hơn ngày đầu; khoảng đó không có nghĩa.
  if (position.endOn < position.startOn) return `Hủy trước ngày bắt đầu ${formatDate(position.startOn)}`
  return `${formatDate(position.startOn)} – ${formatDate(position.endOn)}`
}

/** Ngày thao tác thu hồi kèm lý do; máy chủ chỉ trả lý do cho ban chủ nhiệm (SRS 3.5), ngày hiệu lực cuối nằm ở thời hạn. */
export function positionEndNote(position: Pick<Position, 'revokedOn' | 'revokeReason'>): string | null {
  if (!position.revokeReason) return null
  return position.revokedOn ? `Thu hồi ngày ${formatDate(position.revokedOn)}: ${position.revokeReason}` : position.revokeReason
}

/** Lọc tra cứu chức vụ theo loại phạm vi (FR-ORG-06); chuỗi rỗng là tất cả. */
export const POSITION_SCOPE_FILTERS: Array<{ value: PositionScopeType | ''; label: string }> = [
  { value: '', label: 'Tất cả' },
  { value: 'CLUB', label: 'Ban chủ nhiệm' },
  { value: 'DEPARTMENT', label: 'Ban chuyên môn' },
  { value: 'EVENT', label: 'Sự kiện' },
  { value: 'SUBCOMMITTEE', label: 'Tiểu ban' },
]

export type DepartmentHealth = 'OVERDUE' | 'DUE_SOON' | 'NO_HEAD' | 'ON_TRACK' | 'CLOSED'

/** Một badge cho mỗi ban (FR-ORG-07), ưu tiên: Quá hạn > Sắp đến hạn > Chưa có trưởng ban > Đúng tiến độ. */
export function departmentHealth(
  department: Pick<Department, 'status' | 'overdueTaskCount' | 'dueSoonTaskCount'> & { leads: Array<Pick<Position, 'role' | 'status'>> },
): DepartmentHealth {
  if (department.status === 'CLOSED') return 'CLOSED'
  if (department.overdueTaskCount > 0) return 'OVERDUE'
  if (department.dueSoonTaskCount > 0) return 'DUE_SOON'
  if (!currentHead(department.leads)) return 'NO_HEAD'
  return 'ON_TRACK'
}

export const departmentHealthDisplay: Record<DepartmentHealth, { label: string; tone: Tone }> = {
  OVERDUE: { label: 'Quá hạn', tone: 'danger' },
  DUE_SOON: { label: 'Sắp đến hạn', tone: 'warning' },
  NO_HEAD: { label: 'Chưa có trưởng ban', tone: 'progress' },
  ON_TRACK: { label: 'Đúng tiến độ', tone: 'success' },
  CLOSED: { label: 'Đã đóng', tone: 'neutral' },
}
