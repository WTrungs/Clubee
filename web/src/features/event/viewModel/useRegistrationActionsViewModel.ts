import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/apiError'
import { attendanceQueryKeys } from '@/features/attendance/viewModel/attendanceQueryKeys'
import { eventRepository } from '../model/eventRepository'
import { eventQueryKeys } from './eventQueryKeys'

/** FR-EVT-13, 14: người đăng ký tự hủy hoặc xác nhận lại; chỉ báo xong khi máy chủ lưu, bị từ chối thì báo lý do và tải lại (NFR-REL-04, IF-01). */
export function useRegistrationActionsViewModel(clubId: string, eventId: string) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: eventQueryKeys.detail(clubId, eventId) }),
      queryClient.invalidateQueries({ queryKey: eventQueryKeys.lists }),
      queryClient.invalidateQueries({ queryKey: eventQueryKeys.registrationsOf(clubId, eventId) }),
      // Danh sách dự kiến điểm danh sự kiện lấy theo người đang giữ chỗ.
      queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.sheets({ type: 'EVENT', clubId, id: eventId }) }),
    ])

  const cancel = useMutation({
    mutationFn: (registrationId: string) => eventRepository.cancelRegistration(clubId, eventId, registrationId),
    meta: { silentError: true },
    onSuccess: async () => {
      await refresh()
      setConfirming(false)
      toast.success('Đã hủy đăng ký.')
    },
    onError: (error) => {
      // Hạn hủy đã qua hoặc sự kiện đã đổi: đóng hộp, nêu lý do và tải lại để nút hiện đúng.
      setConfirming(false)
      toast.error(getErrorMessage(error))
      void refresh()
    },
  })

  const reconfirm = useMutation({
    mutationFn: (registrationId: string) => eventRepository.reconfirmRegistration(clubId, eventId, registrationId),
    meta: { silentError: true },
    onSuccess: async () => {
      await refresh()
      toast.success('Đã xác nhận tham dự theo giờ mới.')
    },
    onError: (error) => {
      // Quá hạn xác nhận hoặc sự kiện đã đổi: nêu lý do và tải lại để trạng thái hiện đúng.
      toast.error(getErrorMessage(error))
      void refresh()
    },
  })

  return {
    confirming,
    openCancel: () => setConfirming(true),
    closeCancel: () => {
      if (!cancel.isPending) setConfirming(false)
    },
    confirmCancel: (registrationId: string) => cancel.mutate(registrationId),
    cancelling: cancel.isPending,
    reconfirm: (registrationId: string) => reconfirm.mutate(registrationId),
    reconfirming: reconfirm.isPending,
    /** Hai thao tác cùng đổi một đăng ký nên khi một bên đang chờ thì khóa bên kia. */
    busy: cancel.isPending || reconfirm.isPending,
  }
}
