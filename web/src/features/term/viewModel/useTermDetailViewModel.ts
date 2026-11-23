import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { eventRepository } from '@/features/event/model/eventRepository'
import type { EventQuery } from '@/features/event/model/eventTypes'
import { eventQueryKeys } from '@/features/event/viewModel/eventQueryKeys'
import { financeRepository } from '@/features/finance/model/financeRepository'
import type { TransactionQuery } from '@/features/finance/model/financeTypes'
import { financeQueryKeys } from '@/features/finance/viewModel/financeQueryKeys'
import { positionRoleLabel } from '@/features/org/viewModel/orgDisplay'
import { formatDate } from '@/shared/format/formatDate'
import { termRepository } from '../model/termRepository'
import type { TermPositionHolder } from '../model/termTypes'
import { termQueryKeys } from './termQueryKeys'

export type TermDetailTab = 'structure' | 'positions' | 'events' | 'ledger'

export const TERM_DETAIL_TABS: Array<{ value: TermDetailTab; label: string }> = [
  { value: 'structure', label: 'Cơ cấu' },
  { value: 'positions', label: 'Chức vụ' },
  { value: 'events', label: 'Sự kiện' },
  { value: 'ledger', label: 'Sổ quỹ' },
]

export const parseTermDetailTab = (value: string | null): TermDetailTab => TERM_DETAIL_TABS.find((tab) => tab.value === value)?.value ?? 'structure'

/** "Trưởng ban · 01/02/2026 – 31/12/2026 · đã thu hồi"; chức chưa có ngày cuối là giữ tới khi bàn giao xong. */
export function holderPeriodText(holder: Pick<TermPositionHolder, 'role' | 'startOn' | 'endOn' | 'revoked'>): string {
  const end = holder.endOn ? formatDate(holder.endOn) : 'tới khi bàn giao xong'
  return `${positionRoleLabel[holder.role]} · ${formatDate(holder.startOn)} – ${end}${holder.revoked ? ' · đã thu hồi' : ''}`
}

const EVENT_PAGE_SIZE = 12
const LEDGER_PAGE_SIZE = 50

/** FR-TERM-08: tra cứu một nhiệm kỳ: cơ cấu, chức vụ, sự kiện và sổ Quỹ chung trong khoảng nhiệm kỳ; tab giữ trên URL. */
export function useTermDetailViewModel() {
  const { clubId, club } = useCurrentClub()
  const { termId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = parseTermDetailTab(searchParams.get('tab'))
  const [eventPage, setEventPage] = useState(0)
  const [ledgerPage, setLedgerPage] = useState(0)
  const [transactionId, setTransactionId] = useState<string | null>(null)

  const overview = useQuery({ queryKey: termQueryKeys.overview(clubId, termId), queryFn: () => termRepository.overview(clubId, termId) })
  const term = overview.data?.term ?? null
  const fundId = overview.data?.generalFund?.fundId ?? null

  const eventQuery: EventQuery = { termId, page: eventPage, size: EVENT_PAGE_SIZE }
  const events = useQuery({
    queryKey: eventQueryKeys.list(clubId, eventQuery),
    queryFn: () => eventRepository.list(clubId, eventQuery),
    enabled: tab === 'events' && term !== null,
    placeholderData: keepPreviousData,
  })

  const ledgerQuery: TransactionQuery = { fundId: fundId ?? undefined, status: ['POSTED'], from: term?.startOn, to: term?.endOn, page: ledgerPage, size: LEDGER_PAGE_SIZE }
  const ledger = useQuery({
    queryKey: financeQueryKeys.transactionList(clubId, ledgerQuery),
    queryFn: () => financeRepository.transactions(clubId, ledgerQuery),
    enabled: tab === 'ledger' && term !== null && fundId !== null,
    placeholderData: keepPreviousData,
  })

  return {
    clubId,
    clubName: club.name,
    termId,
    tab,
    tabs: TERM_DETAIL_TABS,
    setTab: (value: string) => {
      const next = new URLSearchParams(searchParams)
      next.set('tab', parseTermDetailTab(value))
      setSearchParams(next, { replace: true })
    },
    loading: overview.isPending,
    error: overview.error,
    refetch: () => void overview.refetch(),
    overview: overview.data ?? null,
    term,
    events: {
      rows: events.data?.content ?? [],
      loading: events.isPending,
      error: events.error,
      refetch: () => void events.refetch(),
      page: events.data?.page ?? 0,
      totalPages: events.data?.totalPages ?? 0,
      totalElements: events.data?.totalElements ?? 0,
      pageSize: EVENT_PAGE_SIZE,
      setPage: setEventPage,
    },
    ledger: {
      fundId,
      rows: ledger.data?.content ?? [],
      loading: ledger.isPending,
      error: ledger.error,
      refetch: () => void ledger.refetch(),
      page: ledger.data?.page ?? 0,
      totalPages: ledger.data?.totalPages ?? 0,
      totalElements: ledger.data?.totalElements ?? 0,
      pageSize: LEDGER_PAGE_SIZE,
      setPage: setLedgerPage,
    },
    transactionId,
    openTransaction: setTransactionId,
    closeTransaction: () => setTransactionId(null),
  }
}

export type TermDetailViewModel = ReturnType<typeof useTermDetailViewModel>
