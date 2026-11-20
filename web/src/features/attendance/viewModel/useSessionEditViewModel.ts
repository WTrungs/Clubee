import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { getErrorMessage, isConflict } from '@/api/apiError'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { useEditBaseline } from '@/shared/form/useEditBaseline'
import { sessionRepository } from '../model/sessionRepository'
import type { SessionDetail } from '../model/sessionTypes'
import { attendanceQueryKeys } from './attendanceQueryKeys'
import { sessionFormSchema, toSessionFormValues, toUpdateSessionRequest, type SessionFormValues } from './sessionFormSchema'

const SERVER_FIELDS = ['title', 'description', 'location', 'capacity'] as const
const SERVER_RENAME = { startAt: 'startDate', endAt: 'endDate', registrationDeadline: 'deadlineDate' } as const

/** FR-ATT-02: sửa riêng một buổi trước giờ bắt đầu; lệch `version` thì cho tải lại, không ghi đè (NFR-REL-03). */
export function useSessionEditViewModel(clubId: string, session: SessionDetail, onDone: () => void) {
  const queryClient = useQueryClient()
  const liveValues = useMemo(() => toSessionFormValues(session), [session])
  const form = useForm<SessionFormValues>({ resolver: zodResolver(sessionFormSchema), defaultValues: liveValues })
  const baseline = useEditBaseline(form, session.version, liveValues)
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)

  const mutation = useMutation({
    mutationFn: (values: SessionFormValues) => sessionRepository.update(clubId, session.id, toUpdateSessionRequest(values, baseline.version())),
    meta: { silentError: true },
    onMutate: () => setFieldErrorsApplied(false),
    onSuccess: (saved) => {
      baseline.accept(saved.version, toSessionFormValues(saved))
      queryClient.setQueryData(attendanceQueryKeys.session(clubId, saved.id), saved)
      void queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.sessionLists })
      toast.success(`Đã lưu buổi “${saved.title}”.`)
      onDone()
    },
    onError: (error) => {
      setFieldErrorsApplied(applyServerFieldErrors(error, form.setError, SERVER_FIELDS, SERVER_RENAME))
      // Buổi vừa tới giờ, vừa bị hủy hoặc mất quyền: tải lại để nút Sửa, Hủy khớp máy chủ. 409 thì để người dùng tự bấm Tải lại.
      if (!isConflict(error)) void queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.session(clubId, session.id) })
    },
  })

  const conflict = isConflict(mutation.error)
  return {
    form,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    conflict,
    reload: async () => {
      try {
        const fresh = await queryClient.fetchQuery({
          queryKey: attendanceQueryKeys.session(clubId, session.id),
          queryFn: () => sessionRepository.get(clubId, session.id),
          staleTime: 0,
        })
        const values = toSessionFormValues(fresh)
        baseline.accept(fresh.version, values)
        form.reset(values)
        mutation.reset()
      } catch (error) {
        toast.error(getErrorMessage(error))
      }
    },
    errorMessage: mutation.error && !conflict && !fieldErrorsApplied ? getErrorMessage(mutation.error) : null,
    /** Gọi khi đóng sheet: lần mở sau lấy lại giá trị đang lưu. */
    reset: () => {
      form.reset(toSessionFormValues(session))
      mutation.reset()
      setFieldErrorsApplied(false)
    },
  }
}
