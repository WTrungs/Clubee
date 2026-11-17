import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { MemberStatus } from '@/features/account/model/accountTypes'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { getErrorMessage } from '@/api/apiError'
import { useClampPage } from '@/shared/hooks/useClampPage'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { memberRepository } from '../model/memberRepository'
import type { MemberQuery, MemberRoleFilter } from '../model/memberTypes'
import { memberQueryKeys } from './memberQueryKeys'

/** FR-RPT-01: phân trang khi quá 50 bản ghi. */
const PAGE_SIZE = 50

export function useMemberListViewModel() {
  const { clubId, club } = useCurrentClub()
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 300)
  const [statuses, setStatuses] = useState<MemberStatus[]>([])
  const [departmentId, setDepartmentId] = useState('')
  const [role, setRole] = useState<MemberRoleFilter | ''>('')
  const [joinYear, setJoinYear] = useState('')
  const [page, setPage] = useState(0)

  const query: MemberQuery = {
    q: debouncedKeyword || undefined,
    status: statuses.length > 0 ? statuses : undefined,
    departmentId: departmentId || undefined,
    role: role || undefined,
    joinYear: joinYear ? Number(joinYear) : undefined,
    page,
    size: PAGE_SIZE,
  }
  const members = useQuery({
    queryKey: memberQueryKeys.list(clubId, query),
    queryFn: () => memberRepository.list(clubId, query),
    placeholderData: keepPreviousData,
  })
  const facets = useQuery({ queryKey: memberQueryKeys.facets(clubId), queryFn: () => memberRepository.facets(clubId) })
  useClampPage(page, members.data?.totalPages, setPage)

  const resetPage = <T>(setter: (value: T) => void) => (value: T) => {
    setter(value)
    setPage(0)
  }
  const activeCount = statuses.length + Number(Boolean(departmentId)) + Number(Boolean(role)) + Number(Boolean(joinYear))

  return {
    clubName: club.name,
    /** Ban chủ nhiệm thấy liên hệ, MSSV và tìm theo các trường đó; máy chủ quyết định (SRS 3.5). */
    canManage: club.allowedActions.includes('MANAGE_MEMBERS'),
    keyword,
    setKeyword: resetPage(setKeyword),
    statuses,
    toggleStatus: (status: MemberStatus) => {
      setStatuses((current) => (current.includes(status) ? current.filter((item) => item !== status) : [...current, status]))
      setPage(0)
    },
    departmentId,
    setDepartmentId: resetPage(setDepartmentId),
    role,
    setRole: resetPage(setRole),
    joinYear,
    setJoinYear: resetPage(setJoinYear),
    activeCount,
    clearFilters: () => {
      setStatuses([])
      setDepartmentId('')
      setRole('')
      setJoinYear('')
      setPage(0)
    },
    departments: facets.data?.departments ?? [],
    joinYears: facets.data?.joinYears ?? [],
    facetsError: facets.error ? getErrorMessage(facets.error) : null,
    retryFacets: () => void facets.refetch(),
    members: members.data?.content ?? [],
    loading: members.isPending,
    error: members.error,
    refetch: () => void members.refetch(),
    page: members.data?.page ?? 0,
    totalPages: members.data?.totalPages ?? 0,
    totalElements: members.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
  }
}

export type MemberListViewModel = ReturnType<typeof useMemberListViewModel>
