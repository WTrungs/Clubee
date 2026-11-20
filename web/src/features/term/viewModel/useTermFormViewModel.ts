import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { toVnDateKey } from '@/shared/format/formatDate'
import { termRepository } from '../model/termRepository'
import type { Term } from '../model/termTypes'
import { termFormSchema, toTermDates, toTermFormValues, type TermFormValues } from './termSchemas'
import { useRefreshTermData } from './useRefreshTermData'

const SERVER_FIELDS = ['name'] as const
const SERVER_RENAME = { startOn: 'startDate', endOn: 'endDate' } as const

/** FR-TERM-01: khai báo nhiệm kỳ mới hoặc sửa tên, ngày của nhiệm kỳ Chuẩn bị; lệch version thì 409 (NFR-REL-03). */
export function useTermFormViewModel(editing: Term | null, onDone: () => void) {
  const { clubId } = useCurrentClub()
  const refresh = useRefreshTermData(clubId)
  const [today] = useState(() => toVnDateKey(new Date()))
  const schema = useMemo(() => termFormSchema(today), [today])
  const form = useForm<TermFormValues>({ resolver: zodResolver(schema), defaultValues: toTermFormValues(editing) })
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)

  const mutation = useMutation({
    mutationFn: (values: TermFormValues) =>
      editing ? termRepository.update(clubId, editing.id, { ...toTermDates(values), version: editing.version }) : termRepository.create(clubId, toTermDates(values)),
    meta: { silentError: true },
    onMutate: () => setFieldErrorsApplied(false),
    onSuccess: async (term) => {
      await refresh()
      toast.success(editing ? `Đã lưu ${term.name}.` : `Đã khai báo ${term.name} ở trạng thái Chuẩn bị.`)
      onDone()
    },
    onError: (error) => {
      // 409: nhiệm kỳ vừa bị sửa hoặc đã có nhiệm kỳ Chuẩn bị khác; đóng form và tải lại, không ghi đè.
      if (isConflict(error)) {
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
    editing: editing !== null,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    errorMessage: error && !(fieldErrorsApplied && error instanceof ApiError) ? getErrorMessage(error) : null,
  }
}
