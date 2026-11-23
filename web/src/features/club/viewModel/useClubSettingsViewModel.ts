import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { getErrorMessage, isConflict } from '@/api/apiError'
import { attendanceQueryKeys } from '@/features/attendance/viewModel/attendanceQueryKeys'
import { eventQueryKeys } from '@/features/event/viewModel/eventQueryKeys'
import { financeQueryKeys } from '@/features/finance/viewModel/financeQueryKeys'
import { memberQueryKeys } from '@/features/member/viewModel/memberQueryKeys'
import { taskQueryKeys } from '@/features/task/viewModel/taskQueryKeys'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { useEditBaseline } from '@/shared/form/useEditBaseline'
import { clubRepository } from '../model/clubRepository'
import type { ClubSettings } from '../model/clubTypes'
import { useCurrentClub } from './clubContext'
import { clubSettingsSchema, toClubSettingsFormValues, toUpdateClubSettingsRequest, type ClubSettingsFormValues } from './clubSettingsSchema'
import { clubQueryKeys } from './useClubDetail'

const SERVER_FIELDS = [
  'probationStep',
  'inviteLinkDays',
  'registrationCancelHours',
  'rescheduleConfirmHours',
  'attendanceLeadMinutes',
  'attendanceQrRotateSeconds',
  'attendanceEditHours',
  'taskReminderDays',
  'taskOverloadThreshold',
  'expenseReceiptThreshold',
  'advanceSettleDays',
  'semester1Start',
  'semester2Start',
  'summerStart',
] as const

/** Luôn tải bản mới khi mở sheet, để form không bắt đầu từ bản cũ rồi gặp 409 ngay lần lưu đầu. */
export function useClubSettingsQuery() {
  const { clubId } = useCurrentClub()
  return useQuery({ queryKey: clubQueryKeys.settings(clubId), queryFn: () => clubRepository.settings(clubId), staleTime: 0 })
}

/** FR-CLB-03: sửa tham số CLB; lệch `version` thì báo và cho tải lại, không ghi đè (NFR-REL-03). */
export function useClubSettingsViewModel(settings: ClubSettings, onDone: () => void) {
  const queryClient = useQueryClient()
  const { clubId } = useCurrentClub()
  const liveValues = useMemo(() => toClubSettingsFormValues(settings), [settings])
  const form = useForm<ClubSettingsFormValues>({ resolver: zodResolver(clubSettingsSchema), defaultValues: liveValues })
  const baseline = useEditBaseline(form, settings.version, liveValues)
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)

  const mutation = useMutation({
    mutationFn: (values: ClubSettingsFormValues) => clubRepository.updateSettings(clubId, toUpdateClubSettingsRequest(values, baseline.version())),
    meta: { silentError: true },
    onMutate: () => setFieldErrorsApplied(false),
    onSuccess: (saved) => {
      baseline.accept(saved.version, toClubSettingsFormValues(saved))
      queryClient.setQueryData(clubQueryKeys.settings(clubId), saved)
      // Tham số hiện ở form đề xuất chi, buổi và sự kiện, đăng ký tham dự, công việc, yêu cầu gia nhập.
      for (const queryKey of [financeQueryKeys.all, attendanceQueryKeys.sessions, attendanceQueryKeys.attendance, memberQueryKeys.all, eventQueryKeys.all, taskQueryKeys.all]) {
        void queryClient.invalidateQueries({ queryKey })
      }
      toast.success('Đã lưu tham số CLB.')
      onDone()
    },
    onError: (error) => setFieldErrorsApplied(applyServerFieldErrors(error, form.setError, SERVER_FIELDS)),
  })

  const conflict = isConflict(mutation.error)
  return {
    form,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    conflict,
    updatedAt: settings.updatedAt,
    updatedBy: settings.updatedBy,
    reload: async () => {
      try {
        const fresh = await queryClient.fetchQuery({ queryKey: clubQueryKeys.settings(clubId), queryFn: () => clubRepository.settings(clubId), staleTime: 0 })
        const values = toClubSettingsFormValues(fresh)
        baseline.accept(fresh.version, values)
        form.reset(values)
        mutation.reset()
      } catch (error) {
        toast.error(getErrorMessage(error))
      }
    },
    errorMessage: mutation.error && !conflict && !fieldErrorsApplied ? getErrorMessage(mutation.error) : null,
  }
}
