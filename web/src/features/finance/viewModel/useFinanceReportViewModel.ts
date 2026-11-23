import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { ApiError, getErrorMessage } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { useReportPeriodParams } from '@/features/report/viewModel/useReportPeriodParams'
import { advanceRepository } from '../model/advanceRepository'
import { duesRepository } from '../model/duesRepository'
import { financeReportRepository } from '../model/financeReportRepository'
import type { FinanceReportQuery } from '../model/financeReportTypes'
import type { FinanceCategory } from '../model/financeTypes'
import { financeQueryKeys } from './financeQueryKeys'

const LIST_SIZE = 5
const FILTER_KEYS = ['category', 'eventId'] as const

/** Lỗi 400 của báo cáo: nêu lý do theo từng tham số, không mời thử lại vì gửi lại vẫn sai. */
function invalidReasons(error: unknown): string[] | null {
  if (!(error instanceof ApiError) || error.status !== 400) return null
  return error.fieldErrors.length > 0 ? error.fieldErrors.map((fieldError) => fieldError.message) : [getErrorMessage(error)]
}

/** Tab Báo cáo (FR-FIN-12): kỳ và bộ lọc nằm trên URL để gửi lại được; mặc định tháng gần nhất. */
export function useFinanceReportViewModel(enabled: boolean) {
  const { clubId } = useCurrentClub()
  const [searchParams, setSearchParams] = useSearchParams()
  const category = (searchParams.get('category') as FinanceCategory | null) ?? undefined
  const eventId = searchParams.get('eventId') ?? undefined
  const [unpaidPage, setUnpaidPage] = useState(0)
  const [unpaidCampaign, setUnpaidCampaign] = useState('')
  const [overduePage, setOverduePage] = useState(0)

  const periods = useQuery({ queryKey: financeQueryKeys.reportPeriods(clubId), queryFn: () => financeReportRepository.periods(clubId), enabled })
  const periodParams = useReportPeriodParams(periods.data)
  const { period, ready } = periodParams
  const query: FinanceReportQuery = { ...periodParams.query, category, eventId }
  const report = useQuery({
    queryKey: financeQueryKeys.report(clubId, query),
    queryFn: () => financeReportRepository.get(clubId, query),
    enabled: enabled && ready,
    // Chưa đủ điều kiện (vừa đổi sang khoảng ngày) thì không giữ báo cáo của kỳ trước.
    placeholderData: ready ? keepPreviousData : undefined,
  })
  const unpaidQuery = { campaignId: unpaidCampaign || undefined, page: unpaidPage, size: LIST_SIZE }
  const unpaid = useQuery({
    queryKey: financeQueryKeys.unpaidDues(clubId, unpaidQuery),
    queryFn: () => financeReportRepository.unpaidDues(clubId, unpaidQuery),
    enabled,
    placeholderData: keepPreviousData,
  })
  const campaignsQuery = { size: 50 }
  const campaigns = useQuery({ queryKey: financeQueryKeys.duesList(clubId, campaignsQuery), queryFn: () => duesRepository.list(clubId, campaignsQuery), enabled })
  const overdueQuery = { overdue: true, page: overduePage, size: LIST_SIZE }
  const overdue = useQuery({
    queryKey: financeQueryKeys.advanceList(clubId, overdueQuery),
    queryFn: () => advanceRepository.list(clubId, overdueQuery),
    enabled,
    placeholderData: keepPreviousData,
  })

  /** Ghi bộ lọc lên URL, giữ kỳ và `view`; giá trị rỗng thì bỏ. */
  const write = (patch: Partial<Record<(typeof FILTER_KEYS)[number], string | undefined>>) => {
    const next = new URLSearchParams(searchParams)
    for (const name of FILTER_KEYS) {
      if (!(name in patch)) continue
      const value = patch[name]
      if (value) next.set(name, value)
      else next.delete(name)
    }
    setSearchParams(next, { replace: true })
  }

  const reasons = invalidReasons(report.error)
  return {
    periodParams,
    period,
    setPeriod: periodParams.setPeriod,
    options: periodParams.options,
    periodsLoading: periods.isPending && enabled,
    periodsError: periods.error,
    retryPeriods: () => void periods.refetch(),
    key: periodParams.key,
    setKey: periodParams.setKey,
    customFrom: periodParams.customFrom,
    setCustomFrom: periodParams.setCustomFrom,
    customTo: periodParams.customTo,
    setCustomTo: periodParams.setCustomTo,
    customError: periodParams.customError,
    applyCustom: periodParams.applyCustom,
    category,
    eventId,
    filterByCategory: (value: FinanceCategory) => write({ category: value }),
    filterByEvent: (value: string) => write({ eventId: value }),
    clearFilters: () => write({ category: undefined, eventId: undefined }),
    report: ready ? (report.data ?? null) : null,
    /** Đang tải bản của kỳ mới trong khi vẫn hiện bản cũ. */
    refreshing: report.isPlaceholderData,
    loading: (report.isPending && ready && enabled) || (periods.isPending && enabled && period !== 'CUSTOM'),
    error: reasons ? null : report.error,
    invalidReasons: reasons,
    refetch: () => void report.refetch(),
    unpaid: unpaid.data?.content ?? [],
    unpaidTotal: unpaid.data?.totalElements ?? 0,
    unpaidPage: unpaid.data?.page ?? 0,
    unpaidTotalPages: unpaid.data?.totalPages ?? 0,
    setUnpaidPage,
    unpaidLoading: unpaid.isPending && enabled,
    unpaidError: unpaid.error,
    retryUnpaid: () => void unpaid.refetch(),
    campaigns: campaigns.data?.content ?? [],
    unpaidCampaign,
    setUnpaidCampaign: (value: string) => {
      setUnpaidCampaign(value)
      setUnpaidPage(0)
    },
    overdueAdvances: overdue.data?.content ?? [],
    overdueTotal: overdue.data?.totalElements ?? 0,
    overduePage: overdue.data?.page ?? 0,
    overdueTotalPages: overdue.data?.totalPages ?? 0,
    setOverduePage,
    overdueLoading: overdue.isPending && enabled,
    overdueError: overdue.error,
    retryOverdue: () => void overdue.refetch(),
    listSize: LIST_SIZE,
  }
}

export type FinanceReportViewModel = ReturnType<typeof useFinanceReportViewModel>
