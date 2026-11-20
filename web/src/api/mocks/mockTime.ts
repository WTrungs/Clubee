const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const VN_SHIFT_MS = 7 * HOUR_MS

const pad = (value: number) => String(value).padStart(2, '0')

/** Chuỗi ISO có offset +07:00 cho một mốc thời gian, giống định dạng máy chủ trả về. */
export function toVnIso(epochMs: number): string {
  const shifted = new Date(epochMs + VN_SHIFT_MS)
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}+07:00`
}

export function nowIso(): string {
  return toVnIso(Date.now())
}

/** Cộng trừ một số ngày (24 giờ) trên mốc thời gian ISO, ví dụ hạn lời mời tính từ lúc tạo. */
export function addDays(iso: string, days: number): string {
  return toVnIso(Date.parse(iso) + days * DAY_MS)
}

/** Mốc 00:00 giờ Việt Nam của ngày chứa thời điểm cho trước. */
export function vnStartOfDay(epochMs: number = Date.now()): number {
  return Math.floor((epochMs + VN_SHIFT_MS) / DAY_MS) * DAY_MS - VN_SHIFT_MS
}

/** Thời điểm cách hôm nay (giờ Việt Nam) một số ngày, ở giờ:phút cho trước; dùng để dữ liệu mẫu luôn mới. */
export function vnDayAt(daysFromToday: number, hour: number, minute = 0): string {
  const startOfTodayVn = vnStartOfDay()
  return toVnIso(startOfTodayVn + daysFromToday * DAY_MS + hour * HOUR_MS + minute * 60 * 1000)
}

/** Ngày yyyy-mm-dd theo giờ Việt Nam, cách hôm nay một số ngày. */
export function vnDate(daysFromToday: number): string {
  return vnDayAt(daysFromToday, 0).slice(0, 10)
}

export function vnToday(): string {
  return vnDate(0)
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Ngày yyyy-mm-dd có thật; bộ đọc ngày của JS nhận cả 2004-02-31 (thành 02/03) và ném lỗi với tháng 13, nên kiểm cả hai. */
export function isRealDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Cộng trừ ngày trên chuỗi yyyy-mm-dd. */
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}
