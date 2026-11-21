import type { FinanceReport, ReportFlaggedTransaction, UnpaidDuesRow } from '@/features/finance/model/financeReportTypes'
import type { FinanceCategory } from '@/features/finance/model/financeTypes'
import { db, type DbClub, type DbTransaction } from './db'
import { isAdvanceOverdue } from './mockAdvances'
import { itemsOf, owedOf } from './mockDues'
import { eventOfFund, fundName } from './mockFinance'
import { personRef } from './mockMembers'
import { vnToday } from './mockTime'

const pad = (value: number) => String(value).padStart(2, '0')

// FR-FIN-12: báo cáo thu chi cho ban chủ nhiệm. Chỉ tính giao dịch Đã ghi sổ theo ngày phát sinh (BR-FIN-02); chuyển quỹ chỉ là
// tiền đổi chỗ giữa hai quỹ của CLB nên không tính vào thu chi; điều chỉnh mang hạng mục của giao dịch gốc nên vào đúng hạng mục.

/** Giao dịch tính vào báo cáo: Đã ghi sổ, không phải chuyển quỹ, phát sinh trong khoảng. */
function reportable(transaction: DbTransaction, clubId: string, from: string, to: string): boolean {
  if (transaction.clubId !== clubId || transaction.status !== 'POSTED' || transaction.type === 'TRANSFER') return false
  const day = transaction.occurredOn
  return day !== null && day >= from && day <= to
}

/** Khoản R-01: khoản chi Đã ghi sổ mà người duyệt cũng là người ghi sổ. */
const sameApproverPoster = (transaction: DbTransaction) =>
  transaction.type === 'EXPENSE' && transaction.approverId !== null && transaction.approverId === transaction.posterId

export function buildFinanceReport(
  club: DbClub,
  range: { from: string; to: string; label: string },
  filter: { category: FinanceCategory | null; eventId: string | null },
): FinanceReport {
  const eventFundId = filter.eventId ? db.funds.find((fund) => fund.clubId === club.id && fund.kind === 'EVENT' && fund.eventId === filter.eventId)?.id : undefined
  const rows = db.transactions
    .filter((transaction) => reportable(transaction, club.id, range.from, range.to))
    .filter((transaction) => !filter.category || transaction.category === filter.category)
    .filter((transaction) => !filter.eventId || transaction.fundId === eventFundId)
  const sum = (list: DbTransaction[], direction: 'IN' | 'OUT') => list.filter((row) => row.direction === direction).reduce((total, row) => total + row.amount, 0)

  const categories = [...new Set(rows.map((row) => row.category))]
  const byCategory = categories
    .map((category) => {
      const list = rows.filter((row) => row.category === category)
      return { category, income: sum(list, 'IN'), expense: sum(list, 'OUT') }
    })
    .toSorted((a, b) => b.income + b.expense - (a.income + a.expense))

  const fundIds = [...new Set(rows.map((row) => row.fundId))]
  const byFund = fundIds
    .flatMap((fundId) => {
      const fund = db.funds.find((candidate) => candidate.id === fundId)
      if (!fund) return []
      const list = rows.filter((row) => row.fundId === fundId)
      return [{ fundId, fundName: fundName(fund), eventId: fund.kind === 'EVENT' ? fund.eventId : null, income: sum(list, 'IN'), expense: sum(list, 'OUT') }]
    })
    // Quỹ chung trước, rồi các quỹ sự kiện theo tên.
    .toSorted((a, b) => Number(a.eventId !== null) - Number(b.eventId !== null) || a.fundName.localeCompare(b.fundName, 'vi'))

  const months: string[] = []
  for (let month = range.from.slice(0, 7); month <= range.to.slice(0, 7); ) {
    months.push(month)
    const [year, value] = month.split('-').map(Number)
    const next = new Date(Date.UTC(year ?? 0, value ?? 1, 1))
    month = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}`
  }
  const byMonth = months.map((month) => {
    const list = rows.filter((row) => row.occurredOn?.startsWith(month))
    return { month, income: sum(list, 'IN'), expense: sum(list, 'OUT') }
  })

  const flagged: ReportFlaggedTransaction[] = rows.filter(sameApproverPoster).map((row) => {
    const fund = db.funds.find((candidate) => candidate.id === row.fundId)
    return {
      transactionId: row.id,
      description: row.description,
      amount: row.amount,
      occurredOn: row.occurredOn ?? '',
      fundName: fund ? fundName(fund) : '',
      person: personRef(row.approverId ?? ''),
    }
  })

  const event = filter.eventId ? db.events.find((candidate) => candidate.id === filter.eventId) : undefined
  const totalIncome = sum(rows, 'IN')
  const totalExpense = sum(rows, 'OUT')
  return {
    from: range.from,
    to: range.to,
    label: range.label,
    category: filter.category,
    event: event ? { id: event.id, name: event.name } : null,
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    byCategory,
    byFund,
    byMonth,
    overdueAdvanceCount: db.advances.filter((advance) => advance.clubId === club.id && isAdvanceOverdue(advance)).length,
    // Một người thiếu ở hai đợt vẫn tính là một người.
    unpaidDuesCount: new Set(unpaidDuesOf(club.id).map((row) => row.member.id)).size,
    flagged,
  }
}

/** Người còn thiếu ở các đợt đóng quỹ của CLB (cả đợt đã đóng), sắp theo hạn rồi tên. */
export function unpaidDuesOf(clubId: string, campaignId?: string): UnpaidDuesRow[] {
  const today = vnToday()
  return db.duesCampaigns
    .filter((campaign) => campaign.clubId === clubId && (!campaignId || campaign.id === campaignId))
    .flatMap((campaign) =>
      itemsOf(campaign.id)
        .filter((item) => owedOf(item) > 0)
        .map((item) => ({
          itemId: item.id,
          campaignId: campaign.id,
          campaignName: campaign.name,
          member: { id: item.userId, fullName: item.memberName },
          owed: owedOf(item),
          dueOn: campaign.dueOn,
          overdue: campaign.dueOn < today,
        })),
    )
    .toSorted((a, b) => a.dueOn.localeCompare(b.dueOn) || a.member.fullName.localeCompare(b.member.fullName, 'vi'))
}

/** Sự kiện có quỹ thuộc CLB (để kiểm `eventId` lọc báo cáo). */
export const clubEventWithFund = (clubId: string, eventId: string) =>
  db.funds.some((fund) => fund.clubId === clubId && fund.kind === 'EVENT' && fund.eventId === eventId && eventOfFund(fund) !== undefined)
