import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { memberRepository } from '../model/memberRepository'
import { memberActionDisplay, memberDetailActions, removalSummary, type MemberDetailAction } from './memberDisplay'
import { memberQueryKeys } from './memberQueryKeys'
import { useRefreshMemberData } from './useRefreshMemberData'

/** Chi tiết một thành viên và chuyển trạng thái theo ST-MEM (FR-MEM-06, 08). */
export function useMemberDetailViewModel(membershipId: string | null) {
  const { clubId } = useCurrentClub()
  const queryClient = useQueryClient()
  const refresh = useRefreshMemberData(clubId)
  // Trạng thái gắn với người đang mở, nên mở người khác thì hộp thoại và banner 409 cũ không còn.
  const [dialogState, setDialogState] = useState<{ membershipId: string; action: MemberDetailAction } | null>(null)
  const [conflictFor, setConflictFor] = useState<string | null>(null)
  const dialog = dialogState && dialogState.membershipId === membershipId ? dialogState.action : null
  const conflict = conflictFor !== null && conflictFor === membershipId
  const setDialog = (action: MemberDetailAction | null) => setDialogState(action && membershipId ? { membershipId, action } : null)

  const detail = useQuery({
    queryKey: memberQueryKeys.detail(clubId, membershipId ?? ''),
    queryFn: () => memberRepository.get(clubId, membershipId ?? ''),
    enabled: membershipId !== null,
  })
  const member = detail.data ?? null

  const transition = useMutation({
    mutationFn: (input: { action: MemberDetailAction; reason: string }) => {
      if (!member) throw new Error('Member not loaded')
      return memberRepository.transition(clubId, member.membershipId, { ...input, version: member.version })
    },
    meta: { silentError: true },
    onSuccess: async (updated, input) => {
      queryClient.setQueryData(memberQueryKeys.detail(clubId, updated.membershipId), updated)
      await refresh()
      setDialog(null)
      const name = updated.person.fullName
      toast.success(input.action === 'REMOVE' ? removalSummary(name, updated.backlogCount) : memberActionDisplay[input.action].success(name))
    },
    onError: (error) => {
      if (isConflict(error)) {
        setDialog(null)
        setConflictFor(membershipId)
      } else {
        toast.error(getErrorMessage(error))
      }
    },
  })

  return {
    member,
    loading: membershipId !== null && detail.isPending,
    error: detail.error,
    refetch: () => void detail.refetch(),
    actions: memberDetailActions(member?.allowedActions ?? []),
    /** Mọi chuyển ở màn chi tiết đều bắt buộc lý do nên luôn mở hộp thoại. */
    requestAction: (action: MemberDetailAction) => {
      if (!transition.isPending) setDialog(action)
    },
    dialog,
    closeDialog: () => {
      if (!transition.isPending) setDialog(null)
    },
    confirm: (reason: string) => {
      if (dialog) transition.mutate({ action: dialog, reason })
    },
    pending: transition.isPending,
    conflict,
    reloadAfterConflict: () => {
      setConflictFor(null)
      void refresh()
    },
  }
}

export type MemberDetailViewModel = ReturnType<typeof useMemberDetailViewModel>
