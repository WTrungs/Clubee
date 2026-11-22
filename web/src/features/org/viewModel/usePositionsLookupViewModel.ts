import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { termRepository } from '@/features/term/model/termRepository'
import { termQueryKeys } from '@/features/term/viewModel/termQueryKeys'
import { useClampPage } from '@/shared/hooks/useClampPage'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { orgRepository } from '../model/orgRepository'
import type { PositionQuery, PositionScopeType } from '../model/orgTypes'
import { POSITION_SCOPE_FILTERS } from './orgDisplay'
import { orgQueryKeys } from './orgQueryKeys'

const PAGE_SIZE = 50
const isScopeType = (value: string | null): value is PositionScopeType => POSITION_SCOPE_FILTERS.some((filter) => filter.value !== '' && filter.value === value)
/** Nhiệm kỳ đã đóng chỉ có chức vụ thường trực nên hai loại phạm vi sự kiện luôn rỗng. */
const STANDING_SCOPES: Array<PositionScopeType | ''> = ['', 'CLUB', 'DEPARTMENT']

/** FR-ORG-06: chức vụ hiện tại hoặc của nhiệm kỳ đã đóng (tham số `term` trên URL); `fixedTermId` cố định nhiệm kỳ (FR-TERM-08). */
export function usePositionsLookupViewModel(enabled: boolean, fixedTermId?: string) {
  const { clubId, club } = useCurrentClub()
  const [searchParams, setSearchParams] = useSearchParams()
  const termId = fixedTermId ?? searchParams.get('term') ?? ''
  const viewingPast = (value: string) => value !== '' && value !== club.currentTerm?.id
  const scopeFilters = viewingPast(termId) ? POSITION_SCOPE_FILTERS.filter((filter) => STANDING_SCOPES.includes(filter.value)) : POSITION_SCOPE_FILTERS
  // Bộ lọc trên URL không có chip tương ứng (ví dụ liên kết cũ) thì bỏ qua, để danh sách không rỗng mà không chip nào được chọn.
  const scopeParam = searchParams.get('scope')
  const scopeType: PositionScopeType | '' = isScopeType(scopeParam) && scopeFilters.some((filter) => filter.value === scopeParam) ? scopeParam : ''
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 300)
  const [page, setPage] = useState(0)

  const terms = useQuery({ queryKey: termQueryKeys.list(clubId), queryFn: () => termRepository.list(clubId), enabled })
  const closedTerms = (terms.data ?? []).filter((term) => term.status === 'CLOSED')
  const closedTerm = closedTerms.find((term) => term.id === termId) ?? null
  const query: PositionQuery = { termId: termId || undefined, scopeType: scopeType || undefined, q: debouncedKeyword || undefined, page, size: PAGE_SIZE }
  const positions = useQuery({
    queryKey: orgQueryKeys.positions(clubId, query),
    queryFn: () => orgRepository.positions(clubId, query),
    enabled,
    placeholderData: keepPreviousData,
  })
  useClampPage(page, positions.data?.totalPages, setPage)

  const updateParams = (changes: Record<string, string>) => {
    const next = new URLSearchParams(searchParams)
    for (const [name, value] of Object.entries(changes)) {
      if (value) next.set(name, value)
      else next.delete(name)
    }
    setSearchParams(next, { replace: true })
    setPage(0)
  }

  return {
    termId,
    termFixed: fixedTermId !== undefined,
    termOptions: [
      { value: '', label: club.currentTerm ? `Hiện tại · ${club.currentTerm.name}` : 'Hiện tại' },
      ...closedTerms.map((term) => ({ value: term.id, label: `${term.name} (đã đóng)` })),
      // Nhiệm kỳ trên URL chưa có trong danh sách (đang tải, lỗi, mã sai): giữ một dòng tạm để ô chọn không báo nhầm là Hiện tại.
      ...(termId && !closedTerm ? [{ value: termId, label: terms.isPending ? 'Đang tải nhiệm kỳ…' : 'Nhiệm kỳ đã chọn' }] : []),
    ],
    termsError: terms.error,
    retryTerms: () => void terms.refetch(),
    /** Nhiệm kỳ cũ đang xem, để nêu rõ tên ban theo lúc nhiệm kỳ đóng. */
    closedTerm,
    setTermId: (value: string) => updateParams(viewingPast(value) && !STANDING_SCOPES.includes(scopeType) ? { term: value, scope: '' } : { term: value }),
    scopeFilters,
    scopeType,
    setScopeType: (value: PositionScopeType | '') => updateParams({ scope: value }),
    keyword,
    setKeyword: (value: string) => {
      setKeyword(value)
      setPage(0)
    },
    positions: positions.data?.content ?? [],
    loading: positions.isPending,
    /** Đang tải theo bộ lọc mới, danh sách đang hiện là kết quả cũ. */
    refreshing: positions.isPlaceholderData,
    error: positions.error,
    refetch: () => void positions.refetch(),
    page: positions.data?.page ?? 0,
    totalPages: positions.data?.totalPages ?? 0,
    totalElements: positions.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
  }
}

export type PositionsLookupViewModel = ReturnType<typeof usePositionsLookupViewModel>
