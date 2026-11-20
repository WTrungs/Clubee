import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { sessionRepository } from '../model/sessionRepository'
import { attendanceQueryKeys } from './attendanceQueryKeys'

export type SessionTab = 'info' | 'attendance'

export function useSessionDetailViewModel() {
  const { clubId } = useCurrentClub()
  const sessionId = useParams().sessionId ?? ''
  const [searchParams, setSearchParams] = useSearchParams()
  const session = useQuery({
    queryKey: attendanceQueryKeys.session(clubId, sessionId),
    queryFn: () => sessionRepository.get(clubId, sessionId),
  })
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const actions = session.data?.allowedActions ?? []
  const canViewAttendance = actions.includes('VIEW_ATTENDANCE')

  // FR-ATT-02: hủy riêng buổi này, trước giờ bắt đầu; máy chủ báo đối tượng của buổi.
  const cancel = useMutation({
    mutationFn: (reason: string) => sessionRepository.cancel(clubId, sessionId, { reason, version: session.data?.version ?? 0 }),
    meta: { silentError: true },
    onSuccess: (saved) => {
      queryClient.setQueryData(attendanceQueryKeys.session(clubId, saved.id), saved)
      void queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.sessionLists })
      setCancelOpen(false)
      toast.success(`Đã hủy buổi “${saved.title}”.`)
    },
    onError: (error) => {
      setCancelOpen(false)
      if (!isConflict(error)) toast.error(getErrorMessage(error))
      // Quyền hoặc giờ bắt đầu có thể đã đổi: tải lại để nút thao tác khớp máy chủ.
      void session.refetch()
    },
  })
  const tabs: Array<{ value: SessionTab; label: string }> = [
    { value: 'info', label: 'Thông tin' },
    ...(canViewAttendance ? [{ value: 'attendance' as const, label: 'Điểm danh' }] : []),
  ]
  const requested = searchParams.get('tab')
  const tab: SessionTab = tabs.some((item) => item.value === requested) ? (requested as SessionTab) : 'info'

  return {
    clubId,
    sessionId,
    session: session.data ?? null,
    loading: session.isPending,
    error: session.error,
    refetch: () => void session.refetch(),
    canViewAttendance,
    canEdit: actions.includes('EDIT'),
    canCancel: actions.includes('CANCEL'),
    editOpen,
    setEditOpen,
    cancelOpen,
    setCancelOpen: (open: boolean) => {
      if (open) cancel.reset()
      setCancelOpen(open)
    },
    cancelSession: (reason: string) => cancel.mutate(reason),
    cancelPending: cancel.isPending,
    conflict: isConflict(cancel.error),
    reloadAfterConflict: () => {
      cancel.reset()
      void session.refetch()
    },
    tabs,
    tab,
    setTab: (value: string) => {
      const next = new URLSearchParams(searchParams)
      if (value === 'info') next.delete('tab')
      else next.set('tab', value)
      setSearchParams(next, { replace: true })
    },
  }
}
