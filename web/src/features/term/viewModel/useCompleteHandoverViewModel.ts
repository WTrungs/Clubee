import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import type { Handover } from '../model/handoverTypes'
import { termRepository } from '../model/termRepository'
import { completedToast, completionSummary } from './handoverDisplay'
import { termQueryKeys } from './termQueryKeys'

/** FR-TERM-06: ban chủ nhiệm cũ hoàn tất bàn giao khi mọi điều kiện đã đạt; xong thì quyền đổi khắp nơi nên tải lại toàn bộ. */
export function useCompleteHandoverViewModel(handover: Handover, onClose: () => void) {
  const { clubId } = useCurrentClub()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const handoverKey = termQueryKeys.handover(clubId, handover.id)
  const itemsKey = termQueryKeys.handoverItems(clubId, handover.id)
  const refreshHandover = () => Promise.all([queryClient.invalidateQueries({ queryKey: handoverKey }), queryClient.invalidateQueries({ queryKey: itemsKey })])
  /** Chức vụ, ban, nhiệm kỳ, Trưởng BTC đều đã đổi; làm mới mọi thứ trừ chính phiên này (người không tái đắc cử không còn xem được nó). */
  const leaveForTerms = () => {
    onClose()
    void navigate(`/clubs/${encodeURIComponent(clubId)}/terms`)
    void queryClient.invalidateQueries({ predicate: (query) => !(query.queryKey[0] === 'terms' && (query.queryKey[1] === 'handover' || query.queryKey[1] === 'handoverItems')) })
  }

  const mutation = useMutation({
    mutationFn: () => termRepository.complete(clubId, handover.id, { action: 'COMPLETE', version: handover.version }),
    meta: { silentError: true },
    onSuccess: (saved) => {
      queryClient.setQueryData(handoverKey, saved)
      toast.success(completedToast(saved))
      leaveForTerms()
    },
    // 409, 422 hay 403 đều có nghĩa phiên trên màn đã cũ: tải lại để người dùng xem lại trước khi bấm tiếp.
    onError: () => void refreshHandover(),
  })

  const error = mutation.error
  const blocked = error instanceof ApiError && error.code === 'HANDOVER_BLOCKED'
  const preview = handover.completionPreview
  // Người khác trong ban chủ nhiệm cũ đã hoàn tất trước (thấy được sau khi tải lại vì 409).
  const completedBy = handover.status === 'COMPLETED' ? (handover.completedBy?.fullName ?? 'ban chủ nhiệm') : null
  return {
    completedBy,
    goToTerms: leaveForTerms,
    summary: preview ? completionSummary(handover, preview) : [],
    /** Lý do chặn theo lần đọc gần nhất; máy chủ trả 422 thì dùng danh sách máy chủ vừa gửi. */
    blockers: blocked ? error.fieldErrors.map((fieldError) => fieldError.message) : handover.blockers,
    canSubmit: handover.blockers.length === 0 && !blocked && preview !== null && completedBy === null,
    submit: () => mutation.mutate(),
    pending: mutation.isPending,
    conflict: isConflict(error) && completedBy === null,
    errorMessage: error && !blocked && !isConflict(error) && completedBy === null ? getErrorMessage(error) : null,
    reset: () => mutation.reset(),
  }
}
