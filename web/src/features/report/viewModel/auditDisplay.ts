import type { MemberStatus } from '@/features/account/model/accountTypes'
import { memberStatusDisplay } from '@/features/account/viewModel/memberStatus'
import type { AttendanceStatus } from '@/features/attendance/model/attendanceTypes'
import { attendanceStatusDisplay } from '@/features/attendance/viewModel/attendanceDisplay'
import type { TransactionStatus } from '@/features/finance/model/financeTypes'
import { transactionStatusDisplay } from '@/features/finance/viewModel/financeDisplay'
import type { HandoverItemStatus } from '@/features/term/model/handoverTypes'
import { handoverItemStatusDisplay } from '@/features/term/viewModel/handoverDisplay'
import type { ClubStatus } from '@/features/club/model/clubTypes'
import { clubStatusDisplay } from '@/features/club/viewModel/clubStatusDisplay'
import { formatDate } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import type { AuditLogEntry, AuditObjectType } from '../model/auditLogTypes'

export const auditObjectTypeLabel: Record<AuditObjectType, string> = {
  MEMBERSHIP: 'Tư cách thành viên',
  POSITION: 'Chức vụ',
  PERMISSION: 'Phân quyền',
  TRANSACTION: 'Giao dịch quỹ',
  ATTENDANCE: 'Điểm danh',
  TERM: 'Nhiệm kỳ',
  HANDOVER_ITEM: 'Mục bàn giao',
  TRANSFER_REQUEST: 'Chuyển quyền Chủ nhiệm',
  CLUB: 'Thông tin CLB',
  ACCOUNT: 'Tài khoản',
}

export const AUDIT_OBJECT_TYPES = Object.keys(auditObjectTypeLabel) as AuditObjectType[]

const actionLabels: Record<string, string> = {
  GRANT_POSITION: 'Gán chức vụ',
  END_POSITION: 'Kết thúc chức vụ',
  CHANGE_MEMBER_STATUS: 'Đổi trạng thái thành viên',
  CREATE_TRANSACTION: 'Tạo giao dịch',
  CHANGE_TRANSACTION_STATUS: 'Đổi trạng thái giao dịch',
  CHANGE_PERMISSION: 'Đổi quyền',
  RESET_PERMISSION: 'Đặt lại quyền mặc định',
  ATTENDANCE_EDIT: 'Sửa điểm danh sau khi chốt',
  TERM_EXTEND: 'Gia hạn nhiệm kỳ',
  HANDOVER_SUBSTITUTE_CONFIRM: 'Xác nhận thay mục bàn giao',
  VIEW_TRANSFER_CANDIDATES: 'Xem ứng viên chuyển quyền',
  APPROVE_PRESIDENCY_TRANSFER: 'Duyệt chuyển quyền Chủ nhiệm',
  REJECT_PRESIDENCY_TRANSFER: 'Từ chối chuyển quyền Chủ nhiệm',
  LOCK_ACCOUNT: 'Khóa tài khoản',
  UNLOCK_ACCOUNT: 'Mở khóa tài khoản',
  SEND_PASSWORD_RESET: 'Gửi đặt lại mật khẩu',
  CHANGE_CLUB_STATUS: 'Đổi trạng thái CLB',
}

/** Thao tác chưa có nhãn thì hiện mã để không mất thông tin. */
export const auditActionLabel = (action: string) => actionLabels[action] ?? action

const fieldLabels: Record<string, string> = {
  status: 'Trạng thái',
  startOn: 'Từ ngày',
  endOn: 'Đến ngày',
  enabled: 'Được phép',
  amount: 'Số tiền',
  eventLead: 'Trưởng BTC giữ lại',
  movedPositions: 'Số chức vụ được dời',
  presidents: 'Chủ nhiệm',
}
/** Trường kỹ thuật, không có ý nghĩa với người đọc. */
const HIDDEN_FIELDS = new Set(['positionIds'])
const PERSON_FIELDS = new Set(['eventLead', 'presidents'])
const NO_END = '9999-12-31'
const transferStatusLabel: Record<string, string> = { PENDING: 'Chờ xử lý', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối' }

function statusLabel(objectType: AuditObjectType, value: string): string {
  if (objectType === 'MEMBERSHIP') return memberStatusDisplay[value as MemberStatus]?.label ?? value
  if (objectType === 'TRANSACTION') return transactionStatusDisplay[value as TransactionStatus]?.label ?? value
  if (objectType === 'ATTENDANCE') return attendanceStatusDisplay[value as AttendanceStatus]?.label ?? value
  if (objectType === 'HANDOVER_ITEM') return handoverItemStatusDisplay[value as HandoverItemStatus]?.label ?? value
  if (objectType === 'TRANSFER_REQUEST') return transferStatusLabel[value] ?? value
  if (objectType === 'CLUB') return clubStatusDisplay[value as ClubStatus]?.label ?? value
  return value
}

/** Một giá trị trước hoặc sau, đọc được: trạng thái theo loại đối tượng, tiền, ngày, họ tên. */
export function formatAuditValue(entry: Pick<AuditLogEntry, 'objectType' | 'names'>, field: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.map((item) => formatAuditValue(entry, field, item)).join(', ')
  if (typeof value === 'boolean') return value ? 'Có' : 'Không'
  if (PERSON_FIELDS.has(field) && typeof value === 'string') return entry.names[value] ?? value
  if (field === 'status' && typeof value === 'string') return statusLabel(entry.objectType, value)
  if (field === 'amount' && typeof value === 'number') return formatMoney(value)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value === NO_END ? 'Không thời hạn' : formatDate(`${value}T12:00:00+07:00`)
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return JSON.stringify(value)
}

export interface AuditChange {
  field: string
  label: string
  before: string
  after: string
}

/** Từng trường trước → sau, theo thứ tự xuất hiện; bỏ trường kỹ thuật. */
export function auditChanges(entry: Pick<AuditLogEntry, 'objectType' | 'names' | 'before' | 'after'>): AuditChange[] {
  const fields = [...new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})])].filter((field) => !HIDDEN_FIELDS.has(field))
  return fields.map((field) => ({
    field,
    label: fieldLabels[field] ?? field,
    before: formatAuditValue(entry, field, entry.before?.[field]),
    after: formatAuditValue(entry, field, entry.after?.[field]),
  }))
}
