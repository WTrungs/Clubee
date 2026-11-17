import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { useClampPage } from '@/shared/hooks/useClampPage'
import { memberRepository } from '../model/memberRepository'
import type { JoinRequest, MemberTransitionAction } from '../model/memberTypes'
import { memberStatusDisplay } from './memberDisplay'
import { memberQueryKeys } from './memberQueryKeys'
import { useRefreshMemberData } from './useRefreshMemberData'

const PAGE_SIZE = 20

interface DecisionInput {
  request: JoinRequest
  action: MemberTransitionAction
  departmentId?: string
  reason?: string
}

/** Duyệt hoặc từ chối yêu cầu gia nhập (FR-MEM-03); chỉ ban chủ nhiệm có quyền, máy chủ quyết định. */
export function useJoinRequestsViewModel() {
  const { clubId, club } = useCurrentClub()
  const refresh = useRefreshMemberData(clubId)
  const canManage = club.allowedActions.includes('MANAGE_MEMBERS')
  const [page, setPage] = useState(0)
  const [dialog, setDialog] = useState<{ request: JoinRequest; mode: 'approve' | 'reject' } | null>(null)
  const [conflict, setConflict] = useState(false)

  const requests = useQuery({
    queryKey: memberQueryKeys.requests(clubId, page),
    queryFn: () => memberRepository.joinRequests(clubId, { page, size: PAGE_SIZE }),
    enabled: canManage,
    placeholderData: keepPreviousData,
  })
  const facets = useQuery({ queryKey: memberQueryKeys.facets(clubId), queryFn: () => memberRepository.facets(clubId), enabled: canManage })
  useClampPage(page, requests.data?.totalPages, setPage)

  const decide = useMutation({
    mutationFn: ({ request, ...input }: DecisionInput) => memberRepository.transition(clubId, request.membershipId, { ...input, version: request.version }),
    meta: { silentError: true },
    onSuccess: async (updated, input) => {
      await refresh()
      setDialog(null)
      const name = input.request.applicant.fullName
      toast.success(input.action === 'REJECT' ? `Đã từ chối yêu cầu của ${name}.` : `Đã duyệt ${name} vào CLB (${memberStatusDisplay[updated.status].label}).`)
    },
    onError: (error) => {
      if (isConflict(error)) {
        setDialog(null)
        setConflict(true)
      } else {
        toast.error(getErrorMessage(error))
      }
    },
  })

  return {
    canManage,
    requests: requests.data?.content ?? [],
    loading: requests.isPending,
    error: requests.error,
    refetch: () => void requests.refetch(),
    page: requests.data?.page ?? 0,
    totalPages: requests.data?.totalPages ?? 0,
    totalElements: requests.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
    /** Ban chính khi duyệt chỉ chọn trong các ban đang hoạt động. */
    departments: (facets.data?.departments ?? []).filter((department) => !department.closed),
    departmentsLoading: facets.isPending,
    departmentsError: facets.error ? getErrorMessage(facets.error) : null,
    retryDepartments: () => void facets.refetch(),
    dialog,
    openDialog: (request: JoinRequest, mode: 'approve' | 'reject') => {
      if (!decide.isPending) setDialog({ request, mode })
    },
    closeDialog: () => {
      if (!decide.isPending) setDialog(null)
    },
    approve: (action: MemberTransitionAction, departmentId: string) => {
      if (dialog) decide.mutate({ request: dialog.request, action, departmentId })
    },
    reject: (reason: string) => {
      if (dialog) decide.mutate({ request: dialog.request, action: 'REJECT', reason })
    },
    pending: decide.isPending,
    conflict,
    reloadAfterConflict: () => {
      setConflict(false)
      void refresh()
    },
  }
}

export type JoinRequestsViewModel = ReturnType<typeof useJoinRequestsViewModel>
