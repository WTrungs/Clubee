import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { eventRepository } from '../model/eventRepository'
import type { EventQuery } from '../model/eventTypes'
import { EVENT_FILTERS } from './eventDisplay'
import { eventQueryKeys } from './eventQueryKeys'

const PAGE_SIZE = 12

export function useEventListViewModel() {
  const { clubId, club } = useCurrentClub()
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 300)
  const [filterKey, setFilterKey] = useState<string>('all')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)

  const query: EventQuery = {
    status: EVENT_FILTERS.find((filter) => filter.key === filterKey)?.statuses,
    q: debouncedKeyword || undefined,
    page,
    size: PAGE_SIZE,
  }
  const events = useQuery({
    queryKey: eventQueryKeys.list(clubId, query),
    queryFn: () => eventRepository.list(clubId, query),
    placeholderData: keepPreviousData,
  })

  const canCreate = club.allowedActions.includes('CREATE_EVENT')
  const canPropose = club.allowedActions.includes('PROPOSE_EVENT')

  return {
    clubId,
    clubName: club.name,
    keyword,
    setKeyword: (value: string) => {
      setKeyword(value)
      setPage(0)
    },
    filterKey,
    setFilterKey: (key: string) => {
      setFilterKey(key)
      setPage(0)
    },
    filters: [{ key: 'all', label: 'Tất cả' }, ...EVENT_FILTERS.map(({ key, label }) => ({ key, label }))],
    events: events.data?.content ?? [],
    loading: events.isPending,
    error: events.error,
    refetch: () => void events.refetch(),
    page: events.data?.page ?? 0,
    totalPages: events.data?.totalPages ?? 0,
    totalElements: events.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
    /** FR-EVT-01: ban chủ nhiệm tạo thẳng; FR-EVT-02: thành viên đề xuất. Quyền do máy chủ trả về. */
    formMode: canCreate ? ('create' as const) : canPropose ? ('propose' as const) : null,
    formOpen,
    setFormOpen,
  }
}
