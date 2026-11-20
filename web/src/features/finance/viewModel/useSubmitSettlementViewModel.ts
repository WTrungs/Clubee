import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { formatDate, parseVnDate, toVnDateKey } from '@/shared/format/formatDate'
import { formatMoney, parseMoney } from '@/shared/format/formatMoney'
import { advanceRepository } from '../model/advanceRepository'
import type { AdvanceDetail } from '../model/advanceTypes'
import { settlementLineSchema, type SettlementLineValues } from './advanceSchemas'
import { financeQueryKeys } from './financeQueryKeys'
import { uploadVouchers } from './uploadVouchers'

const SERVER_FIELDS = ['amount', 'description'] as const
const NO_FILE = 'Cần ít nhất một chứng từ.'

/** FR-FIN-08: người ứng nộp một khoản đã chi kèm chứng từ; nộp được nhiều lần cho tới khi Thủ quỹ chốt. */
export function useSubmitSettlementViewModel(advance: Pick<AdvanceDetail, 'id' | 'version'>, onDone: () => void) {
  const { clubId } = useCurrentClub()
  const queryClient = useQueryClient()
  const [today] = useState(() => toVnDateKey(new Date()))
  const [schema] = useState(() => settlementLineSchema(today))
  const form = useForm<SettlementLineValues>({ resolver: zodResolver(schema), defaultValues: { amount: '', description: '', spentDate: formatDate(today) } })
  const [files, setFiles] = useState<File[]>([])
  const [attempted, setAttempted] = useState(false)
  const uploaded = useRef(new Map<File, string>())

  const mutation = useMutation({
    mutationFn: async (values: SettlementLineValues) => {
      const attachmentIds = await uploadVouchers(clubId, files, uploaded.current)
      return advanceRepository.submitLine(clubId, advance.id, {
        amount: parseMoney(values.amount) ?? 0,
        description: values.description.trim(),
        spentOn: parseVnDate(values.spentDate) ?? today,
        attachmentIds,
        // Hàm gửi lấy theo lần render mới nhất: sau 409 sheet chi tiết tải lại, lần gửi sau dùng phiên bản mới.
        version: advance.version,
      })
    },
    meta: { silentError: true },
    onSuccess: async (updated, values) => {
      queryClient.setQueryData(financeQueryKeys.advance(clubId, updated.id), updated)
      await queryClient.invalidateQueries({ queryKey: financeQueryKeys.all })
      toast.success(`Đã nộp chứng từ ${formatMoney(parseMoney(values.amount) ?? 0)}. Thủ quỹ sẽ được báo để xác nhận.`)
      onDone()
    },
    onError: (error) => {
      applyServerFieldErrors(error, form.setError, SERVER_FIELDS, { spentOn: 'spentDate' })
      void queryClient.invalidateQueries({ queryKey: financeQueryKeys.advance(clubId, advance.id) })
    },
  })

  const error = mutation.error
  const fieldErrors = error instanceof ApiError ? error.fieldErrors : []
  const serverFilesError = fieldErrors.find((fieldError) => fieldError.field === 'attachmentIds')?.message ?? null
  const shownInFields = fieldErrors.length > 0 && fieldErrors.every((fieldError) => ['amount', 'description', 'spentOn', 'attachmentIds'].includes(fieldError.field))
  return {
    form,
    files,
    setFiles,
    filesError: attempted && files.length === 0 ? NO_FILE : serverFilesError,
    submit: form.handleSubmit(
      async (values) => {
        setAttempted(true)
        if (files.length === 0) return
        await mutation.mutateAsync(values).catch(() => undefined)
      },
      () => setAttempted(true),
    ),
    pending: form.formState.isSubmitting || mutation.isPending,
    errorMessage: error && !shownInFields ? (isConflict(error) ? 'Tạm ứng vừa được cập nhật. Đã tải lại, bấm Nộp chứng từ để gửi lại.' : getErrorMessage(error)) : null,
  }
}
