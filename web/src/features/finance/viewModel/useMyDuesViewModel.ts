import { useQuery } from '@tanstack/react-query'
import { formatMoney } from '@/shared/format/formatMoney'
import { duesRepository } from '../model/duesRepository'
import type { MyDuesItem } from '../model/duesTypes'
import { financeQueryKeys } from './financeQueryKeys'

/** Tổng còn thiếu ở các đợt đang mở; đợt đã đóng không còn nhận nộp nên không tính. */
export function myDuesSummary(items: readonly MyDuesItem[]): { owed: number; openCount: number; overdueCount: number } {
  const owing = items.filter((item) => item.campaign.status === 'OPEN' && item.remaining > 0)
  return {
    owed: owing.reduce((sum, item) => sum + item.remaining, 0),
    openCount: owing.length,
    overdueCount: owing.filter((item) => item.overdue).length,
  }
}

/** Câu miễn giảm của chính mình; null khi không được miễn giảm. */
export function myExemptionText(item: Pick<MyDuesItem, 'exemption' | 'amountDue' | 'campaign'>): string | null {
  if (!item.exemption) return null
  if (item.exemption.kind === 'EXEMPT') return 'Bạn được miễn đóng đợt này'
  return `Bạn được giảm còn ${formatMoney(item.amountDue)} (mức đóng ${formatMoney(item.campaign.amount)})`
}

/** FR-FIN-13: các đợt đóng quỹ của chính mình, số đã nộp và còn thiếu; `highlightId` là đợt mở từ thông báo. */
export function useMyDuesViewModel(clubId: string, active: boolean, highlightId: string | null) {
  const query = useQuery({ queryKey: financeQueryKeys.myDues(clubId), queryFn: () => duesRepository.mine(clubId), enabled: active })
  const items = query.data ?? []
  return {
    items,
    summary: myDuesSummary(items),
    loading: query.isPending,
    error: query.error,
    refetch: () => void query.refetch(),
    highlightId: items.some((item) => item.campaign.id === highlightId) ? highlightId : null,
  }
}
