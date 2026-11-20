import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { eventRepository } from '../model/eventRepository'
import { eventQueryKeys } from './eventQueryKeys'

const PAGE_SIZE = 20

/** Danh sách tham dự: chỉ BTC và ban chủ nhiệm xem được (SRS 3.5); tìm theo tên, phân trang (FR-RPT-01). */
export function useEventRegistrationsViewModel(clubId: string, eventId: string, enabled: boolean) {
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 300)
  const [page, setPage] = useState(0)
  const query = { q: debouncedKeyword || undefined, page, size: PAGE_SIZE }
  const registrations = useQuery({
    queryKey: eventQueryKeys.registrations(clubId, eventId, query),
    queryFn: () => eventRepository.registrations(clubId, eventId, query),
    enabled,
    placeholderData: keepPreviousData,
  })
  return {
    keyword,
    setKeyword: (value: string) => {
      setKeyword(value)
      setPage(0)
    },
    rows: registrations.data?.content ?? [],
    loading: registrations.isPending && enabled,
    error: registrations.error,
    refetch: () => void registrations.refetch(),
    page: registrations.data?.page ?? 0,
    totalPages: registrations.data?.totalPages ?? 0,
    totalElements: registrations.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
  }
}
