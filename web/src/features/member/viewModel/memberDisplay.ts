import { ApiError, getErrorMessage } from '@/api/apiError'
import type { MemberStatus } from '@/features/account/model/accountTypes'
import { formatDate } from '@/shared/format/formatDate'
import { memberStatusDisplay } from '@/features/account/viewModel/memberStatus'
import type { Tone } from '@/shared/ui/tone'
import type {
  DepartmentStint,
  LeaveRequestStatus,
  ResignBlocker,
  MemberAction,
  MemberInfoChange,
  MemberInfoField,
  MemberRoleFilter,
  MemberSummary,
  MemberTransitionAction,
  MembershipExit,
} from '../model/memberTypes'

export { memberStatusDisplay }

/** Trạng thái lọc được ở danh sách; Chờ duyệt nằm ở tab Yêu cầu gia nhập. */
export const LISTABLE_STATUSES: MemberStatus[] = ['PROBATION', 'ACTIVE', 'ON_LEAVE', 'LEFT']

export const roleFilterOptions: Array<{ value: MemberRoleFilter; label: string }> = [
  { value: 'PRESIDENT', label: 'Chủ nhiệm' },
  { value: 'VICE_PRESIDENT', label: 'Phó chủ nhiệm' },
  { value: 'TREASURER', label: 'Thủ quỹ' },
  { value: 'DEPARTMENT_HEAD', label: 'Trưởng ban' },
  { value: 'DEPARTMENT_VICE_HEAD', label: 'Phó ban' },
  { value: 'NONE', label: 'Không giữ chức vụ' },
]

export const exitKindLabel: Record<MembershipExit, string> = {
  REJECTED: 'Bị từ chối gia nhập',
  REMOVED: 'Bị đưa ra khỏi CLB',
  RESIGNED: 'Tự xin rời',
}

interface ActionDisplay {
  label: string
  variant: 'primary' | 'outline' | 'destructive'
  dialogTitle: string
  dialogDescription: string
  confirmLabel: string
  success: (name: string) => string
}

/** Chuyển trạng thái ở màn chi tiết (FR-MEM-06, 08); thứ tự nút cố định, chỉ hiện chuyển máy chủ cho phép. */
export const memberActionDisplay: Record<Exclude<MemberTransitionAction, 'APPROVE_PROBATION' | 'APPROVE_ACTIVE' | 'REJECT'>, ActionDisplay> = {
  CONFIRM: {
    label: 'Công nhận chính thức',
    variant: 'primary',
    dialogTitle: 'Công nhận thành viên chính thức',
    dialogDescription: 'Thành viên chuyển từ Thử việc sang Chính thức. Lý do được lưu vào lịch sử.',
    confirmLabel: 'Công nhận',
    success: (name) => `${name} đã là thành viên chính thức.`,
  },
  RETURN: {
    label: 'Cho quay lại',
    variant: 'primary',
    dialogTitle: 'Cho quay lại sinh hoạt',
    dialogDescription: 'Thành viên chuyển từ Tạm nghỉ về Chính thức, không phải gia nhập lại.',
    confirmLabel: 'Cho quay lại',
    success: (name) => `${name} đã quay lại sinh hoạt.`,
  },
  PUT_ON_LEAVE: {
    label: 'Cho tạm nghỉ',
    variant: 'outline',
    dialogTitle: 'Cho tạm nghỉ',
    dialogDescription: 'Người tạm nghỉ không được giao việc mới và không tính vào sĩ số điểm danh. Người đang giữ chức vụ thường trực thì phải thu hồi chức vụ trước.',
    confirmLabel: 'Cho tạm nghỉ',
    success: (name) => `${name} đã chuyển sang Tạm nghỉ.`,
  },
  REMOVE: {
    label: 'Đưa ra khỏi CLB',
    variant: 'destructive',
    dialogTitle: 'Đưa ra khỏi CLB',
    dialogDescription:
      'Mọi chức vụ và quyền của người này hết hiệu lực ngay. Công việc đang làm chuyển vào danh sách tồn đọng chờ gán lại; tên người cũ vẫn giữ trong lịch sử.',
    confirmLabel: 'Đưa ra khỏi CLB',
    success: (name) => `Đã đưa ${name} ra khỏi CLB.`,
  },
}

export type MemberDetailAction = keyof typeof memberActionDisplay

const DETAIL_ORDER: MemberDetailAction[] = ['CONFIRM', 'RETURN', 'PUT_ON_LEAVE', 'REMOVE']

export function memberDetailActions(allowed: MemberAction[]): MemberDetailAction[] {
  return DETAIL_ORDER.filter((action) => allowed.includes(action))
}

/** Mọi chuyển trạng thái bắt buộc lý do, trừ duyệt (FR-MEM-03, 06, 08). */
export function reasonRequired(action: MemberTransitionAction): boolean {
  return action !== 'APPROVE_PROBATION' && action !== 'APPROVE_ACTIVE'
}

