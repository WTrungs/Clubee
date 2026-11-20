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

export type FinanceView = 'general' | 'events'
export type EventFundFilter = FundStatus | 'ALL'

/** Trang Tài chính: Quỹ chung và danh sách quỹ sự kiện người gọi được xem (ban chủ nhiệm, BTC; SRS 3.5). */
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

  const requested = searchParams.get(VIEW_PARAM)
  const view: FinanceView = hasEventFunds && requested === 'events' ? 'events' : 'general'

  return {
    clubId,
    clubName: club.name,
    generalFundId: club.generalFundId,
    hasEventFunds,
    eventFundCount: probe.data?.totalElements ?? 0,
    eventFundsError: probe.error,
    retryEventFunds: () => void probe.refetch(),
    view,
    setView: (value: string) => {
      const next = new URLSearchParams(searchParams)
      if (value === 'events') next.set(VIEW_PARAM, 'events')
      else next.delete(VIEW_PARAM)
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
