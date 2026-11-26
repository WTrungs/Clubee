import type { AdvanceQuery } from '../model/advanceTypes'
import type { DuesCampaignQuery, DuesItemQuery } from '../model/duesTypes'
import type { FinanceReportQuery, UnpaidDuesQuery } from '../model/financeReportTypes'
import type { FundQuery, TransactionQuery } from '../model/financeTypes'

export const financeQueryKeys = {
  all: ['finance'] as const,
  fundLists: (clubId: string) => ['finance', 'funds', clubId] as const,
  fundList: (clubId: string, query: FundQuery) => ['finance', 'funds', clubId, query] as const,
  fund: (clubId: string, fundId: string) => ['finance', 'fund', clubId, fundId] as const,
  transactionList: (clubId: string, query: TransactionQuery) => ['finance', 'transactions', clubId, query] as const,
  /** Mọi bản chi tiết của một giao dịch, dù xem từ quỹ nào. */
  transactionAll: (clubId: string, transactionId: string) => ['finance', 'transaction', clubId, transactionId] as const,
  transaction: (clubId: string, transactionId: string, fundId: string | null) => ['finance', 'transaction', clubId, transactionId, fundId] as const,
  advanceList: (clubId: string, query: AdvanceQuery) => ['finance', 'advances', clubId, query] as const,
  advance: (clubId: string, advanceId: string) => ['finance', 'advance', clubId, advanceId] as const,
  duesList: (clubId: string, query: DuesCampaignQuery) => ['finance', 'dues', clubId, query] as const,
  duesCampaign: (clubId: string, campaignId: string) => ['finance', 'duesCampaign', clubId, campaignId] as const,
  duesItems: (clubId: string, campaignId: string, query: DuesItemQuery) => ['finance', 'duesItems', clubId, campaignId, query] as const,
  duesCandidates: (clubId: string, q: string) => ['finance', 'duesCandidates', clubId, q] as const,
  myDues: (clubId: string) => ['finance', 'myDues', clubId] as const,
  reportPeriods: (clubId: string) => ['finance', 'reportPeriods', clubId] as const,
  report: (clubId: string, query: FinanceReportQuery) => ['finance', 'report', clubId, query] as const,
  unpaidDues: (clubId: string, query: UnpaidDuesQuery) => ['finance', 'unpaidDues', clubId, query] as const,
}
