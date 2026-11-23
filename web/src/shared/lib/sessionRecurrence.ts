/** FR-ATT-02: luật sinh chuỗi buổi lặp, dùng chung cho mock và ô xem trước của form. */
export type RecurrenceFrequency = 'WEEKLY' | 'MONTHLY'

export const SERIES_MAX_SESSIONS = 52
/** Ngày cuối chuỗi cách buổi đầu tối đa chừng này ngày (khoảng một năm). */
export const SERIES_MAX_DAYS = 366

const DAY_MS = 24 * 60 * 60 * 1000
const VN_SHIFT_MS = 7 * 60 * 60 * 1000
const pad = (value: number) => String(value).padStart(2, '0')
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const dayEpoch = (day: string) => Date.parse(`${day}T00:00:00Z`)
const dayOf = (epoch: number) => {
  const date = new Date(epoch)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}
const isRealDay = (day: string) => DAY_PATTERN.test(day) && !Number.isNaN(dayEpoch(day)) && dayOf(dayEpoch(day)) === day

/** Ngày yyyy-mm-dd theo giờ Việt Nam của một mốc ISO. */
export const vnDayOf = (iso: string) => dayOf(Date.parse(iso) + VN_SHIFT_MS)

/** Dời mốc ISO một số ngày, giữ giờ Việt Nam; Việt Nam không đổi giờ theo mùa nên mỗi ngày đúng 24 giờ. */
export function shiftVnIso(iso: string, days: number): string {
  const date = new Date(Date.parse(iso) + days * DAY_MS + VN_SHIFT_MS)
  return `${dayOf(date.getTime())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}+07:00`
}

/** Các ngày diễn ra, buổi đầu là `firstDay`; lặp tháng bỏ tháng không có ngày đó (ví dụ ngày 31). Không cắt ở giới hạn số buổi. */
export function recurrenceDays(firstDay: string, frequency: RecurrenceFrequency, until: string): string[] {
  if (!isRealDay(firstDay) || !isRealDay(until) || until < firstDay) return []
  const days: string[] = []
  if (frequency === 'WEEKLY') {
    for (let day = firstDay; day <= until && days.length <= SERIES_MAX_SESSIONS; day = dayOf(dayEpoch(day) + 7 * DAY_MS)) days.push(day)
    return days
  }
  const [year = 0, month = 1, date = 1] = firstDay.split('-').map(Number)
  for (let offset = 0; days.length <= SERIES_MAX_SESSIONS; offset += 1) {
    const candidate = new Date(Date.UTC(year, month - 1 + offset, date))
    // Tháng thiếu ngày đó thì Date tự tràn sang tháng sau; bỏ tháng đó.
    if (candidate.getUTCDate() !== date) continue
    const day = dayOf(candidate.getTime())
    if (day > until) break
    days.push(day)
  }
  return days
}

/** Lý do chuỗi chưa hợp lệ, hoặc null. `until` là yyyy-mm-dd. */
export function recurrenceError(firstDay: string, frequency: RecurrenceFrequency, until: string): string | null {
  if (!isRealDay(until)) return 'Ngày kết thúc chuỗi không hợp lệ.'
  if (until <= firstDay) return 'Ngày kết thúc chuỗi phải sau ngày của buổi đầu.'
  if (dayEpoch(until) - dayEpoch(firstDay) > SERIES_MAX_DAYS * DAY_MS) return 'Chuỗi kéo dài tối đa một năm.'
  const count = recurrenceDays(firstDay, frequency, until).length
  if (count < 2) return 'Chuỗi cần ít nhất 2 buổi; chọn ngày kết thúc xa hơn.'
  if (count > SERIES_MAX_SESSIONS) return `Một chuỗi tối đa ${SERIES_MAX_SESSIONS} buổi.`
  return null
}

export interface SessionTimes {
  startAt: string
  endAt: string
  registrationDeadline: string | null
}

/** Giờ của từng buổi: giữ giờ, độ dài và độ lệch của hạn đăng ký như buổi đầu. */
export function seriesTimes(first: SessionTimes, days: string[]): SessionTimes[] {
  const firstDay = vnDayOf(first.startAt)
  return days.map((day) => {
    const offset = Math.round((dayEpoch(day) - dayEpoch(firstDay)) / DAY_MS)
    return {
      startAt: shiftVnIso(first.startAt, offset),
      endAt: shiftVnIso(first.endAt, offset),
      registrationDeadline: first.registrationDeadline ? shiftVnIso(first.registrationDeadline, offset) : null,
    }
  })
}
