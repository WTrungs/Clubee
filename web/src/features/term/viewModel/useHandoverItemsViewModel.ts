import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict, isForbidden } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import type { EventLeadDecisionRequest, Handover, HandoverItem, HandoverItemQuery, HandoverItemStatus, ItemConfirmationRequest } from '../model/handoverTypes'
import { termRepository } from '../model/termRepository'
import {
  batchConfirmable,
  canSubstituteItem,
  confirmedToast,
  conflictNotice,
  HANDOVER_ITEM_KINDS,
  HANDOVER_STATUS_FILTERS,
  handoverItemKindLabel,
  needsDecisionDialog,
  parseItemKind,
  parseItemStatus,
  statusFilterCount,
  statusFilterLabel,
  substitutedToast,
} from './handoverDisplay'
import { termQueryKeys } from './termQueryKeys'

const BOARD_ROLES = ['PRESIDENT', 'VICE_PRESIDENT', 'TREASURER']

export const HANDOVER_ITEM_PAGE_SIZE = 50

export interface CatalogNotice {
  tone: 'warning' | 'danger'
  message: string
}

/** Lỗi 400 có lỗi theo dòng thì nêu dòng đó (ví dụ người được chọn không đủ điều kiện), không chỉ câu chung. */
function confirmErrorText(error: unknown): string {
  if (error instanceof ApiError && error.fieldErrors.length > 0) return error.fieldErrors.map((fieldError) => fieldError.message).join(' ')
  return getErrorMessage(error)
}

