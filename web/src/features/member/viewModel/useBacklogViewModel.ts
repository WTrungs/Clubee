import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import type { BacklogItem, BacklogKind, BacklogQuery, BacklogStatus } from '../model/backlogTypes'
import { memberRepository } from '../model/memberRepository'
import { BACKLOG_KINDS, backlogKindDisplay, backlogStatusDisplay, groupByFormerMember, resolvedToast } from './backlogDisplay'
import { memberQueryKeys } from './memberQueryKeys'
import { useRefreshMemberData } from './useRefreshMemberData'

export const BACKLOG_PAGE_SIZE = 50

/** Mục đang mở sheet chọn người: giao lại việc hoặc chỉ định người giữ chức. */
export interface ResolvingTarget {
  item: BacklogItem
  action: 'REASSIGN' | 'APPOINT'
}

/** FR-MEM-09: tab Tồn đọng, lọc theo trạng thái, loại và người cũ (lấy từ URL), nhóm theo người cũ. */
export function useBacklogViewModel(formerMemberId: string | null, clearFormer: () => void) {
  const { clubId } = useCurrentClub()
  const refresh = useRefreshMemberData(clubId)
  const [status, setStatus] = useState<BacklogStatus>('OPEN')
  const [kind, setKind] = useState<BacklogKind | ''>('')
  const [page, setPage] = useState(0)
  const [resolving, setResolving] = useState<ResolvingTarget | null>(null)
  const [dismissing, setDismissing] = useState<BacklogItem | null>(null)

  const query: BacklogQuery = { status, kind: kind || undefined, formerMemberId: formerMemberId ?? undefined, page, size: BACKLOG_PAGE_SIZE }
  const list = useQuery({ queryKey: memberQueryKeys.backlog(clubId, query), queryFn: () => memberRepository.backlog(clubId, query), placeholderData: keepPreviousData })

  const dismiss = useMutation({
    mutationFn: ({ item, reason }: { item: BacklogItem; reason: string }) => memberRepository.resolveBacklog(clubId, item.id, { action: 'DISMISS', reason, version: item.version }),
    meta: { silentError: true },
    onSuccess: (saved) => {
      toast.success(resolvedToast(saved, 'DISMISS', ''))
      setDismissing(null)
      return refresh()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      // Mục đã đổi hoặc đã có người xử lý: đóng hộp và tải lại, không gửi đè (NFR-REL-03).
      if (isConflict(error) || (error instanceof ApiError && (error.status === 422 || error.status === 403))) {
        setDismissing(null)
        void refresh()
      }
    },
  })

  const items = list.data?.content ?? []
  const totalPages = list.data?.totalPages ?? 0
  // Xử lý xong mục cuối của trang cuối thì trang đó biến mất; lùi về trang cuối còn lại.
  if (totalPages > 0 && page >= totalPages) setPage(totalPages - 1)
  // Nhớ tên người cũ đã thấy, để khi bộ lọc không còn mục nào vẫn nêu đúng tên.
  const seenName = formerMemberId ? (items.find((item) => item.formerMember.id === formerMemberId)?.formerMember.fullName ?? null) : null
  const [knownName, setKnownName] = useState<{ id: string; name: string } | null>(null)
  if (formerMemberId && seenName && (knownName?.id !== formerMemberId || knownName.name !== seenName)) setKnownName({ id: formerMemberId, name: seenName })
  const formerName = formerMemberId ? (seenName ?? (knownName?.id === formerMemberId ? knownName.name : null)) : null
  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value)
    setPage(0)
  }

  return {
    status,
    setStatus: resetPage(setStatus),
    statusFilters: (['OPEN', 'RESOLVED'] as const).map((value) => ({ value, label: backlogStatusDisplay[value].label })),
    kind,
    setKind: resetPage(setKind),
    kindFilters: [{ value: '' as const, label: 'Mọi loại' }, ...BACKLOG_KINDS.map((value) => ({ value, label: backlogKindDisplay[value].label }))],
    formerMemberId,
    formerName,
    clearFormer: () => {
      clearFormer()
      setPage(0)
    },
    groups: groupByFormerMember(items),
    empty: !list.isPending && !list.error && items.length === 0,
    loading: list.isPending,
    error: list.error,
    refetch: () => void list.refetch(),
    page: list.data?.page ?? 0,
    totalPages,
    totalElements: list.data?.totalElements ?? 0,
    pageSize: BACKLOG_PAGE_SIZE,
    setPage,
    resolving,
    openResolve: (item: BacklogItem, action: 'REASSIGN' | 'APPOINT') => setResolving({ item, action }),
    closeResolve: () => setResolving(null),
    dismissing,
    openDismiss: (item: BacklogItem) => setDismissing(item),
    closeDismiss: () => !dismiss.isPending && setDismissing(null),
    confirmDismiss: (reason: string) => dismissing && dismiss.mutate({ item: dismissing, reason }),
    dismissPending: dismiss.isPending,
  }
}

export type BacklogViewModel = ReturnType<typeof useBacklogViewModel>
