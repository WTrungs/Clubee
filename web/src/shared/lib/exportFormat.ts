/** FR-RPT-07: báo cáo xuất được Excel hoặc PDF. */
export type ExportFormat = 'xlsx' | 'pdf'

export const EXPORT_FORMATS: Array<{ value: ExportFormat; label: string }> = [
  { value: 'xlsx', label: 'Excel (.xlsx)' },
  { value: 'pdf', label: 'PDF' },
]
