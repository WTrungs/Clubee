import { httpClient } from '@/api/httpClient'
import type { ExportFormat } from '@/shared/lib/exportFormat'
import type { ReportPeriods } from './reportPeriodTypes'
import type { ClubHistoryEntry, MyAttendancePage, MyAttendanceQuery, MyReport, MyReportQuery } from './myReportTypes'

const periodParams = (query: MyReportQuery) => ({ clubId: query.clubId, period: query.period, key: query.key, from: query.from, to: query.to })

export const myReportRepository = {
  clubHistory: () => httpClient.get<ClubHistoryEntry[]>('/me/club-history'),
  periods: (clubId: string) => httpClient.get<ReportPeriods>('/me/report-periods', { query: { clubId } }),
  report: (query: MyReportQuery) => httpClient.get<MyReport>('/me/report', { query: periodParams(query) }),
  exportReport: (query: MyReportQuery, format: ExportFormat) => httpClient.download('/me/report/export', { query: { ...periodParams(query), format } }),
  attendance: (query: MyAttendanceQuery) => httpClient.get<MyAttendancePage>('/me/attendance', { query: { ...periodParams(query), page: query.page, size: query.size } }),
}
