import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { ApiError, getErrorMessage } from '@/api/apiError'
import { myReportRepository } from '../model/myReportRepository'
import { useReportPeriodParams } from './useReportPeriodParams'

export const myReportQueryKeys = {
  all: ['myReport'] as const,
  history: ['myReport', 'history'] as const,
  periods: (clubId: string) => ['myReport', 'periods', clubId] as const,
  report: (query: object) => ['myReport', 'report', query] as const,
  attendance: (query: object) => ['myReport', 'attendance', query] as const,
}

export type MyActivityTab = 'report' | 'history'
const PAGE_SIZE = 20

/** Lỗi 400 của kỳ: nêu lý do theo từng tham số thay vì mời thử lại. */
function invalidReasons(error: unknown): string[] | null {
  if (!(error instanceof ApiError) || error.status !== 400) return null
  return error.fieldErrors.length > 0 ? error.fieldErrors.map((fieldError) => fieldError.message) : [getErrorMessage(error)]
}

/** FR-ATT-10, FR-RPT-02: báo cáo và lịch sử tham gia của chính mình theo CLB và kỳ; CLB, kỳ, tab nằm trên URL. */
export function useMyActivityViewModel() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = useState(0)
  const history = useQuery({ queryKey: myReportQueryKeys.history, queryFn: myReportRepository.clubHistory })
  const clubs = history.data ?? []
  const requestedClub = searchParams.get('club')
  const club = clubs.find((entry) => entry.clubId === requestedClub) ?? clubs[0] ?? null
  const clubId = club?.clubId ?? ''
  const tab: MyActivityTab = searchParams.get('tab') === 'history' ? 'history' : 'report'

  const periods = useQuery({ queryKey: myReportQueryKeys.periods(clubId), queryFn: () => myReportRepository.periods(clubId), enabled: clubId !== '' })
  const periodParams = useReportPeriodParams(periods.data)
  const ready = clubId !== '' && periodParams.ready
  const query = { clubId, ...periodParams.query }
  // Giữ số cũ khi đổi kỳ trong cùng CLB; đổi CLB thì không, để không đọc nhầm số của CLB trước.
  const sameClub = <T,>(previous: T | undefined, previousQuery: { queryKey: readonly unknown[] } | undefined) =>
    ready && (previousQuery?.queryKey[2] as { clubId?: string } | undefined)?.clubId === clubId ? keepPreviousData(previous) : undefined
  const report = useQuery({
    queryKey: myReportQueryKeys.report(query),
    queryFn: () => myReportRepository.report(query),
    enabled: ready && tab === 'report',
    placeholderData: sameClub,
  })
  const attendanceQuery = { ...query, page, size: PAGE_SIZE }
  const attendance = useQuery({
    queryKey: myReportQueryKeys.attendance(attendanceQuery),
    queryFn: () => myReportRepository.attendance(attendanceQuery),
    enabled: ready && tab === 'history',
    placeholderData: sameClub,
  })
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setSearchParams(next, { replace: true })
  }
  const active = tab === 'report' ? report : attendance
  const reasons = invalidReasons(active.error)

  return {
    clubs,
    club,
    setClubId: (value: string) => {
      setPage(0)
      // Đổi CLB thì kỳ nhiệm kỳ cũ không còn hợp lệ: về kỳ mặc định.
      update({ club: value, period: null, key: null, from: null, to: null })
    },
    historyLoading: history.isPending,
    historyError: history.error,
    retryHistory: () => void history.refetch(),
    noClubs: !history.isPending && !history.error && clubs.length === 0,
    tab,
    setTab: (value: string) => update({ tab: value === 'history' ? 'history' : null }),
    periodParams: {
      ...periodParams,
      setPeriod: (value: Parameters<typeof periodParams.setPeriod>[0]) => {
        setPage(0)
        periodParams.setPeriod(value)
      },
      setKey: (value: string) => {
        setPage(0)
        periodParams.setKey(value)
      },
    },
    periodsLoading: periods.isPending && clubId !== '',
    periodsError: periods.error,
    retryPeriods: () => void periods.refetch(),
    /** Chưa đủ điều kiện gọi báo cáo (chọn khoảng ngày mà chưa bấm Xem, hoặc loại kỳ chưa có kỳ nào). */
    waitingForPeriod: clubId !== '' && !periods.isPending && !periods.error && !periodParams.ready,
    report: report.data ?? null,
    attendance: attendance.data ?? null,
    page: attendance.data?.page ?? 0,
    setPage,
    pageSize: PAGE_SIZE,
    loading: ready && active.isPending,
    error: reasons ? null : active.error,
    invalidReasons: reasons,
    refetch: () => void active.refetch(),
  }
}

export type MyActivityViewModel = ReturnType<typeof useMyActivityViewModel>
