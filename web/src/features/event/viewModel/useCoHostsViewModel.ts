import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError, getErrorMessage } from '@/api/apiError'
import { clubRepository } from '@/features/club/model/clubRepository'
import { clubQueryKeys } from '@/features/club/viewModel/useClubDetail'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { eventRepository } from '../model/eventRepository'
import type { ClubRef, CoHost } from '../model/eventTypes'
import { eventQueryKeys } from './eventQueryKeys'

export const COHOST_MESSAGE_MAX = 500

/** Một dòng trong danh bạ khi mời: CLB chủ trì và CLB đang có lời mời còn hiệu lực thì không chọn được (409). */
export interface CoHostOption extends ClubRef {
  field: string
  blockedReason: string | null
}

/** FR-EVT-08: khối CLB đồng tổ chức ở tab Ban tổ chức: danh sách, mời qua danh bạ CLB, gỡ kèm lý do. */
export function useCoHostsViewModel(clubId: string, eventId: string, enabled: boolean) {
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 250)
  const [selected, setSelected] = useState<ClubRef | null>(null)
  const [message, setMessage] = useState('')
  const [removeTarget, setRemoveTarget] = useState<CoHost | null>(null)

  const coHosts = useQuery({ queryKey: eventQueryKeys.coHosts(clubId, eventId), queryFn: () => eventRepository.coHosts(clubId, eventId), enabled })
  const directoryQuery = { q: debouncedKeyword || undefined, size: 20 }
  const directory = useQuery({
    queryKey: clubQueryKeys.directory(directoryQuery),
    queryFn: () => clubRepository.directory(directoryQuery),
    enabled: enabled && inviteOpen,
    placeholderData: keepPreviousData,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: eventQueryKeys.coHosts(clubId, eventId) })

  const invite = useMutation({
    mutationFn: (input: { club: ClubRef; message: string }) => eventRepository.inviteCoHost(clubId, eventId, { clubId: input.club.id, message: input.message }),
    meta: { silentError: true },
    onSuccess: async (created) => {
      await refresh()
      toast.success(`Đã gửi lời mời tới ${created.club.name}.`)
      setInviteOpen(false)
    },
    onError: (error) => {
      // Người khác vừa mời CLB này: tải lại để danh sách và danh bạ hiện đúng (NFR-REL-03).
      if (error instanceof ApiError && error.status === 409) void refresh()
    },
  })

  const remove = useMutation({
    // Lỗi hiện bằng thông báo chung vì hộp nhập lý do không có chỗ báo lỗi máy chủ.
    mutationFn: ({ coHost, reason }: { coHost: CoHost; reason: string }) => eventRepository.removeCoHost(clubId, eventId, coHost.id, { reason, version: coHost.version }),
    onSuccess: async (removed) => {
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: eventQueryKeys.subcommittees(clubId, eventId) })])
      toast.success(`Đã gỡ ${removed.club.name}. Nhân sự của CLB này đã rời ban tổ chức.`)
      setRemoveTarget(null)
    },
    onError: (error) => {
      if (error instanceof ApiError && (error.status === 409 || error.status === 422)) {
        void refresh()
        setRemoveTarget(null)
      }
    },
  })

  const list = coHosts.data ?? []
  const openClubIds = new Map(list.filter((coHost) => coHost.status === 'SENT' || coHost.status === 'ACCEPTED').map((coHost) => [coHost.club.id, coHost.status]))
  const options: CoHostOption[] = (directory.data?.content ?? []).map((club) => ({
    id: club.id,
    name: club.name,
    field: club.field,
    blockedReason: club.id === clubId ? 'CLB chủ trì' : openClubIds.get(club.id) === 'SENT' ? 'Đã mời, chờ trả lời' : openClubIds.get(club.id) === 'ACCEPTED' ? 'Đang đồng tổ chức' : null,
  }))

  return {
    coHosts: list,
    accepted: list.filter((coHost) => coHost.status === 'ACCEPTED'),
    loading: coHosts.isPending && enabled,
    error: coHosts.error,
    refetch: () => void coHosts.refetch(),

    inviteOpen,
    openInvite: () => {
      invite.reset()
      setKeyword('')
      setSelected(null)
      setMessage('')
      setInviteOpen(true)
    },
    closeInvite: () => {
      if (!invite.isPending) setInviteOpen(false)
    },
    keyword,
    setKeyword,
    options,
    optionsLoading: directory.isPending,
    optionsError: directory.error ? getErrorMessage(directory.error) : null,
    selected,
    select: (club: ClubRef) => {
      invite.reset()
      setSelected(club)
    },
    message,
    setMessage,
    messageError: message.trim().length > COHOST_MESSAGE_MAX ? `Lời nhắn tối đa ${COHOST_MESSAGE_MAX} ký tự.` : null,
    submitInvite: () => {
      if (selected && message.trim().length <= COHOST_MESSAGE_MAX) invite.mutate({ club: selected, message: message.trim() })
    },
    inviting: invite.isPending,
    inviteError: invite.error ? getErrorMessage(invite.error) : null,

    removeTarget,
    openRemove: (coHost: CoHost) => {
      remove.reset()
      setRemoveTarget(coHost)
    },
    closeRemove: () => {
      if (!remove.isPending) setRemoveTarget(null)
    },
    confirmRemove: (reason: string) => {
      if (removeTarget) remove.mutate({ coHost: removeTarget, reason })
    },
    removing: remove.isPending,
  }
}

export type CoHostsViewModel = ReturnType<typeof useCoHostsViewModel>
