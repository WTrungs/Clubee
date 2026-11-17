import { formatDate, formatDateTime, formatTime } from '@/shared/format/formatDate'
import type { Tone } from '@/shared/ui/tone'
import type { AttendanceCounts, AttendanceFilter, AttendanceSheet, AttendanceStatus } from '../model/attendanceTypes'

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['PRESENT', 'LATE', 'EXCUSED', 'ABSENT']

export const attendanceStatusDisplay: Record<AttendanceStatus, { label: string; short: string; tone: Tone }> = {
  PRESENT: { label: 'Có mặt', short: 'Có mặt', tone: 'success' },
  LATE: { label: 'Đi muộn', short: 'Muộn', tone: 'warning' },
  EXCUSED: { label: 'Vắng có phép', short: 'Phép', tone: 'info' },
  ABSENT: { label: 'Vắng không phép', short: 'Vắng', tone: 'danger' },
}

/** Nhóm lọc kèm số đếm; cũng là phần tóm tắt của danh sách. */
export function attendanceFilters(counts: AttendanceCounts): Array<{ value: AttendanceFilter | ''; label: string; count: number }> {
  return [
    { value: '', label: 'Tất cả', count: counts.expected + counts.extra },
    { value: 'UNMARKED', label: 'Chưa điểm danh', count: counts.unmarked },
    { value: 'PRESENT', label: 'Có mặt', count: counts.present },
    { value: 'LATE', label: 'Đi muộn', count: counts.late },
    { value: 'EXCUSED', label: 'Vắng có phép', count: counts.excused },
    { value: 'ABSENT', label: 'Vắng không phép', count: counts.absent },
    { value: 'EXTRA', label: 'Phát sinh', count: counts.extra },
  ]
}

export type AttendanceWindow = 'NOT_OPEN' | 'OPEN' | 'CLOSED' | 'READ_ONLY'

export function attendanceWindow(sheet: Pick<AttendanceSheet, 'opensAt' | 'closedAt' | 'readOnlyReason'>, now: number): AttendanceWindow {
  if (sheet.readOnlyReason) return 'READ_ONLY'
  if (sheet.closedAt) return 'CLOSED'
  return now < Date.parse(sheet.opensAt) ? 'NOT_OPEN' : 'OPEN'
}

/** Câu báo trên đầu danh sách theo khung điểm danh (BR-ATT-02). */
export function attendanceNotice(sheet: Pick<AttendanceSheet, 'opensAt' | 'closedAt' | 'closedBy' | 'readOnlyReason'>, now: number): string {
  switch (attendanceWindow(sheet, now)) {
    case 'READ_ONLY':
      return sheet.readOnlyReason ?? ''
    case 'CLOSED':
      return `Đã chốt lúc ${formatDateTime(sheet.closedAt ?? '')}${sheet.closedBy ? ` bởi ${sheet.closedBy.fullName}` : ''}. Danh sách chỉ xem được.`
    case 'NOT_OPEN':
      return `Điểm danh mở lúc ${formatTime(sheet.opensAt)}, ${formatDate(sheet.opensAt)}.`
    case 'OPEN':
      return 'Đang mở điểm danh. Khi chốt, người chưa có trạng thái được ghi Vắng không phép.'
  }
}

/** Nội dung hộp xác nhận chốt, nêu số người sắp bị ghi Vắng không phép. */
export function closeConfirmText(counts: Pick<AttendanceCounts, 'unmarked'>): string {
  const after = 'Sau khi chốt, danh sách chỉ xem được.'
  if (counts.unmarked === 0) return `Mọi người trong danh sách đã có trạng thái. ${after}`
  return `${counts.unmarked} người chưa điểm danh sẽ được ghi Vắng không phép. ${after}`
}

/** Số giây còn lại tới mốc `expiresAt` (mili giây), làm tròn lên và không âm. */
export function secondsLeft(expiresAt: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAt - now) / 1000))
}

/** Số người đã có mặt (gồm đi muộn) trên số cần có mặt, để người chiếu mã theo dõi lúc quét. */
export function qrProgressText(counts: Pick<AttendanceCounts, 'present' | 'late' | 'unmarked'>): string {
  return `${counts.present + counts.late} người có mặt · ${counts.unmarked} người chưa điểm danh`
}

/** Nhãn ngày của sự kiện nhiều ngày, ví dụ "Ngày 2 · 08/11". */
export function dayLabel(day: string, index: number): string {
  const [, month, date] = day.split('-')
  return `Ngày ${index + 1} · ${date}/${month}`
}
