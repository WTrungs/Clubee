import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict, isForbidden } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { useRefreshMemberData } from '@/features/member/viewModel/useRefreshMemberData'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { formatDate, toVnDateKey } from '@/shared/format/formatDate'
import { termRepository } from '../model/termRepository'
import type { Term } from '../model/termTypes'
import { extensionPreviewText } from './termDisplay'
import { extensionEndOn, termExtensionSchema, type TermExtensionValues } from './termSchemas'

const SERVER_FIELDS = ['reason'] as const
const SERVER_RENAME = { endOn: 'endDate' } as const

/** FR-TERM-02: gia hạn nhiệm kỳ đang chạy; lệch version thì 409, đóng hộp và tải lại (NFR-REL-03). */
export function useExtendTermViewModel(term: Term, onDone: () => void) {
  const { clubId } = useCurrentClub()
  // Chức vụ dời hạn đổi cả Cơ cấu, Thành viên và quyền gán chức vụ khi nhiệm kỳ hết quá hạn.
  const refresh = useRefreshMemberData(clubId)
  const [today] = useState(() => toVnDateKey(new Date()))
  const schema = useMemo(() => termExtensionSchema(today, term.endOn), [today, term.endOn])
  const form = useForm<TermExtensionValues>({ resolver: zodResolver(schema), defaultValues: { endDate: '', reason: '' } })
  const endDate = useWatch({ control: form.control, name: 'endDate' }) ?? ''
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)

  const mutation = useMutation({
    mutationFn: (values: TermExtensionValues) =>
      termRepository.extend(clubId, term.id, { endOn: extensionEndOn(values, today, term.endOn) ?? '', reason: values.reason, version: term.version }),
    meta: { silentError: true },
    onMutate: () => setFieldErrorsApplied(false),
    onSuccess: async (saved) => {
      await refresh()
      toast.success(`Đã gia hạn ${saved.name} tới ${formatDate(saved.endOn)}.`)
      onDone()
    },
    onError: (error) => {
      // Nhiệm kỳ vừa đổi ở nơi khác (409), đã sang bàn giao (422) hoặc mất quyền (403): báo lý do rồi tải lại.
      if (isConflict(error) || isForbidden(error) || (error instanceof ApiError && error.code === 'TERM_NOT_RUNNING')) {
        toast.error(getErrorMessage(error))
        void refresh()
        onDone()
        return
      }
      setFieldErrorsApplied(applyServerFieldErrors(error, form.setError, SERVER_FIELDS, SERVER_RENAME))
    },
  })

  const error = mutation.error
  return {
    form,
    currentEndText: formatDate(term.endOn),
    preview: extensionPreviewText(term.positionsEndingWithTerm ?? 0, extensionEndOn({ endDate }, today, term.endOn)),
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    errorMessage: error && !(fieldErrorsApplied && error instanceof ApiError) ? getErrorMessage(error) : null,
  }
}
