import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { useClampPage } from '@/shared/hooks/useClampPage'
import { memberRepository } from '../model/memberRepository'
import type { LeaveRequest, LeaveRequestQuery } from '../model/memberTypes'
import { memberQueryKeys } from './memberQueryKeys'
import { useRefreshMemberData } from './useRefreshMemberData'

const PAGE_SIZE = 20
export type LeaveFilter = NonNullable<LeaveRequestQuery['status']>

/** FR-MEM-07: người quản lý thành viên duyệt hoặc từ chối yêu cầu tạm nghỉ; máy chủ kiểm lại BR-MEM-05 khi duyệt. */
export function useLeaveRequestsViewModel() {
  const { clubId, club } = useCurrentClub()
  const refresh = useRefreshMemberData(clubId)
  const canManage = club.allowedActions.includes('MANAGE_MEMBERS')
  const [status, setStatus] = useState<LeaveFilter>('PENDING')
  const [page, setPage] = useState(0)
  const [dialog, setDialog] = useState<{ request: LeaveRequest; mode: 'approve' | 'reject' } | null>(null)
  const [conflict, setConflict] = useState(false)
  const query = { status, page, size: PAGE_SIZE }

  const requests = useQuery({
    queryKey: memberQueryKeys.leaveRequests(clubId, query),
    queryFn: () => memberRepository.leaveRequests(clubId, query),
    enabled: canManage,
    placeholderData: keepPreviousData,
  })
  useClampPage(page, requests.data?.totalPages, setPage)

  const decide = useMutation({
    mutationFn: ({ request, action, note }: { request: LeaveRequest; action: 'APPROVE' | 'REJECT'; note?: string }) =>
      memberRepository.decideLeave(clubId, request.id, { action, note, version: request.version }),
    meta: { silentError: true },
    onSuccess: async (decided) => {
      await refresh()
      setDialog(null)
      const name = decided.member.fullName
      toast.success(decided.status === 'APPROVED' ? `${name} đã chuyển sang Tạm nghỉ.` : `Đã từ chối yêu cầu tạm nghỉ của ${name}.`)
    },
    onError: (error) => {
      if (isConflict(error)) {
        setDialog(null)
        setConflict(true)
        return
      }
      toast.error(getErrorMessage(error))
      // Điều kiện chặn có thể vừa đổi (ví dụ vừa được gán chức), nên tải lại để thẻ hiện lý do mới.
      void requests.refetch()
    },
  })

  return {
    canManage,
    status,
    setStatus: (next: LeaveFilter) => {
      setStatus(next)
      setPage(0)
    },
    requests: requests.data?.content ?? [],
    loading: requests.isPending,
    error: requests.error,
    refetch: () => void requests.refetch(),
    page: requests.data?.page ?? 0,
    totalPages: requests.data?.totalPages ?? 0,
    totalElements: requests.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
    dialog,
    openDialog: (request: LeaveRequest, mode: 'approve' | 'reject') => {
      if (!decide.isPending) setDialog({ request, mode })
    },
    closeDialog: () => {
      if (!decide.isPending) setDialog(null)
    },
    approve: () => {
      if (dialog) decide.mutate({ request: dialog.request, action: 'APPROVE' })
    },
    reject: (note: string) => {
      if (dialog) decide.mutate({ request: dialog.request, action: 'REJECT', note })
    },
    pending: decide.isPending,
    conflict,
    reloadAfterConflict: () => {
      setConflict(false)
      void refresh()
    },
  }
}

export type LeaveRequestsViewModel = ReturnType<typeof useLeaveRequestsViewModel>
