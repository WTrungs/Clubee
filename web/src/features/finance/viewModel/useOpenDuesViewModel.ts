import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useFieldArray, useForm, type FieldPath } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { parseVnDate, toVnDateKey } from '@/shared/format/formatDate'
import { parseMoney } from '@/shared/format/formatMoney'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { duesRepository } from '../model/duesRepository'
import type { DuesCandidate } from '../model/duesTypes'
import { openDuesSchema, type OpenDuesValues } from './duesSchemas'
import { financeQueryKeys } from './financeQueryKeys'

/** Tên trường máy chủ (`dueOn`, `exemptions[0].reason`) sang tên ô của form. */
function formField(field: string): FieldPath<OpenDuesValues> | null {
  if (field === 'name' || field === 'amount') return field
  if (field === 'dueOn') return 'dueDate'
  const row = /^exemptions\[(\d+)\]\.(kind|amount|reason)$/.exec(field)
  return row ? (`exemptions.${Number(row[1])}.${row[2]}` as FieldPath<OpenDuesValues>) : null
}

/** FR-FIN-09: Thủ quỹ mở đợt; chọn người miễn hoặc giảm từ danh sách phải đóng, mỗi người kèm lý do. */
export function useOpenDuesViewModel(onDone: (campaignId: string) => void) {
  const { clubId } = useCurrentClub()
  const queryClient = useQueryClient()
  const [today] = useState(() => toVnDateKey(new Date()))
  const [schema] = useState(() => openDuesSchema(today))
  const form = useForm<OpenDuesValues>({ resolver: zodResolver(schema), defaultValues: { name: '', amount: '', dueDate: '', exemptions: [] } })
  const exemptions = useFieldArray({ control: form.control, name: 'exemptions', keyName: 'key' })
  const [keyword, setKeyword] = useState('')
  const debounced = useDebouncedValue(keyword.trim(), 300)
  const candidates = useQuery({
    queryKey: financeQueryKeys.duesCandidates(clubId, debounced),
    queryFn: () => duesRepository.candidates(clubId, debounced),
  })
  const chosen = new Set(exemptions.fields.map((row) => row.userId))

  const mutation = useMutation({
    mutationFn: (values: OpenDuesValues) =>
      duesRepository.open(clubId, {
        name: values.name.trim(),
        amount: parseMoney(values.amount) ?? 0,
        dueOn: parseVnDate(values.dueDate) ?? '',
        exemptions: values.exemptions.map((row) => ({
          userId: row.userId,
          kind: row.kind,
          amount: row.kind === 'REDUCED' ? (parseMoney(row.amount) ?? 0) : undefined,
          reason: row.reason.trim(),
        })),
      }),
    meta: { silentError: true },
    onSuccess: async (campaign) => {
      await queryClient.invalidateQueries({ queryKey: financeQueryKeys.all })
      toast.success(`Đã mở đợt ${campaign.name} cho ${campaign.memberCount} thành viên. Người phải đóng đã được báo.`)
      onDone(campaign.id)
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return
      for (const fieldError of error.fieldErrors) {
        const field = formField(fieldError.field)
        if (field) form.setError(field, { type: 'server', message: fieldError.message })
      }
    },
  })

  const error = mutation.error
  const allMapped = error instanceof ApiError && error.fieldErrors.length > 0 && error.fieldErrors.every((fieldError) => formField(fieldError.field) !== null)
  return {
    form,
    exemptions: exemptions.fields,
    keyword,
    setKeyword,
    candidates: (candidates.data ?? []).filter((candidate) => !chosen.has(candidate.id)),
    candidatesLoading: candidates.isPending,
    candidatesError: candidates.error ? getErrorMessage(candidates.error) : null,
    retryCandidates: () => void candidates.refetch(),
    addExemption: (candidate: DuesCandidate) => exemptions.append({ userId: candidate.id, fullName: candidate.fullName, kind: 'EXEMPT', amount: '', reason: '' }),
    removeExemption: (index: number) => exemptions.remove(index),
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    errorMessage: error && !allMapped ? getErrorMessage(error) : null,
  }
}

export type OpenDuesViewModel = ReturnType<typeof useOpenDuesViewModel>
