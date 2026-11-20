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
}
