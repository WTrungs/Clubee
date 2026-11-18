import type { ReportPeriodKind } from '../model/financeReportTypes'

export const reportPeriodKindLabel: Record<ReportPeriodKind, string> = {
  MONTH: 'Tháng',
  SEMESTER: 'Học kỳ',
  TERM: 'Nhiệm kỳ',
  CUSTOM: 'Khoảng ngày',
}

/** Khoảng ngày tự chọn dài nhất, khớp với máy chủ. */
export const CUSTOM_MAX_YEARS = 5

export const REPORT_PERIOD_KINDS: ReportPeriodKind[] = ['MONTH', 'SEMESTER', 'TERM', 'CUSTOM']

/** `yyyy-mm` thành `mm/yyyy`. */
export const reportMonthLabel = (month: string) => `${month.slice(5, 7)}/${month.slice(0, 4)}`

/** Tỉ lệ phần trăm làm tròn, 0 khi tổng bằng 0. */
export function reportShare(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

/** Chênh lệch có dấu: dương là thu nhiều hơn chi. */
export function netText(net: number, format: (amount: number) => string): string {
  if (net > 0) return `+${format(net)}`
  if (net < 0) return `−${format(-net)}`
  return format(0)
}
