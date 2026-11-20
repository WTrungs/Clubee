import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError } from '@/api/apiError'
import { sessionQueryKey } from '@/api/queryClient'
import { eventRepository } from '../model/eventRepository'
import type { SharedEvent } from '../model/eventTypes'
import { eventQueryKeys } from './eventQueryKeys'

/** Chia lời mời theo việc cần làm: chờ trả lời, đang đồng tổ chức, còn lại là lịch sử (từ chối, bị gỡ). */
export function groupSharedEvents(items: SharedEvent[]) {
  return {
    pending: items.filter((item) => item.status === 'SENT'),
    active: items.filter((item) => item.status === 'ACCEPTED'),
    past: items.filter((item) => item.status === 'DECLINED' || item.status === 'REMOVED'),
  }
}

/** FR-EVT-08: ban chủ nhiệm CLB được mời xem và trả lời lời mời đồng tổ chức (tab Sự kiện chung). */
export function useCoHostInvitationsViewModel(clubId: string, enabled: boolean) {
  const queryClient = useQueryClient()
  const [declineTarget, setDeclineTarget] = useState<SharedEvent | null>(null)
  const invitations = useQuery({
    queryKey: eventQueryKeys.coHostInvitations(clubId),
    queryFn: () => eventRepository.coHostInvitations(clubId),
    enabled,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: eventQueryKeys.coHostInvitations(clubId) })

  // Lỗi hiện bằng thông báo chung; lời mời vừa đổi ở chỗ khác (409, 422) thì tải lại cho đúng trạng thái.
  const decide = useMutation({
    mutationFn: ({ invitation, decision, note }: { invitation: SharedEvent; decision: 'ACCEPT' | 'DECLINE'; note: string | null }) =>
      eventRepository.decideCoHost(clubId, invitation.id, { decision, note, version: invitation.version }),
    onSuccess: async (updated) => {
      await refresh()
      // Nhận lời thì ban chủ nhiệm thành khách của CLB chủ trì: tải lại phiên để menu, "CLB của tôi" có sự kiện chung.
      if (updated.status === 'ACCEPTED') void queryClient.invalidateQueries({ queryKey: sessionQueryKey })
      toast.success(updated.status === 'ACCEPTED' ? `Đã nhận lời đồng tổ chức ${updated.event.name}.` : `Đã từ chối lời mời ${updated.event.name}.`)
      setDeclineTarget(null)
    },
    onError: (error) => {
      if (error instanceof ApiError && (error.status === 409 || error.status === 422)) {
        void refresh()
        setDeclineTarget(null)
      }
    },
  })

  const items = invitations.data ?? []
  return {
    ...groupSharedEvents(items),
    total: items.length,
    loading: invitations.isPending && enabled,
    error: invitations.error,
    refetch: () => void invitations.refetch(),
    accept: (invitation: SharedEvent) => decide.mutate({ invitation, decision: 'ACCEPT', note: null }),
    acceptingId: decide.isPending && decide.variables?.decision === 'ACCEPT' ? decide.variables.invitation.id : null,
    busy: decide.isPending,
    declineTarget,
    openDecline: (invitation: SharedEvent) => {
      decide.reset()
      setDeclineTarget(invitation)
    },
    closeDecline: () => {
      if (!decide.isPending) setDeclineTarget(null)
    },
    confirmDecline: (note: string) => {
      if (declineTarget) decide.mutate({ invitation: declineTarget, decision: 'DECLINE', note })
    },
    declining: decide.isPending && decide.variables?.decision === 'DECLINE',
  }
}

export type CoHostInvitationsViewModel = ReturnType<typeof useCoHostInvitationsViewModel>
