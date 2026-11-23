import { toVnDateKey } from '@/shared/format/formatDate'
import type { Tone } from '@/shared/ui/tone'
import type { CalendarItem, CalendarRelation } from '../model/calendarTypes'

const DAY_MS = 24 * 60 * 60 * 1000
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/
const pad = (value: number) => String(value).padStart(2, '0')
const dayKeyOfUtc = (epoch: number) => {
  const date = new Date(epoch)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** Tháng `yyyy-mm` theo giờ Việt Nam của một thời điểm. */
export const monthOf = (value: Date | string) => toVnDateKey(value).slice(0, 7)

export const isMonth = (value: string | null): value is string => value !== null && MONTH_PATTERN.test(value)

export function shiftMonth(month: string, by: number): string {
  const [year = 0, index = 1] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, index - 1 + by, 1))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`
}

export const monthLabel = (month: string) => `Tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)}`

/** Các ngày của lưới tháng, tuần bắt đầu thứ Hai; luôn đủ tuần (35 hoặc 42 ngày, không quá 62 ngày của API). */
export function monthGridDays(month: string): string[] {
  const [year = 0, index = 1] = month.split('-').map(Number)
  const first = Date.UTC(year, index - 1, 1)
  const last = Date.UTC(year, index, 0)
  const lead = (new Date(first).getUTCDay() + 6) % 7
  const trail = 6 - ((new Date(last).getUTCDay() + 6) % 7)
  const count = Math.round((last - first) / DAY_MS) + 1 + lead + trail
  return Array.from({ length: count }, (_, offset) => dayKeyOfUtc(first + (offset - lead) * DAY_MS))
}

export const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const

/** Các ngày (giờ Việt Nam) mà mục diễn ra; sự kiện nhiều ngày hiện ở mọi ngày, kết thúc đúng 00:00 thì không tính ngày đó. */
export function itemDays(item: Pick<CalendarItem, 'startAt' | 'endAt'>): string[] {
  const first = toVnDateKey(item.startAt)
  const last = toVnDateKey(new Date(Math.max(Date.parse(item.endAt) - 1, Date.parse(item.startAt))))
  const days = [first]
  while ((days.at(-1) ?? last) < last && days.length < 31) days.push(dayKeyOfUtc(Date.parse(`${days.at(-1)}T00:00:00Z`) + DAY_MS))
  return days
}

/** Gom mục theo ngày, giữ thứ tự giờ bắt đầu máy chủ đã sắp. */
export function itemsByDay(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const byDay = new Map<string, CalendarItem[]>()
  for (const item of items) {
    for (const day of itemDays(item)) byDay.set(day, [...(byDay.get(day) ?? []), item])
  }
  return byDay
}

export const relationDisplay: Record<CalendarRelation, { label: string; tone: Tone }> = {
  REGISTERED: { label: 'Đã nhận chỗ', tone: 'success' },
  WAITLISTED: { label: 'Đang chờ chỗ', tone: 'warning' },
  STAFF: { label: 'Ban tổ chức', tone: 'progress' },
  CREATOR: { label: 'Bạn tạo', tone: 'info' },
  AUDIENCE: { label: 'Trong phạm vi', tone: 'neutral' },
  OPEN: { label: 'Đang mở đăng ký', tone: 'info' },
}

export const itemPath = (item: Pick<CalendarItem, 'type' | 'clubId' | 'id'>) =>
  `/clubs/${encodeURIComponent(item.clubId)}/${item.type === 'SESSION' ? 'sessions' : 'events'}/${encodeURIComponent(item.id)}`

export const itemKindLabel = (item: Pick<CalendarItem, 'type'>) => (item.type === 'SESSION' ? 'Sinh hoạt' : 'Sự kiện')
