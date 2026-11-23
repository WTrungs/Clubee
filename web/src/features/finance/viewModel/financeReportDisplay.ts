export { CUSTOM_MAX_YEARS, REPORT_PERIOD_KINDS, reportPeriodKindLabel } from '@/features/report/viewModel/reportPeriodDisplay'

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
