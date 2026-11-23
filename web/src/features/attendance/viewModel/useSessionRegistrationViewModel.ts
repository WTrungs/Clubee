import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/apiError'
import { sessionRepository } from '../model/sessionRepository'
import type { SessionDetail } from '../model/sessionTypes'
import { attendanceQueryKeys } from './attendanceQueryKeys'

/** FR-ATT-03: tự đăng ký, hủy đăng ký buổi có giới hạn chỗ; bị từ chối thì nêu lý do và tải lại để nút hiện đúng. */
export function useSessionRegistrationViewModel(clubId: string, sessionId: string) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const accept = (saved: SessionDetail) => {
    queryClient.setQueryData(attendanceQueryKeys.session(clubId, sessionId), saved)
    void queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.registrationsOf(clubId, sessionId) })
    // Buổi có số chỗ: đối tượng điểm danh là người giữ chỗ.
    void queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.sheets({ type: 'SESSION', clubId, id: sessionId }) })
  }
  const reload = () => void queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.session(clubId, sessionId) })

  const register = useMutation({
    mutationFn: () => sessionRepository.register(clubId, sessionId),
    meta: { silentError: true },
    onSuccess: (saved) => {
      accept(saved)
      const mine = saved.myRegistration
      toast.success(mine?.status === 'WAITLISTED' ? `Đã vào danh sách chờ, vị trí ${mine.waitlistPosition ?? ''}.` : 'Đã nhận chỗ.')
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      reload()
    },
  })

  const cancel = useMutation({
    mutationFn: (registrationId: string) => sessionRepository.cancelRegistration(clubId, sessionId, registrationId),
    meta: { silentError: true },
    onSuccess: (saved) => {
      accept(saved)
      setConfirming(false)
      toast.success('Đã hủy đăng ký.')
    },
    onError: (error) => {
      setConfirming(false)
      toast.error(getErrorMessage(error))
      reload()
    },
  })

  return {
    register: () => register.mutate(),
    registering: register.isPending,
    confirming,
    openCancel: () => setConfirming(true),
    closeCancel: () => {
      if (!cancel.isPending) setConfirming(false)
    },
    confirmCancel: (registrationId: string) => cancel.mutate(registrationId),
    cancelling: cancel.isPending,
  }
}