/** Trạng thái sau khi duyệt theo thứ tự hiển thị; mặc định chọn mục đầu tiên (Thử việc nếu CLB có bước này). */
export function approvalTargets(allowed: MemberTransitionAction[]): Array<{ action: 'APPROVE_PROBATION' | 'APPROVE_ACTIVE'; status: MemberStatus }> {
  const targets: Array<{ action: 'APPROVE_PROBATION' | 'APPROVE_ACTIVE'; status: MemberStatus }> = [
    { action: 'APPROVE_PROBATION', status: 'PROBATION' },
    { action: 'APPROVE_ACTIVE', status: 'ACTIVE' },
  ]
  return targets.filter((target) => allowed.includes(target.action))
}

/** Dòng dưới tên ở sheet chi tiết: chức danh (nếu có), ban, trạng thái. */
export function memberSubtitle(member: Pick<MemberSummary, 'displayTitle' | 'department' | 'status'>): string {
  const parts = [member.displayTitle, member.department ? `Ban ${member.department.name}` : 'Chưa có ban', memberStatusDisplay[member.status].label]
  return parts.filter((part): part is string => Boolean(part)).join(' · ')
}

export const memberInfoFieldLabel: Record<MemberInfoField, string> = {
  displayTitle: 'Chức danh hiển thị',
  internalNote: 'Ghi chú nội bộ',
  studentId: 'MSSV',
  joinedOn: 'Ngày gia nhập',
}

const infoValue = (field: MemberInfoField, value: string | null) => {
  if (value === null || value === '') return '(trống)'
  return field === 'joinedOn' ? formatDate(value) : value
}

/** Một dòng lịch sử sửa thông tin (FR-MEM-05), ví dụ "Ngày gia nhập: 01/09/2025 → 15/09/2025". */
export function describeInfoChange(change: Pick<MemberInfoChange, 'field' | 'from' | 'to'>): { label: string; from: string; to: string } {
  return { label: memberInfoFieldLabel[change.field], from: infoValue(change.field, change.from), to: infoValue(change.field, change.to) }
}

/** Khoảng thời gian ở một ban chính, ví dụ "01/09/2025 – nay". */
export function stintRange(stint: Pick<DepartmentStint, 'fromOn' | 'toOn'>): string {
  return `${formatDate(stint.fromOn)} – ${stint.toOn ? formatDate(stint.toOn) : 'nay'}`
}

export const NO_OTHER_DEPARTMENT_HINT = 'CLB chưa có ban khác đang hoạt động; thêm ban ở trang Cơ cấu trước.'

export function transferSummary(names: string[], departmentName: string): string {
  return names.length === 1 ? `Đã chuyển ${names[0] ?? ''} sang Ban ${departmentName}.` : `Đã chuyển ${names.length} người sang Ban ${departmentName}.`
}

/** Câu báo lỗi chuyển ban kèm lý do của từng người nếu máy chủ trả theo dòng (FR-MEM-10). */
export function transferErrorLines(error: unknown): string[] {
  const lines = error instanceof ApiError ? error.fieldErrors.filter((fieldError) => fieldError.field.startsWith('members[')).map((fieldError) => fieldError.message) : []
  return [getErrorMessage(error), ...lines]
}

export const leaveRequestStatusDisplay: Record<LeaveRequestStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Chờ duyệt', tone: 'warning' },
  APPROVED: { label: 'Đã duyệt', tone: 'success' },
  REJECTED: { label: 'Bị từ chối', tone: 'danger' },
  WITHDRAWN: { label: 'Đã rút', tone: 'neutral' },
  CLOSED: { label: 'Đã đóng', tone: 'neutral' },
}

/** Nhóm khoản còn tồn khi xin rời (BR-MEM-03), theo thứ tự hiển thị. */
export const resignBlockerGroups: Array<{ kind: ResignBlocker['kind']; label: string }> = [
  { kind: 'POSITION', label: 'Chức vụ chưa kết thúc' },
  { kind: 'TASK', label: 'Việc bạn đang làm' },
  { kind: 'TASK_REVIEW', label: 'Việc bạn đã giao chưa kết thúc' },
  { kind: 'APPOINTMENT', label: 'Có tên trong kết quả bầu của nhiệm kỳ mới' },
]

/** Việc còn tồn thì mở được ở Công việc của tôi; chức vụ, kết quả bầu do ban chủ nhiệm xử lý nên không có liên kết. */
export function resignBlockerLink(blocker: ResignBlocker): string | null {
  return blocker.kind === 'TASK' || blocker.kind === 'TASK_REVIEW'
    ? `/me/tasks?task=${encodeURIComponent(blocker.refId)}&taskClub=${encodeURIComponent(blocker.clubId)}`
    : null
}

export function removalSummary(name: string, backlogCount: number | null): string {
  const base = memberActionDisplay.REMOVE.success(name)
  return backlogCount ? `${base} ${backlogCount} mục tồn đọng chờ gán lại.` : base
}
