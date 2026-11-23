import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { sessionRepository } from '../model/sessionRepository'
import { attendanceQueryKeys } from './attendanceQueryKeys'

const PAGE_SIZE = 20

/** Danh sách đăng ký của buổi cho người phụ trách (FR-ATT-03): người giữ chỗ trước, rồi danh sách chờ theo thứ tự. */
export function useSessionRegistrationsViewModel(clubId: string, sessionId: string) {
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 300)
  const [page, setPage] = useState(0)
  const query = { q: debouncedKeyword || undefined, page, size: PAGE_SIZE }
  const registrations = useQuery({
    queryKey: attendanceQueryKeys.registrations(clubId, sessionId, query),
    queryFn: () => sessionRepository.registrations(clubId, sessionId, query),
    placeholderData: keepPreviousData,
  })
  return {
    keyword,
    setKeyword: (value: string) => {
      setKeyword(value)
      setPage(0)
    },
    rows: registrations.data?.content ?? [],
    loading: registrations.isPending,
    error: registrations.error,
    refetch: () => void registrations.refetch(),
    page: registrations.data?.page ?? 0,
    totalPages: registrations.data?.totalPages ?? 0,
    totalElements: registrations.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
  }
}
