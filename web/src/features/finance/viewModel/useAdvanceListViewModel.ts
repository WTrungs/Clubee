import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { useClampPage } from '@/shared/hooks/useClampPage'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { advanceRepository } from '../model/advanceRepository'
import type { AdvanceQuery } from '../model/advanceTypes'
import { ADVANCE_FILTERS, type AdvanceFilter } from './advanceDisplay'
import { financeQueryKeys } from './financeQueryKeys'

const PAGE_SIZE = 20
/** Tạm ứng đang mở trong sheet nằm trên URL để thông báo dẫn thẳng tới được. */
export const ADVANCE_PARAM = 'adv'

/** Tab Tạm ứng của một quỹ (FR-FIN-07): lọc trạng thái, Của tôi, Quá hạn, tìm, phân trang; mở chi tiết qua `?adv=`. */
export function useAdvanceListViewModel(fundId: string, enabled: boolean) {
  const { clubId } = useCurrentClub()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<AdvanceFilter>('OPEN')
  const [mine, setMine] = useState(false)
  const [overdue, setOverdue] = useState(false)
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 300)
  const [page, setPage] = useState(0)

  const query: AdvanceQuery = {
    fundId,
    status: ADVANCE_FILTERS.find((item) => item.key === filter)?.statuses,
    mine: mine || undefined,
    overdue: overdue || undefined,
    q: debouncedKeyword || undefined,
    page,
    size: PAGE_SIZE,
  }
  const list = useQuery({
    queryKey: financeQueryKeys.advanceList(clubId, query),
    queryFn: () => advanceRepository.list(clubId, query),
    enabled,
    placeholderData: keepPreviousData,
  })
  useClampPage(page, list.data?.totalPages, setPage)
  const resetPage = <T,>(set: (value: T) => void) => (value: T) => {
    set(value)
    setPage(0)
  }

  return {
    advances: list.data?.content ?? [],
    loading: list.isPending && enabled,
    error: list.error,
    refetch: () => void list.refetch(),
    filter,
    setFilter: resetPage(setFilter),
    filters: ADVANCE_FILTERS,
    mine,
    setMine: resetPage(setMine),
    overdue,
    setOverdue: resetPage(setOverdue),
    keyword,
    setKeyword: resetPage(setKeyword),
    page: list.data?.page ?? 0,
    totalPages: list.data?.totalPages ?? 0,
    totalElements: list.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
    openedAdvanceId: searchParams.get(ADVANCE_PARAM),
    openAdvance: (advanceId: string) => {
      const next = new URLSearchParams(searchParams)
      next.set(ADVANCE_PARAM, advanceId)
      // Mở từ sheet giao dịch (khoản chi sinh từ tạm ứng) thì thay sheet đó, không chồng hai sheet.
      next.delete('tx')
      setSearchParams(next, { state: { openedInPage: true } })
    },
    // Từ sheet tạm ứng sang khoản chi đã ghi sổ: thay mục lịch sử hiện tại, đóng sheet giao dịch vẫn về đúng trang.
    openLinkedTransaction: (transactionId: string) => {
      const next = new URLSearchParams(searchParams)
      next.set('tx', transactionId)
      next.delete(ADVANCE_PARAM)
      setSearchParams(next, { replace: true, state: location.state })
    },
    // Mở ngay trong trang thì đóng bằng lùi lịch sử; mở từ liên kết (thông báo) thì chỉ bỏ tham số.
    closeAdvance: () => {
      if ((location.state as { openedInPage?: boolean } | null)?.openedInPage) {
        void navigate(-1)
        return
      }
      const next = new URLSearchParams(searchParams)
      next.delete(ADVANCE_PARAM)
      setSearchParams(next, { replace: true })
    },
  }
}

export type AdvanceListViewModel = ReturnType<typeof useAdvanceListViewModel>
