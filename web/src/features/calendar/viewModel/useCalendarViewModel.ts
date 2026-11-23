import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { toVnDateKey } from '@/shared/format/formatDate'
import { calendarRepository } from '../model/calendarRepository'
import { isMonth, itemsByDay, monthGridDays, monthLabel, monthOf, shiftMonth } from './calendarDisplay'

export const calendarQueryKeys = {
  all: ['calendar'] as const,
  range: (from: string, to: string, clubId: string) => ['calendar', from, to, clubId] as const,
}

/** FR-ATT-09: lịch tháng gộp buổi sinh hoạt và sự kiện của mọi CLB; tháng và CLB lọc nằm trên URL để chia sẻ, quay lại được. */
export function useCalendarViewModel() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [today] = useState(() => toVnDateKey(new Date()))
  const requested = searchParams.get('month')
  const month = isMonth(requested) ? requested : monthOf(today)
  const clubId = searchParams.get('club') ?? ''
  const days = monthGridDays(month)
  const from = days[0] ?? `${month}-01`
  const to = days.at(-1) ?? `${month}-28`

  const calendar = useQuery({
    queryKey: calendarQueryKeys.range(from, to, clubId),
    queryFn: () => calendarRepository.mine({ from, to, clubId: clubId || undefined }),
    placeholderData: keepPreviousData,
  })
  const byDay = itemsByDay(calendar.data?.items ?? [])
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setSearchParams(next, { replace: true })
  }

  return {
    month,
    monthLabel: monthLabel(month),
    today,
    days,
    byDay,
    /** Màn hẹp: chỉ những ngày trong tháng có mục. */
    agenda: days.filter((day) => day.startsWith(month) && (byDay.get(day)?.length ?? 0) > 0).map((day) => ({ day, items: byDay.get(day) ?? [] })),
    clubs: calendar.data?.clubs ?? [],
    clubId,
    setClubId: (value: string) => update({ club: value || null }),
    previous: () => update({ month: shiftMonth(month, -1) }),
    next: () => update({ month: shiftMonth(month, 1) }),
    goToday: () => update({ month: null }),
    isCurrentMonth: month === monthOf(today),
    loading: calendar.isPending,
    fetching: calendar.isFetching,
    error: calendar.error,
    refetch: () => void calendar.refetch(),
    empty: !calendar.isPending && !calendar.error && (calendar.data?.items.length ?? 0) === 0,
  }
}
