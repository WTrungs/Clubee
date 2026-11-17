import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { getErrorMessage } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { orgRepository } from '@/features/org/model/orgRepository'
import { orgQueryKeys } from '@/features/org/viewModel/orgQueryKeys'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { sessionRepository } from '../model/sessionRepository'
import type { SessionQuery, SessionWhen } from '../model/sessionTypes'
import { attendanceQueryKeys } from './attendanceQueryKeys'
import { scopeFilterQuery } from './sessionDisplay'

const PAGE_SIZE = 12

export const SESSION_TABS: Array<{ value: SessionWhen; label: string }> = [
  { value: 'UPCOMING', label: 'Sắp tới' },
  { value: 'PAST', label: 'Đã qua' },
]

export function useSessionListViewModel() {
  const { clubId, club } = useCurrentClub()
  const [searchParams, setSearchParams] = useSearchParams()
  const when: SessionWhen = searchParams.get('when') === 'past' ? 'PAST' : 'UPCOMING'
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 300)
  const [scopeFilter, setScopeFilter] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)

  const query: SessionQuery = { when, ...scopeFilterQuery(scopeFilter), q: debouncedKeyword || undefined, page, size: PAGE_SIZE }
  const sessions = useQuery({
    queryKey: attendanceQueryKeys.sessionList(clubId, query),
    queryFn: () => sessionRepository.list(clubId, query),
    placeholderData: keepPreviousData,
  })
  const scopes = useQuery({ queryKey: attendanceQueryKeys.sessionScopes(clubId), queryFn: () => sessionRepository.scopes(clubId) })
  const departments = useQuery({ queryKey: orgQueryKeys.departments(clubId, 'ACTIVE'), queryFn: () => orgRepository.departments(clubId, 'ACTIVE') })

  return {
    clubId,
    clubName: club.name,
    when,
    setWhen: (value: string) => {
      setSearchParams(value === 'PAST' ? { when: 'past' } : {}, { replace: true })
      setPage(0)
    },
    keyword,
    setKeyword: (value: string) => {
      setKeyword(value)
      setPage(0)
    },
    scopeFilter,
    setScopeFilter: (value: string) => {
      setScopeFilter(value)
      setPage(0)
    },
    departments: departments.data ?? [],
    departmentsError: departments.error ? getErrorMessage(departments.error) : null,
    retryDepartments: () => void departments.refetch(),
    sessions: sessions.data?.content ?? [],
    loading: sessions.isPending,
    error: sessions.error,
    refetch: () => void sessions.refetch(),
    page: sessions.data?.page ?? 0,
    totalPages: sessions.data?.totalPages ?? 0,
    totalElements: sessions.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
    /** Nút tạo chỉ hiện khi máy chủ trả về ít nhất một phạm vi được tạo. */
    scopes: scopes.data ?? [],
    scopesError: scopes.error ? getErrorMessage(scopes.error) : null,
    retryScopes: () => void scopes.refetch(),
    formOpen,
    setFormOpen,
  }
}
