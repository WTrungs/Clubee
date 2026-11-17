import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { taskRepository } from '../model/taskRepository'
import type { DueFilter, TaskPriority, TaskQuery, TaskStatus, TaskSummary } from '../model/taskTypes'
import { BOARD_STATUSES, groupByStatus } from './taskDisplay'
import { taskQueryKeys } from './taskQueryKeys'
import { useTaskTransition } from './useTaskTransition'

export type TaskSource = { kind: 'mine' } | { kind: 'club'; clubId: string }
export type TaskView = 'board' | 'list'

/** Kanban tải tối đa số thẻ này; xem hết bằng dạng danh sách có phân trang (FR-RPT-01). */
export const BOARD_LIMIT = 100
export const LIST_PAGE_SIZE = 20

export function useTaskWorkspaceViewModel(source: TaskSource) {
  const [view, setView] = useState<TaskView>('board')
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 300)
  const [statuses, setStatuses] = useState<TaskStatus[]>(BOARD_STATUSES)
  const [priority, setPriority] = useState<TaskPriority | ''>('')
  const [due, setDue] = useState<DueFilter | ''>('')
  const [clubId, setClubId] = useState('')
  const [eventId, setEventId] = useState('')
  const [page, setPage] = useState(0)
  const [searchParams, setSearchParams] = useSearchParams()

  const query: TaskQuery = {
    status: statuses,
    priority: priority ? [priority] : undefined,
    due: due || undefined,
    clubId: source.kind === 'mine' ? clubId || undefined : undefined,
    eventId: eventId || undefined,
    q: debouncedKeyword || undefined,
    page: view === 'board' ? 0 : page,
    size: view === 'board' ? BOARD_LIMIT : LIST_PAGE_SIZE,
    sort: 'dueAt,asc',
  }

  const tasks = useQuery({
    queryKey: source.kind === 'mine' ? taskQueryKeys.mine(query) : taskQueryKeys.club(source.clubId, query),
    queryFn: () => (source.kind === 'mine' ? taskRepository.listMine(query) : taskRepository.listInClub(source.clubId, query)),
    placeholderData: keepPreviousData,
    enabled: statuses.length > 0,
  })

  const facets = useQuery({
    queryKey: taskQueryKeys.facets,
    queryFn: taskRepository.myFacets,
    enabled: source.kind === 'mine',
  })

  const content = useMemo(() => tasks.data?.content ?? [], [tasks.data])
  const columns = useMemo(() => groupByStatus(content), [content])
  const transition = useTaskTransition()

  const resetPage = <T>(setter: (value: T) => void) => (value: T) => {
    setter(value)
    setPage(0)
  }

  const selectedTaskId = searchParams.get('task')
  const selectedClubId = source.kind === 'club' ? source.clubId : searchParams.get('taskClub')

  return {
    source,
    view,
    setView,
    filters: {
      keyword,
      setKeyword: resetPage(setKeyword),
      statuses,
      toggleStatus: (status: TaskStatus) => {
        setStatuses((current) => (current.includes(status) ? current.filter((item) => item !== status) : [...current, status]))
        setPage(0)
      },
      priority,
      setPriority: resetPage(setPriority),
      due,
      setDue: resetPage(setDue),
      clubId,
      setClubId: resetPage(setClubId),
      eventId,
      setEventId: resetPage(setEventId),
      clubOptions: facets.data?.clubs ?? [],
      eventOptions: facets.data?.events ?? [],
      activeCount: [priority, due, clubId, eventId, debouncedKeyword].filter(Boolean).length,
      clear: () => {
        setKeyword('')
        setPriority('')
        setDue('')
        setClubId('')
        setEventId('')
        setStatuses(BOARD_STATUSES)
        setPage(0)
      },
    },
    tasks: content,
    columns,
    visibleStatuses: statuses,
    loading: tasks.isPending && statuses.length > 0,
    refreshing: tasks.isFetching && !tasks.isPending,
    error: tasks.error,
    refetch: () => void tasks.refetch(),
    page: tasks.data?.page ?? 0,
    totalPages: tasks.data?.totalPages ?? 0,
    totalElements: tasks.data?.totalElements ?? 0,
    pageSize: LIST_PAGE_SIZE,
    setPage,
    truncated: view === 'board' && (tasks.data?.totalElements ?? 0) > BOARD_LIMIT,
    transition,
    selected: selectedTaskId && selectedClubId ? { taskId: selectedTaskId, clubId: selectedClubId } : null,
    openTask: (task: Pick<TaskSummary, 'id' | 'clubId'>) => {
      const next = new URLSearchParams(searchParams)
      next.set('task', task.id)
      if (source.kind === 'mine') next.set('taskClub', task.clubId)
      setSearchParams(next)
    },
    closeTask: () => {
      const next = new URLSearchParams(searchParams)
      next.delete('task')
      next.delete('taskClub')
      setSearchParams(next)
    },
  }
}

export type TaskWorkspaceViewModel = ReturnType<typeof useTaskWorkspaceViewModel>
