import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { useClampPage } from '@/shared/hooks/useClampPage'
import { duesRepository } from '../model/duesRepository'
import type { DuesCampaignQuery, DuesCampaignStatus } from '../model/duesTypes'
import { financeQueryKeys } from './financeQueryKeys'

const PAGE_SIZE = 20
/** Đợt đang mở nằm trên URL để thông báo dẫn thẳng tới được. */
export const DUES_PARAM = 'dues'

export type DuesCampaignFilter = DuesCampaignStatus | 'ALL'

export const DUES_CAMPAIGN_FILTERS: Array<{ key: DuesCampaignFilter; label: string }> = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'OPEN', label: 'Đang mở' },
  { key: 'CLOSED', label: 'Đã đóng' },
]

/** Tab Đóng quỹ (FR-FIN-09): danh sách đợt cho ban chủ nhiệm; mở một đợt qua `?dues=`. */
export function useDuesCampaignsViewModel(enabled: boolean) {
  const { clubId, club } = useCurrentClub()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<DuesCampaignFilter>('ALL')
  const [page, setPage] = useState(0)
  const [openSheet, setOpenSheet] = useState(false)

  const query: DuesCampaignQuery = { status: filter === 'ALL' ? undefined : filter, page, size: PAGE_SIZE }
  const list = useQuery({
    queryKey: financeQueryKeys.duesList(clubId, query),
    queryFn: () => duesRepository.list(clubId, query),
    enabled,
    placeholderData: keepPreviousData,
  })
  useClampPage(page, list.data?.totalPages, setPage)

  const openCampaign = (campaignId: string) => {
    const next = new URLSearchParams(searchParams)
    next.set(DUES_PARAM, campaignId)
    setSearchParams(next, { state: { openedInPage: true } })
  }

  return {
    campaigns: list.data?.content ?? [],
    loading: list.isPending && enabled,
    error: list.error,
    refetch: () => void list.refetch(),
    filter,
    setFilter: (value: DuesCampaignFilter) => {
      setFilter(value)
      setPage(0)
    },
    filters: DUES_CAMPAIGN_FILTERS,
    page: list.data?.page ?? 0,
    totalPages: list.data?.totalPages ?? 0,
    totalElements: list.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
    canOpen: club.allowedActions.includes('OPEN_DUES'),
    openSheet,
    setOpenSheet,
    openedCampaignId: searchParams.get(DUES_PARAM),
    openCampaign,
    // Mở ngay trong trang thì quay lại bằng lùi lịch sử; mở từ liên kết (thông báo) thì chỉ bỏ tham số.
    backToList: () => {
      if ((location.state as { openedInPage?: boolean } | null)?.openedInPage) {
        void navigate(-1)
        return
      }
      const next = new URLSearchParams(searchParams)
      next.delete(DUES_PARAM)
      setSearchParams(next, { replace: true })
    },
  }
}

export type DuesCampaignsViewModel = ReturnType<typeof useDuesCampaignsViewModel>
