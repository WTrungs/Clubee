/** Loại kỳ báo cáo (FR-FIN-12, FR-RPT-02..04): tháng, học kỳ theo mốc CLB khai, nhiệm kỳ, hoặc khoảng ngày tự chọn. */
export type ReportPeriodKind = 'MONTH' | 'SEMESTER' | 'TERM' | 'CUSTOM'

export interface ReportPeriodOption {
  kind: Exclude<ReportPeriodKind, 'CUSTOM'>
  /** `yyyy-mm` với tháng, `yyyy-S1`, `yyyy-S2`, `yyyy-SUMMER` với học kỳ (năm bắt đầu năm học), mã nhiệm kỳ với nhiệm kỳ. */
  key: string
  label: string
  /** yyyy-mm-dd. */
  from: string
  to: string
}

export interface ReportPeriods {
  months: ReportPeriodOption[]
  semesters: ReportPeriodOption[]
  terms: ReportPeriodOption[]
}

/** Tham số kỳ gửi lên các route báo cáo. */
export interface ReportPeriodQuery {
  period: ReportPeriodKind
  key?: string
  from?: string
  to?: string
}

/** Kỳ máy chủ đã hiểu, trả kèm báo cáo. */
export interface ReportRange {
  label: string
  from: string
  to: string
}
