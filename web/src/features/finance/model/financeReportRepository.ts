import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type { FinanceReport, FinanceReportQuery, ReportPeriods, UnpaidDuesQuery, UnpaidDuesRow } from './financeReportTypes'

const report = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}/finance-report`

/** FR-FIN-12: báo cáo thu chi. */
export const financeReportRepository = {
  periods: (clubId: string) => httpClient.get<ReportPeriods>(`${report(clubId)}/periods`),
  get: (clubId: string, query: FinanceReportQuery) =>
    httpClient.get<FinanceReport>(report(clubId), {
      query: { period: query.period, key: query.key, from: query.from, to: query.to, category: query.category, eventId: query.eventId },
    }),
  unpaidDues: (clubId: string, query: UnpaidDuesQuery) =>
    httpClient.get<Page<UnpaidDuesRow>>(`${report(clubId)}/unpaid-dues`, { query: { campaignId: query.campaignId, page: query.page, size: query.size } }),
}
