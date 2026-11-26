import { httpClient } from '@/api/httpClient'
import type { ExportFormat } from '@/shared/lib/exportFormat'
import type { ClubReport, ClubReportQuery, DepartmentReport, ReportDepartmentOption } from './clubReportTypes'
import type { ReportPeriods } from './reportPeriodTypes'

const club = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}`
const periodParams = (query: ClubReportQuery) => ({ period: query.period, key: query.key, from: query.from, to: query.to })

export const clubReportRepository = {
  periods: (clubId: string) => httpClient.get<ReportPeriods>(`${club(clubId)}/report-periods`),
  departments: (clubId: string) => httpClient.get<ReportDepartmentOption[]>(`${club(clubId)}/report-departments`),
  clubReport: (clubId: string, query: ClubReportQuery) => httpClient.get<ClubReport>(`${club(clubId)}/club-report`, { query: periodParams(query) }),
  departmentReport: (clubId: string, departmentId: string, query: ClubReportQuery) =>
    httpClient.get<DepartmentReport>(`${club(clubId)}/departments/${encodeURIComponent(departmentId)}/report`, { query: periodParams(query) }),
  /** FR-RPT-07: tệp do máy chủ sinh, cùng kỳ với báo cáo đang xem. */
  exportClubReport: (clubId: string, query: ClubReportQuery, format: ExportFormat) =>
    httpClient.download(`${club(clubId)}/club-report/export`, { query: { ...periodParams(query), format } }),
  exportDepartmentReport: (clubId: string, departmentId: string, query: ClubReportQuery, format: ExportFormat) =>
    httpClient.download(`${club(clubId)}/departments/${encodeURIComponent(departmentId)}/report/export`, { query: { ...periodParams(query), format } }),
}
