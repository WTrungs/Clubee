export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh'

const VN_OFFSET = '+07:00'
const DAY_MS = 24 * 60 * 60 * 1000

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: VN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const weekdayFormatter = new Intl.DateTimeFormat('vi-VN', { timeZone: VN_TIME_ZONE, weekday: 'long' })

interface VnParts {
  day: string
  month: string
  year: string
  hour: string
  minute: string
}

/** Hiển thị thay cho ngày không hợp lệ, để dữ liệu lỗi không làm hỏng cả trang. */
export const INVALID_DATE_TEXT = '—'

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

function vnParts(value: string | Date): VnParts | null {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = partsFormatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return { day: get('day'), month: get('month'), year: get('year'), hour: get('hour'), minute: get('minute') }
}

/** Ngày dạng dd/mm/yyyy theo giờ Việt Nam (NFR-USA-03); chuỗi ngày không hợp lệ hiện dấu gạch. */
export function formatDate(value: string | Date): string {
  const parts = vnParts(value)
  return parts ? `${parts.day}/${parts.month}/${parts.year}` : INVALID_DATE_TEXT
}

/** Giờ dạng HH:mm theo giờ Việt Nam. */
export function formatTime(value: string | Date): string {
  const parts = vnParts(value)
  return parts ? `${parts.hour}:${parts.minute}` : INVALID_DATE_TEXT
}

/** Ngày giờ dạng dd/mm/yyyy HH:mm theo giờ Việt Nam. */
export function formatDateTime(value: string | Date): string {
  return vnParts(value) ? `${formatDate(value)} ${formatTime(value)}` : INVALID_DATE_TEXT
}

/** Ví dụ: "Thứ Hai, 02/11/2026". */
export function formatLongDate(value: string | Date): string {
  if (!vnParts(value)) return INVALID_DATE_TEXT
  const weekday = weekdayFormatter.format(toDate(value))
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${formatDate(value)}`
}

/** Ví dụ "18:00 – 21:00, 12/11/2026"; khoảng qua nhiều ngày ghi rõ cả hai ngày. */
export function formatTimeRange(startAt: string, endAt: string): string {
  if (toVnDateKey(startAt) === toVnDateKey(endAt)) return `${formatTime(startAt)} – ${formatTime(endAt)}, ${formatDate(startAt)}`
  return `${formatTime(startAt)} ${formatDate(startAt)} – ${formatTime(endAt)} ${formatDate(endAt)}`
}

/** Khóa ngày yyyy-mm-dd theo giờ Việt Nam, dùng để so sánh hai thời điểm có cùng ngày hay không. */
export function toVnDateKey(value: string | Date): string {
  const parts = vnParts(value)
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : ''
}

/** Số ngày lịch (theo giờ Việt Nam) từ `now` đến `value`; âm nếu đã qua, NaN nếu ngày không hợp lệ. */
export function daysUntil(value: string | Date, now: Date = new Date()): number {
  const target = Date.parse(`${toVnDateKey(value)}T00:00:00${VN_OFFSET}`)
  const today = Date.parse(`${toVnDateKey(now)}T00:00:00${VN_OFFSET}`)
  return Math.round((target - today) / DAY_MS)
}

/** Mô tả hạn ngắn gọn: "Hôm nay", "Còn 3 ngày", "Quá hạn 2 ngày". */
export function describeDueDate(value: string | Date, now: Date = new Date()): string {
  const days = daysUntil(value, now)
  if (Number.isNaN(days)) return INVALID_DATE_TEXT
  if (days === 0) return 'Hôm nay'
  if (days === 1) return 'Ngày mai'
  if (days > 1) return `Còn ${days} ngày`
  return `Quá hạn ${-days} ngày`
}

const DATE_INPUT = /^(\d{2})\/(\d{2})\/(\d{4})$/
const TIME_INPUT = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Ghép ô ngày, ô giờ (giờ Việt Nam) thành ISO 8601 có offset; trả null nếu sai định dạng hoặc ngày không tồn tại. */
export function parseVnDateTime(dateText: string, timeText: string): string | null {
  const dateMatch = DATE_INPUT.exec(dateText.trim())
  const timeMatch = TIME_INPUT.exec(timeText.trim())
  if (!dateMatch || !timeMatch) return null
  const [, day, month, year] = dateMatch
  const [, hour, minute] = timeMatch
  const iso = `${year}-${month}-${day}T${hour}:${minute}:00${VN_OFFSET}`
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  if (formatDate(parsed) !== `${day}/${month}/${year}`) return null
  return iso
}

/** Ô ngày dd/mm/yyyy thành ngày yyyy-mm-dd của API; trả null nếu sai định dạng hoặc ngày không tồn tại. */
export function parseVnDate(dateText: string): string | null {
  return parseVnDateTime(dateText, '00:00')?.slice(0, 10) ?? null
}
