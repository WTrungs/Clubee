import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { attendanceQueryKeys } from '@/features/attendance/viewModel/attendanceQueryKeys'
import { eventRepository } from '../model/eventRepository'
import type { EventDetail, RescheduleEventRequest } from '../model/eventTypes'
import { othersHoldingSeats } from './eventDisplay'
import { eventQueryKeys } from './eventQueryKeys'
import { rescheduleDefaults, rescheduleSchema, sameSchedule, toRescheduleRequest, type RescheduleValues } from './rescheduleSchema'

const EMPTY: RescheduleValues = { startDate: '', startTime: '', endDate: '', endTime: '', deadlineDate: '', deadlineTime: '', reason: '' }

const serverField: Record<string, keyof RescheduleValues> = {
  startAt: 'startDate',
  endAt: 'endDate',
  registrationDeadline: 'deadlineDate',
  reason: 'reason',
}

/** FR-EVT-14: dời thời gian kèm lý do; chỉ báo xong khi máy chủ lưu, 409 thì đóng và tải lại thay vì ghi đè (NFR-REL-03, 04). */
export function useRescheduleViewModel(clubId: string, event: EventDetail | null) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  // Giữ version lúc mở: chi tiết có thể tải lại khi sheet còn mở, gửi đi vẫn phải gặp 409 nếu sự kiện đã đổi.
  const [openedVersion, setOpenedVersion] = useState(0)
  const form = useForm<RescheduleValues>({ resolver: zodResolver(rescheduleSchema), defaultValues: EMPTY })
  const eventId = event?.id ?? ''

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: eventQueryKeys.detail(clubId, eventId) }),
      queryClient.invalidateQueries({ queryKey: eventQueryKeys.lists }),
      queryClient.invalidateQueries({ queryKey: eventQueryKeys.registrationsOf(clubId, eventId) }),
      // Ngày điểm danh và người dự kiến điểm danh tính theo giờ sự kiện và người đang Nhận chỗ.
      queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.sheets({ type: 'EVENT', clubId, id: eventId }) }),
    ])

  const mutation = useMutation({
    mutationFn: (request: Omit<RescheduleEventRequest, 'version'>) => eventRepository.reschedule(clubId, eventId, { ...request, version: openedVersion }),
    meta: { silentError: true },
    onSuccess: async (updated) => {
      queryClient.setQueryData(eventQueryKeys.detail(clubId, eventId), updated)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: eventQueryKeys.lists }),
        queryClient.invalidateQueries({ queryKey: eventQueryKeys.registrationsOf(clubId, eventId) }),
        queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.sheets({ type: 'EVENT', clubId, id: eventId }) }),
      ])
      setOpen(false)
      const pending = updated.status === 'REGISTRATION_OPEN' ? othersHoldingSeats(updated) : 0
      toast.success(pending > 0 ? `Đã dời thời gian. ${pending} người giữ chỗ cần xác nhận lại.` : 'Đã dời thời gian sự kiện.')
    },
    onError: (error) => {
      if (isConflict(error)) {
        toast.error(getErrorMessage(error))
        setOpen(false)
        void refresh()
        return
      }
      if (!(error instanceof ApiError)) return
      // Mất quyền hoặc sự kiện đã đổi trạng thái: tải lại để nút Dời thời gian chỉ hiện khi còn hợp lệ.
      if (error.status === 403 || error.status === 422) void refresh()
      for (const fieldError of error.fieldErrors) {
        const field = serverField[fieldError.field]
        if (field) form.setError(field, { type: 'server', message: fieldError.message })
      }
    },
  })

  const error = mutation.error
  const fieldErrorsShown = error instanceof ApiError && error.fieldErrors.length > 0
  return {
    open,
    openSheet: () => {
      if (!event) return
      mutation.reset()
      setOpenedVersion(event.version)
      form.reset(rescheduleDefaults(event))
      setOpen(true)
    },
    close: () => {
      if (!mutation.isPending) setOpen(false)
    },
    form,
    submit: form.handleSubmit((values) => {
      if (!event) return
      const request = toRescheduleRequest(values)
      if (sameSchedule(event, request)) {
        form.setError('startDate', { type: 'manual', message: 'Thời gian mới trùng thời gian hiện tại.' })
        return
      }
      mutation.mutate(request)
    }),
    pending: mutation.isPending,
    errorMessage: error && !isConflict(error) && !fieldErrorsShown ? getErrorMessage(error) : null,
  }
}

export type RescheduleViewModel = ReturnType<typeof useRescheduleViewModel>
