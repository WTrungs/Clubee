import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { useEditBaseline } from '@/shared/form/useEditBaseline'
import { termRepository } from '../model/termRepository'
import type { DepartmentPlanEntry, Term } from '../model/termTypes'
import { planSummary } from './termDisplay'
import { termQueryKeys } from './termQueryKeys'
import { departmentPlanSchema, NEW_PLAN_ENTRY, planFieldPath, PLAN_MAX_ENTRIES, toPlanRequest, toPlanValues, type DepartmentPlanValues } from './termSchemas'
import { useRefreshTermData } from './useRefreshTermData'

/** FR-TERM-01: sửa kế hoạch ban của nhiệm kỳ Chuẩn bị; lệch version thì báo và cho tải lại, không ghi đè (NFR-REL-03). */
export function useDepartmentPlanViewModel(term: Term, onDone: () => void) {
  const queryClient = useQueryClient()
  const { clubId } = useCurrentClub()
  const refresh = useRefreshTermData(clubId)
  const liveValues = useMemo(() => toPlanValues(term.departmentPlan ?? []), [term.departmentPlan])
  const form = useForm<DepartmentPlanValues>({ resolver: zodResolver(departmentPlanSchema), defaultValues: liveValues })
  const rows = useFieldArray({ control: form.control, name: 'entries' })
  const baseline = useEditBaseline(form, term.version, liveValues)
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)
  // Số thành viên và lý do chưa bỏ được là dữ liệu máy chủ tính, tra theo ban.
  const serverEntries = useMemo(() => new Map((term.departmentPlan ?? []).flatMap((entry) => (entry.departmentId ? [[entry.departmentId, entry] as const] : []))), [term.departmentPlan])
  const watched = useWatch({ control: form.control, name: 'entries' })

  const mutation = useMutation({
    mutationFn: (values: DepartmentPlanValues) => termRepository.update(clubId, term.id, { departmentPlan: toPlanRequest(values), version: baseline.version() }),
    meta: { silentError: true },
    onMutate: () => setFieldErrorsApplied(false),
    onSuccess: async (saved) => {
      baseline.accept(saved.version, toPlanValues(saved.departmentPlan ?? []))
      await refresh()
      toast.success('Đã lưu kế hoạch ban.')
      onDone()
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return
      let applied = false
      for (const fieldError of error.fieldErrors) {
        const path = planFieldPath(fieldError.field)
        if (!path) continue
        form.setError(path, { type: 'server', message: fieldError.message })
        applied = true
      }
      setFieldErrorsApplied(applied)
    },
  })

  const conflict = isConflict(mutation.error)
  return {
    form,
    rows: rows.fields,
    serverEntry: (departmentId: string | null): DepartmentPlanEntry | undefined => (departmentId ? serverEntries.get(departmentId) : undefined),
    summary: planSummary((watched ?? []).map((entry) => ({ ...entry, currentName: serverEntries.get(entry.departmentId ?? '')?.currentName ?? null }))),
    canAdd: rows.fields.length < PLAN_MAX_ENTRIES,
    addEntry: () => rows.append(NEW_PLAN_ENTRY, { focusName: `entries.${rows.fields.length}.name` }),
    removeEntry: (index: number) => rows.remove(index),
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    conflict,
    reload: async () => {
      try {
        const terms = await queryClient.fetchQuery({ queryKey: termQueryKeys.list(clubId), queryFn: () => termRepository.list(clubId), staleTime: 0 })
        const fresh = terms.find((candidate) => candidate.id === term.id)
        if (!fresh || fresh.status !== 'PREPARING') {
          toast.error('Nhiệm kỳ này không còn ở trạng thái Chuẩn bị nên không sửa kế hoạch ban được nữa.')
          onDone()
          return
        }
        const values = toPlanValues(fresh.departmentPlan ?? [])
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
