import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { useClampPage } from '@/shared/hooks/useClampPage'
import { TRANSFER_NOTE_MAX, TRANSFER_NOTE_MIN } from '@/shared/lib/transferRules'
import { presidencyTransferRepository } from '../model/presidencyTransferRepository'
import type { AdminTransferQuery, AdminTransferRequest } from '../model/presidencyTransferTypes'
import { adminQueryKeys } from './adminQueryKeys'

const PAGE_SIZE = 20
export type AdminTransferFilter = AdminTransferQuery['status']

const transferKeys = {
  lists: ['admin', 'transfers'] as const,
  list: (query: AdminTransferQuery) => ['admin', 'transfers', query] as const,
  candidates: (requestId: string) => ['admin', 'transferCandidates', requestId] as const,
}

/** FR-ACC-08 phía Admin: xem yêu cầu, xem thành viên Chính thức của đúng CLB đó, chuyển quyền hoặc từ chối kèm ghi chú. */
export function useAdminTransfersViewModel() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AdminTransferFilter>('PENDING')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<AdminTransferRequest | null>(null)
  const [newPresidentId, setNewPresidentId] = useState('')
  const [note, setNote] = useState('')
  const [attempted, setAttempted] = useState<'APPROVE' | 'REJECT' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const query: AdminTransferQuery = { status, page, size: PAGE_SIZE }

  const list = useQuery({ queryKey: transferKeys.list(query), queryFn: () => presidencyTransferRepository.adminList(query), placeholderData: keepPreviousData })
  useClampPage(page, list.data?.totalPages, setPage)
  const [serverErrors, setServerErrors] = useState<{ newPresidentId?: string; note?: string }>({})
  const open = selected?.allowedActions.includes('DECIDE') ?? false
  const canApprove = selected?.checkNow?.boardInactive ?? false
  // Mỗi lần mở yêu cầu đều tải lại để máy chủ ghi nhật ký lần xem (SRS 3.4); chỉ còn từ chối được thì không cần xem danh sách.
  const candidates = useQuery({
    queryKey: transferKeys.candidates(selected?.id ?? ''),
    queryFn: () => presidencyTransferRepository.candidates(selected?.id ?? ''),
    enabled: open && canApprove,
    staleTime: 0,
    gcTime: 0,
  })
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: transferKeys.lists }), queryClient.invalidateQueries({ queryKey: adminQueryKeys.metrics })])

  const decide = useMutation({
    mutationFn: ({ action }: { action: 'APPROVE' | 'REJECT' }) => {
      if (!selected) throw new Error('No request selected')
      return presidencyTransferRepository.decide(selected.id, { action, newPresidentId: action === 'APPROVE' ? newPresidentId : undefined, note: note.trim(), version: selected.version })
    },
    meta: { silentError: true },
    onSuccess: async (handled) => {
      setConfirming(false)
      setSelected(null)
      await refresh()
      toast.success(handled.status === 'APPROVED' ? `Đã chuyển quyền Chủ nhiệm ${handled.club.name} cho ${handled.newPresident?.fullName ?? ''}.` : 'Đã từ chối yêu cầu chuyển quyền.')
    },
    onError: async (error) => {
      setConfirming(false)
      if (error instanceof ApiError && error.status === 400) {
        // Người được chọn có thể vừa đổi tư cách: gắn lỗi vào đúng ô và tải lại danh sách người nhận.
        const mapped = Object.fromEntries(error.fieldErrors.filter((fieldError) => fieldError.field === 'newPresidentId' || fieldError.field === 'note').map((fieldError) => [fieldError.field, fieldError.message]))
        setServerErrors(mapped)
        if (Object.keys(mapped).length === 0) toast.error(getErrorMessage(error))
        void candidates.refetch()
        return
      }
      toast.error(isConflict(error) ? 'Yêu cầu vừa thay đổi. Đã tải lại danh sách.' : getErrorMessage(error))
      // Kết quả kiểm ban chủ nhiệm hoặc trạng thái có thể vừa đổi: tải lại rồi cập nhật yêu cầu đang mở.
      await refresh()
      const fresh = queryClient.getQueryData<{ content: AdminTransferRequest[] }>(transferKeys.list(query))?.content.find((request) => request.id === selected?.id)
      setSelected(fresh ?? null)
    },
  })

  const trimmedNote = note.trim()
  const noteError =
    attempted && (trimmedNote.length < TRANSFER_NOTE_MIN || trimmedNote.length > TRANSFER_NOTE_MAX) ? `Nhập từ ${TRANSFER_NOTE_MIN} đến ${TRANSFER_NOTE_MAX} ký tự.` : serverErrors.note
  const selectionError = attempted === 'APPROVE' && !newPresidentId ? 'Chọn Chủ nhiệm mới.' : serverErrors.newPresidentId
  const noteValid = trimmedNote.length >= TRANSFER_NOTE_MIN && trimmedNote.length <= TRANSFER_NOTE_MAX
  const noCandidates = open && canApprove && candidates.isSuccess && candidates.data.length === 0

  return {
    status,
    setStatus: (next: AdminTransferFilter) => {
      setStatus(next)
      setPage(0)
    },
    requests: list.data?.content ?? [],
    loading: list.isPending,
    error: list.error,
    refetch: () => void list.refetch(),
    page: list.data?.page ?? 0,
    totalPages: list.data?.totalPages ?? 0,
    totalElements: list.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
    selected,
    openRequest: (request: AdminTransferRequest) => {
      setSelected(request)
      setNewPresidentId('')
      setNote('')
      setAttempted(null)
      setServerErrors({})
    },
    closeRequest: () => {
      if (!decide.isPending) setSelected(null)
    },
    /** Ban chủ nhiệm đăng nhập lại sau khi có yêu cầu thì chỉ còn từ chối được. */
    canApprove,
    /** CLB không còn ai nhận được chức (người gửi vừa rời hoặc tạm nghỉ chẳng hạn) thì cũng chỉ còn từ chối. */
    noCandidates,
    candidates: candidates.data ?? [],
    candidatesLoading: candidates.isPending && candidates.fetchStatus !== 'idle',
    candidatesError: candidates.error,
    retryCandidates: () => void candidates.refetch(),
    newPresidentId,
    setNewPresidentId: (value: string) => {
      setNewPresidentId(value)
      setServerErrors((current) => ({ ...current, newPresidentId: undefined }))
    },
    newPresidentName: candidates.data?.find((candidate) => candidate.id === newPresidentId)?.fullName ?? '',
    note,
    setNote: (value: string) => {
      setNote(value)
      setServerErrors((current) => ({ ...current, note: undefined }))
    },
    noteError,
    selectionError,
    requestApprove: () => {
      setAttempted('APPROVE')
      // Người đã chọn có thể vừa rời khỏi danh sách sau lần tải lại; khi đó không mở hộp xác nhận.
      const stillListed = candidates.data?.some((candidate) => candidate.id === newPresidentId) ?? false
      if (noteValid && stillListed) setConfirming(true)
    },
    confirming,
    cancelConfirm: () => {
      if (!decide.isPending) setConfirming(false)
    },
    approve: () => decide.mutate({ action: 'APPROVE' }),
    reject: () => {
      setAttempted('REJECT')
      if (noteValid) decide.mutate({ action: 'REJECT' })
    },
    pending: decide.isPending,
  }
}

export type AdminTransfersViewModel = ReturnType<typeof useAdminTransfersViewModel>
