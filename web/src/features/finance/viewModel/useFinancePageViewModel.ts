import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { useClampPage } from '@/shared/hooks/useClampPage'
import { financeRepository } from '../model/financeRepository'
import type { FundQuery, FundStatus } from '../model/financeTypes'
import { financeQueryKeys } from './financeQueryKeys'

const PAGE_SIZE = 20
const VIEW_PARAM = 'view'

export type FinanceView = 'general' | 'events' | 'dues' | 'report' | 'mine'
export type EventFundFilter = FundStatus | 'ALL'

/** Trang Tài chính: Quỹ chung, quỹ sự kiện người gọi được xem (ban chủ nhiệm, BTC; SRS 3.5), đợt đóng quỹ (ban chủ nhiệm, FR-FIN-09), khoản đóng của tôi (FR-FIN-13). */
export function useFinancePageViewModel() {
  const { clubId, club } = useCurrentClub()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filter, setFilter] = useState<EventFundFilter>('ALL')
  const [page, setPage] = useState(0)

  // Có quỹ sự kiện nào xem được hay không quyết định có hiện tab, không phụ thuộc bộ lọc đang chọn.
  const probeQuery: FundQuery = { kind: 'EVENT', size: 1 }
  const probe = useQuery({ queryKey: financeQueryKeys.fundList(clubId, probeQuery), queryFn: () => financeRepository.funds(clubId, probeQuery) })
  const hasEventFunds = (probe.data?.totalElements ?? 0) > 0

  const query: FundQuery = { kind: 'EVENT', status: filter === 'ALL' ? undefined : filter, page, size: PAGE_SIZE }
  const list = useQuery({
    queryKey: financeQueryKeys.fundList(clubId, query),
    queryFn: () => financeRepository.funds(clubId, query),
    enabled: hasEventFunds,
    placeholderData: keepPreviousData,
  })
  useClampPage(page, list.data?.totalPages, setPage)

  const canViewDues = club.allowedActions.includes('VIEW_DUES')
  const canViewReport = club.allowedActions.includes('VIEW_FINANCE_REPORT')
  const requested = searchParams.get(VIEW_PARAM)
  // Thành viên mở thông báo đóng quỹ (`view=dues`) mà không xem được tab Đóng quỹ thì vào khoản đóng của mình (FR-FIN-13).
  const view: FinanceView =
    hasEventFunds && requested === 'events'
      ? 'events'
      : requested === 'dues'
        ? canViewDues
          ? 'dues'
          : 'mine'
        : requested === 'mine'
          ? 'mine'
          : canViewReport && requested === 'report'
            ? 'report'
            : 'general'

  return {
    clubId,
    clubName: club.name,
    generalFundId: club.generalFundId,
    hasEventFunds,
    canViewDues,
    canViewReport,
    eventFundCount: probe.data?.totalElements ?? 0,
    eventFundsError: probe.error,
    retryEventFunds: () => void probe.refetch(),
    view,
    /** Đợt cần làm nổi ở tab Khoản đóng của tôi khi mở từ thông báo. */
    highlightDuesId: view === 'mine' ? searchParams.get('dues') : null,
    setView: (value: string) => {
      const next = new URLSearchParams(searchParams)
      if (value === 'events' || value === 'dues' || value === 'report' || value === 'mine') next.set(VIEW_PARAM, value)
      else next.delete(VIEW_PARAM)
      // Đổi tab thì bỏ đợt đang mở và tham số báo cáo.
      for (const name of ['dues', 'period', 'key', 'from', 'to', 'category', 'eventId']) next.delete(name)
      setSearchParams(next, { replace: true })
    },
    filter,
    setFilter: (value: EventFundFilter) => {
      setFilter(value)
      setPage(0)
    },
    funds: list.data?.content ?? [],
    loading: list.isPending,
    error: list.error,
    retry: () => void list.refetch(),
    page,
    setPage,
    totalPages: list.data?.totalPages ?? 0,
    totalElements: list.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
  }
}

export type FinancePageViewModel = ReturnType<typeof useFinancePageViewModel>
