import { useQuery } from '@tanstack/react-query'
import { eventRepository } from '../model/eventRepository'
import type { EventStaffStats, TaskProgressCounts } from '../model/eventTypes'
import { eventQueryKeys } from './eventQueryKeys'
import { useFileDownload } from '@/shared/hooks/useFileDownload'
import type { ExportFormat } from '@/shared/lib/exportFormat'

/** Phần trăm việc Hoàn thành, làm tròn xuống để 99,6% không hiện thành 100% khi còn việc dở; không có việc thì null. */
export function donePercent(counts: Pick<TaskProgressCounts, 'total' | 'done'>): number | null {
  if (counts.total === 0) return null
  return Math.floor((counts.done / counts.total) * 100)
}

/** Câu tóm tắt một tiểu ban, ví dụ "3/5 việc hoàn thành · 1 quá hạn". */
export function progressSummary(counts: TaskProgressCounts): string {
  if (counts.total === 0) return 'Chưa có việc'
  const overdue = counts.overdue > 0 ? ` · ${counts.overdue} quá hạn` : ''
  return `${counts.done}/${counts.total} việc hoàn thành${overdue}`
}

export const capacityLabel = (capacity: number | null) => (capacity === null ? 'Không giới hạn' : String(capacity))

/** Vai trò trong BTC, kèm tiểu ban; CTV và nhân sự CLB đồng tổ chức ghi rõ loại. */
export function staffRoleLabel(row: Pick<EventStaffStats, 'role' | 'subcommitteeName'>): string {
  if (row.role === 'LEAD') return 'Trưởng BTC'
  const place = row.subcommitteeName ? `Tiểu ban ${row.subcommitteeName}` : 'Chưa vào tiểu ban'
  if (row.role === 'COLLABORATOR') return `CTV · ${place}`
  if (row.role === 'CO_HOST') return `CLB đồng tổ chức · ${place}`
  return place
}

/** Số ngày Có mặt hoặc Đi muộn trên số ngày của sự kiện; chưa có điểm danh thì nói rõ. */
export const presentDaysLabel = (row: Pick<EventStaffStats, 'presentDays' | 'days'>) => (row.days === 0 ? 'Chưa mở điểm danh' : `${row.presentDays}/${row.days} ngày`)

/** FR-RPT-05: báo cáo sự kiện; phần nào máy chủ trả null là người xem không có quyền xem phần đó. */
export function useEventReportViewModel(clubId: string, eventId: string) {
  const report = useQuery({ queryKey: eventQueryKeys.report(clubId, eventId), queryFn: () => eventRepository.report(clubId, eventId) })
  const exporter = useFileDownload('bao-cao-su-kien')
  return {
    /** FR-RPT-07. */
    exportReport: (format: ExportFormat) => exporter.download(() => eventRepository.exportReport(clubId, eventId, format)),
    exporting: exporter.pending,
    report: report.data ?? null,
    loading: report.isPending,
    error: report.error,
    refetch: () => void report.refetch(),
  }
}