/** FR-TERM-04, 05: danh mục theo loại và trạng thái (giữ trên URL), ban chủ nhiệm mới xác nhận từng mục hoặc cả trang đang hiện. */
export function useHandoverItemsViewModel(handover: Handover) {
  const { clubId } = useCurrentClub()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const kind = parseItemKind(searchParams.get('kind'))
  const status = parseItemStatus(searchParams.get('status'))
  const [page, setPage] = useState(0)
  const [decisionItem, setDecisionItem] = useState<HandoverItem | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [notice, setNotice] = useState<CatalogNotice | null>(null)
  const [substituting, setSubstituting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [substituteOpen, setSubstituteOpen] = useState(false)

  const query: HandoverItemQuery = { kind, status: status || undefined, page, size: HANDOVER_ITEM_PAGE_SIZE }
  // Số liệu trong mục có thể đổi bất cứ lúc nào (số dư, Trưởng BTC), nên mỗi lần mở trang đều tải mới.
  const items = useQuery({
    queryKey: termQueryKeys.handoverItemPage(clubId, handover.id, query),
    queryFn: () => termRepository.items(clubId, handover.id, query),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })
  const totalPages = items.data?.totalPages ?? 0
  // Xác nhận xong ở bộ lọc Chờ xác nhận thì trang cuối có thể biến mất; lùi về trang cuối còn lại.
  if (totalPages > 0 && page >= totalPages) setPage(totalPages - 1)

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: termQueryKeys.handoverItems(clubId, handover.id) }),
      queryClient.invalidateQueries({ queryKey: termQueryKeys.handover(clubId, handover.id) }),
      queryClient.invalidateQueries({ queryKey: termQueryKeys.list(clubId) }),
    ])

  const mutation = useMutation({
    mutationFn: (entries: ItemConfirmationRequest[]) => termRepository.confirmItems(clubId, handover.id, { items: entries }),
    meta: { silentError: true },
    onMutate: () => setNotice(null),
    onSuccess: (saved, entries) => {
      queryClient.setQueryData(termQueryKeys.handover(clubId, saved.id), saved)
      toast.success(confirmedToast(entries.length))
      setDecisionItem(null)
      setBatchOpen(false)
      // Giữ nút khóa tới khi danh sách mới về, để không bấm lại theo version cũ rồi nhận 409 sai nghĩa.
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: termQueryKeys.handoverItems(clubId, handover.id) }),
        queryClient.invalidateQueries({ queryKey: termQueryKeys.list(clubId) }),
      ])
    },
    onError: (error) => {
      if (isConflict(error)) {
        const stale = error instanceof ApiError ? error.fieldErrors.length : 0
        setDecisionItem(null)
        setBatchOpen(false)
        setNotice({ tone: 'warning', message: conflictNotice(stale) })
        void refresh()
        return
      }
      // Mất tư cách người được bầu (403) hoặc phiên vừa hoàn tất (422) thì nút Xác nhận phải biến mất theo máy chủ.
      if (isForbidden(error) || (error instanceof ApiError && error.status === 422)) void refresh()
      if (decisionItem === null) {
        setBatchOpen(false)
        setNotice({ tone: 'danger', message: confirmErrorText(error) })
      }
    },
  })

  const leaveSubstitute = () => {
    setSubstituting(false)
    setSelected([])
    setSubstituteOpen(false)
  }

  // FR-TERM-07: một mục đã cũ thì không mục nào được ghi, giống xác nhận trực tiếp.
  const substitute = useMutation({
    mutationFn: ({ entries, reason }: { entries: Array<{ itemId: string; version: number }>; reason: string }) =>
      termRepository.substituteConfirm(clubId, handover.id, { items: entries, reason }),
    meta: { silentError: true },
    onMutate: () => setNotice(null),
    onSuccess: (saved, { entries }) => {
      queryClient.setQueryData(termQueryKeys.handover(clubId, saved.id), saved)
      toast.success(substitutedToast(entries.length))
      leaveSubstitute()
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: termQueryKeys.handoverItems(clubId, handover.id) }),
        queryClient.invalidateQueries({ queryKey: termQueryKeys.list(clubId) }),
      ])
    },
    onError: (error) => {
      setSubstituteOpen(false)
      if (isConflict(error)) {
        const stale = error instanceof ApiError ? error.fieldErrors.length : 0
        setSelected([])
        setNotice({ tone: 'warning', message: conflictNotice(stale) })
        void refresh()
        return
      }
      if (isForbidden(error) || (error instanceof ApiError && error.status === 422)) {
        setSelected([])
        void refresh()
      }
      setNotice({ tone: 'danger', message: confirmErrorText(error) })
    },
  })

  const setParam = (key: 'kind' | 'status', value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
    setPage(0)
  }

  const content = items.data?.content ?? []
  const kindCounts = handover.counts.byKind[kind]
  const batch = batchConfirmable(content)
  const canConfirm = handover.allowedActions.includes('CONFIRM')
  const canSubstitute = handover.allowedActions.includes('SUBSTITUTE_CONFIRM')
  const substitutable = content.filter(canSubstituteItem)
  // Chỉ gửi mục đang hiện; mục đã chọn ở trang hoặc bộ lọc khác không tính.
  const chosen = substitutable.filter((item) => selected.includes(item.id))
  // Đang đổi trang hoặc bộ lọc thì danh sách hiện là dữ liệu cũ, chưa cho xác nhận theo nó.
  const locked = mutation.isPending || substitute.isPending || items.isPlaceholderData

  return {
    kind,
    setKind: (value: string) => setParam('kind', parseItemKind(value)),
    kindLabel: handoverItemKindLabel[kind],
    kindTabs: HANDOVER_ITEM_KINDS.map((value) => ({ value, label: handoverItemKindLabel[value], count: handover.counts.byKind[value].pending })),
    status,
    setStatus: (value: HandoverItemStatus | '') => setParam('status', value),
    statusFilters: HANDOVER_STATUS_FILTERS.map((value) => ({ value, label: statusFilterLabel(value), count: statusFilterCount(kindCounts, value) })),
    items: content,
    loading: items.isPending,
    error: items.error,
    refetch: () => void items.refetch(),
    page: items.data?.page ?? 0,
    totalPages,
    totalElements: items.data?.totalElements ?? 0,
    pageSize: HANDOVER_ITEM_PAGE_SIZE,
    setPage,
    canConfirm,
    locked,
    isConfirming: (itemId: string) => mutation.isPending && (mutation.variables?.some((entry) => entry.itemId === itemId) ?? false),
    confirmItem: (item: HandoverItem) => {
      if (needsDecisionDialog(item)) {
        mutation.reset()
        setDecisionItem(item)
        return
      }
      mutation.mutate([{ itemId: item.id, version: item.version }])
    },
    batch,
    batchSkipped: content.filter((item) => item.status === 'PENDING' && needsDecisionDialog(item) && item.allowedActions.includes('CONFIRM')).length,
    batchOpen,
    openBatch: () => setBatchOpen(true),
    closeBatch: () => !mutation.isPending && setBatchOpen(false),
    confirmBatch: () => mutation.mutate(batch.map((item) => ({ itemId: item.id, version: item.version }))),
    batchPending: mutation.isPending && batchOpen,
    decisionItem,
    closeDecision: () => !mutation.isPending && setDecisionItem(null),
    submitDecision: (eventLead: EventLeadDecisionRequest) => {
      if (decisionItem) mutation.mutate([{ itemId: decisionItem.id, version: decisionItem.version, eventLead }])
    },
    decisionPending: mutation.isPending && decisionItem !== null,
    decisionError: decisionItem && mutation.error && !isConflict(mutation.error) ? confirmErrorText(mutation.error) : null,
    notice,
    canSubstitute,
    hasPending: handover.counts.pending > 0,
    hasNewBoard: handover.appointments.some((appointment) => BOARD_ROLES.includes(appointment.role)),
    substituting: substituting && canSubstitute,
    startSubstitute: () => {
      setNotice(null)
      setSubstituting(true)
    },
    cancelSubstitute: () => !substitute.isPending && leaveSubstitute(),
    substitutableCount: substitutable.length,
    chosenCount: chosen.length,
    isChosen: (itemId: string) => chosen.some((item) => item.id === itemId),
    toggleChosen: (itemId: string) => setSelected((current) => (current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId])),
    allChosen: substitutable.length > 0 && chosen.length === substitutable.length,
    toggleAllChosen: () => setSelected(chosen.length === substitutable.length ? [] : substitutable.map((item) => item.id)),
    substituteOpen,
    openSubstituteDialog: () => chosen.length > 0 && setSubstituteOpen(true),
    closeSubstituteDialog: () => !substitute.isPending && setSubstituteOpen(false),
    submitSubstitute: (reason: string) => substitute.mutate({ entries: chosen.map((item) => ({ itemId: item.id, version: item.version })), reason }),
    substitutePending: substitute.isPending,
  }
}

export type HandoverItemsViewModel = ReturnType<typeof useHandoverItemsViewModel>
