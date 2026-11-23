import type { ReportPeriodKind } from '../model/reportPeriodTypes'

export const reportPeriodKindLabel: Record<ReportPeriodKind, string> = {
  MONTH: 'Tháng',
  SEMESTER: 'Học kỳ',
  TERM: 'Nhiệm kỳ',
  CUSTOM: 'Khoảng ngày',
}

/** Khoảng ngày tự chọn dài nhất, khớp với máy chủ. */
export const CUSTOM_MAX_YEARS = 5

export const REPORT_PERIOD_KINDS: ReportPeriodKind[] = ['MONTH', 'SEMESTER', 'TERM', 'CUSTOM']
