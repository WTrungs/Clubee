import { formatMoney } from '@/shared/format/formatMoney'

/** Khoảng giá trị hợp lệ của tham số CLB (FR-CLB-03, SRS 9.2), dùng chung cho form web và mock. */
export const CLUB_SETTING_LIMITS = {
  inviteLinkDays: { min: 1, max: 30 },
  attendanceLeadMinutes: { min: 0, max: 120 },
  attendanceQrRotateSeconds: { min: 10, max: 300 },
  expenseReceiptThreshold: { min: 0, max: 100_000_000 },
  registrationCancelHours: { min: 0, max: 168 },
  rescheduleConfirmHours: { min: 1, max: 168 },
  taskReminderDays: { min: 0, max: 14 },
  advanceSettleDays: { min: 1, max: 90 },
} as const

export type NumericClubSetting = keyof typeof CLUB_SETTING_LIMITS

export const NUMERIC_CLUB_SETTINGS = Object.keys(CLUB_SETTING_LIMITS) as NumericClubSetting[]

export function inRange(setting: NumericClubSetting, value: unknown): value is number {
  const { min, max } = CLUB_SETTING_LIMITS[setting]
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

const range = (setting: NumericClubSetting, unit: string) => `từ ${CLUB_SETTING_LIMITS[setting].min} đến ${CLUB_SETTING_LIMITS[setting].max} ${unit}`

export const CLUB_SETTING_MESSAGES: Record<NumericClubSetting, string> = {
  inviteLinkDays: `Hạn liên kết mời ${range('inviteLinkDays', 'ngày')}.`,
  attendanceLeadMinutes: `Mở điểm danh trước giờ ${range('attendanceLeadMinutes', 'phút')}.`,
  attendanceQrRotateSeconds: `Chu kỳ đổi mã ${range('attendanceQrRotateSeconds', 'giây')}.`,
  expenseReceiptThreshold: `Ngưỡng chứng từ từ ${formatMoney(CLUB_SETTING_LIMITS.expenseReceiptThreshold.min)} đến ${formatMoney(CLUB_SETTING_LIMITS.expenseReceiptThreshold.max)}.`,
  registrationCancelHours: `Hạn hủy đăng ký ${range('registrationCancelHours', 'giờ')} trước giờ bắt đầu.`,
  rescheduleConfirmHours: `Hạn xác nhận lại ${range('rescheduleConfirmHours', 'giờ')}.`,
  taskReminderDays: `Nhắc hạn công việc ${range('taskReminderDays', 'ngày')} trước hạn.`,
  advanceSettleDays: `Hạn quyết toán tạm ứng ${range('advanceSettleDays', 'ngày')}.`,
}

export type SemesterField = 'semester1Start' | 'semester2Start' | 'summerStart'

export const SEMESTER_MESSAGES = {
  invalid: 'Nhập ngày có thật dạng ngày/tháng, ví dụ 01/09.',
  duplicate: 'Các mốc học kỳ phải khác nhau.',
  summerOrder: 'Kỳ hè phải bắt đầu sau học kỳ 2 và trước học kỳ 1 năm sau.',
} as const

/** Số ngày mỗi tháng của năm không nhuận; mốc 29/02 không lặp lại hằng năm nên không nhận. */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Mốc học kỳ lưu dạng `MM-DD`, ví dụ `09-01`. */
export function isMonthDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{2}-\d{2}$/.test(value)) return false
  const [month = 0, day = 0] = value.split('-').map(Number)
  return month >= 1 && month <= 12 && day >= 1 && day <= (DAYS_IN_MONTH[month - 1] ?? 0)
}

/** Thứ tự trong năm của một mốc `MM-DD` hợp lệ, tính từ 0. */
export function dayOfYear(monthDay: string): number {
  const [month = 1, day = 1] = monthDay.split('-').map(Number)
  return DAYS_IN_MONTH.slice(0, month - 1).reduce((sum, days) => sum + days, 0) + day - 1
}

/** Mốc dạng `MM-DD` thành `dd/mm` để hiện cho người dùng. */
export const formatMonthDay = (monthDay: string) => `${monthDay.slice(3, 5)}/${monthDay.slice(0, 2)}`

/** Nhận `d/m`, `dd/mm` (dấu `/`, `-` hoặc `.`); sai thì trả null. */
export function parseMonthDay(text: string): string | null {
  const match = /^(\d{1,2})[/.-](\d{1,2})$/.exec(text.trim())
  if (!match) return null
  const monthDay = `${(match[2] ?? '').padStart(2, '0')}-${(match[1] ?? '').padStart(2, '0')}`
  return isMonthDay(monthDay) ? monthDay : null
}

/** Ba mốc chia năm theo vòng HK1 → HK2 → hè (nếu có) → HK1 năm sau; trả lỗi theo ô cho cả form và máy chủ. */
export function semesterErrors(values: Record<SemesterField, unknown>): Array<{ field: SemesterField; message: string }> {
  const { semester1Start, semester2Start, summerStart } = values
  const errors: Array<{ field: SemesterField; message: string }> = []
  if (!isMonthDay(semester1Start)) errors.push({ field: 'semester1Start', message: SEMESTER_MESSAGES.invalid })
  if (!isMonthDay(semester2Start)) errors.push({ field: 'semester2Start', message: SEMESTER_MESSAGES.invalid })
  if (summerStart !== null && !isMonthDay(summerStart)) errors.push({ field: 'summerStart', message: SEMESTER_MESSAGES.invalid })
  if (errors.length > 0 || !isMonthDay(semester1Start) || !isMonthDay(semester2Start)) return errors
  if (semester1Start === semester2Start) return [{ field: 'semester2Start', message: SEMESTER_MESSAGES.duplicate }]
  if (!isMonthDay(summerStart)) return []
  if (summerStart === semester1Start || summerStart === semester2Start) return [{ field: 'summerStart', message: SEMESTER_MESSAGES.duplicate }]
  const offset = (monthDay: string) => (dayOfYear(monthDay) - dayOfYear(semester1Start) + 365) % 365
  return offset(semester2Start) < offset(summerStart) ? [] : [{ field: 'summerStart', message: SEMESTER_MESSAGES.summerOrder }]
}
