import { formatDate } from '@/shared/format/formatDate'

/** FR-TERM-02: mỗi lần gia hạn dời ngày kết thúc tối đa chừng này ngày. */
export const TERM_EXTENSION_MAX_DAYS = 365

const DAY_MS = 86_400_000
const toEpochDay = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / DAY_MS

/** Số ngày từ `from` tới `to`, cả hai dạng yyyy-mm-dd. */
export function daysBetween(from: string, to: string): number {
  return toEpochDay(to) - toEpochDay(from)
}

/** Ngày kết thúc mới phải sau ngày cũ, sau hôm nay và không dời quá giới hạn; null là hợp lệ. Mock và form dùng chung. */
export function termExtensionProblem(currentEndOn: string, newEndOn: string, today: string): string | null {
  if (newEndOn <= currentEndOn) return `Ngày kết thúc mới phải sau ngày kết thúc hiện tại (${formatDate(currentEndOn)}).`
  if (newEndOn <= today) return 'Ngày kết thúc mới phải sau hôm nay.'
  if (daysBetween(currentEndOn, newEndOn) > TERM_EXTENSION_MAX_DAYS) return `Mỗi lần gia hạn dời tối đa ${TERM_EXTENSION_MAX_DAYS} ngày so với ngày kết thúc hiện tại.`
  return null
}
