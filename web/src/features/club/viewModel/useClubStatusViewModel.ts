import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { clubRepository } from '../model/clubRepository'
import type { ClubTransitionAction } from '../model/clubTypes'
import { useCurrentClub } from './clubContext'
import { CLUB_TRANSITIONS_FROM, clubTransitionDisplay, confirmsShortName } from './clubStatusDisplay'
import { clubQueryKeys } from './useClubDetail'

/** FR-CLB-04: ban chủ nhiệm tạm ngừng, cho hoạt động lại hoặc giải thể CLB, bắt buộc lý do. */
export function useClubStatusViewModel(open: boolean, onDone: () => void) {
  const queryClient = useQueryClient()
  const { clubId, club } = useCurrentClub()
  const actions = CLUB_TRANSITIONS_FROM[club.status]
  const [action, setAction] = useState<ClubTransitionAction | null>(null)
  const [reason, setReason] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [touched, setTouched] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)

  const mutation = useMutation({
    mutationFn: (chosen: ClubTransitionAction) => clubRepository.transition(clubId, { action: chosen, reason: reason.trim(), version: club.version }),
    meta: { silentError: true },
    onSuccess: (saved, chosen) => {
      queryClient.setQueryData(clubQueryKeys.detail(saved.id), saved)
      // Trạng thái CLB đổi quyền ở mọi trang (nút tạo, nút sửa), nên làm mới toàn bộ dữ liệu đã tải.
      void queryClient.invalidateQueries()
      toast.success(clubTransitionDisplay[chosen].done)
      onDone()
    },
  })

  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setAction(actions.length === 1 ? (actions[0] ?? null) : null)
      setReason('')
      setConfirmText('')
      setTouched(false)
      mutation.reset()
    }
  }

  const trimmed = reason.trim()
  const reasonError = touched && trimmed.length < REASON_MIN ? `Vui lòng nhập ít nhất ${REASON_MIN} ký tự.` : undefined
  const needsShortName = action === 'DISSOLVE'
  const shortNameError = touched && needsShortName && !confirmsShortName(confirmText, club.shortName) ? `Gõ đúng tên viết tắt ${club.shortName} để xác nhận.` : undefined
  const conflict = isConflict(mutation.error)
  const openEvents = mutation.error instanceof ApiError && mutation.error.code === 'CLUB_HAS_OPEN_EVENTS'

  return {
    clubName: club.name,
    shortName: club.shortName,
    status: club.status,
    actions,
    options: actions.map((action) => ({ action, label: clubTransitionDisplay[action].label, hint: clubTransitionDisplay[action].hint })),
    action,
    selectAction: (next: ClubTransitionAction) => {
      setAction(next)
      mutation.reset()
    },
    reason,
    setReason,
    reasonMax: REASON_MAX,
    reasonError,
    needsShortName,
    confirmText,
    setConfirmText,
    shortNameError,
    actionError: touched && action === null ? 'Chọn thao tác.' : undefined,
    submit: () => {
      setTouched(true)
      if (!action || trimmed.length < REASON_MIN || (needsShortName && !confirmsShortName(confirmText, club.shortName))) return
      mutation.mutate(action)
    },
    pending: mutation.isPending,
    conflict,
    reload: () => {
      mutation.reset()
      void queryClient.invalidateQueries({ queryKey: clubQueryKeys.detail(clubId) })
    },
    /** Còn sự kiện chưa đóng thì đưa người dùng sang danh sách sự kiện để đóng trước. */
    eventsPath: openEvents ? `/clubs/${encodeURIComponent(clubId)}/events` : null,
    errorMessage: mutation.error && !conflict ? getErrorMessage(mutation.error) : null,
  }
}
