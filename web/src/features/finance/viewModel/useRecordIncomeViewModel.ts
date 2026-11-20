import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isForbidden } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { formatDate, parseVnDate, toVnDateKey } from '@/shared/format/formatDate'
import { formatMoney, parseMoney } from '@/shared/format/formatMoney'
import { financeRepository } from '../model/financeRepository'
import { INCOME_CATEGORIES } from '../model/financeTypes'
import { financeQueryKeys } from './financeQueryKeys'
import { recordIncomeSchema, type RecordIncomeValues } from './financeSchemas'
import { uploadVouchers } from './uploadVouchers'

const SERVER_FIELDS = ['amount', 'category', 'description'] as const
const SERVER_RENAME = { occurredOn: 'occurredDate' } as const

/** FR-FIN-01: Thủ quỹ ghi khoản thu vào quỹ đang xem; chứng từ không bắt buộc. */
export function useRecordIncomeViewModel(fundId: string, onDone: () => void) {
  const { clubId } = useCurrentClub()
  const queryClient = useQueryClient()
  // Lấy ngày hôm nay một lần khi mở form, không gọi Date trong lúc render.
  const [openedAt] = useState(() => new Date())
  const schema = useMemo(() => recordIncomeSchema(toVnDateKey(openedAt)), [openedAt])
  const form = useForm<RecordIncomeValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: '', occurredDate: formatDate(openedAt), description: '' },
  })
  const [files, setFiles] = useState<File[]>([])
  const uploaded = useRef(new Map<File, string>())
  const [serverErrorsApplied, setServerErrorsApplied] = useState(false)

  const mutation = useMutation({
    mutationFn: async (values: RecordIncomeValues) => {
      const attachmentIds = await uploadVouchers(clubId, files, uploaded.current)
      return financeRepository.create(clubId, {
        fundId,
        type: 'INCOME',
        amount: parseMoney(values.amount) ?? 0,
        category: values.category,
        description: values.description.trim(),
        occurredOn: parseVnDate(values.occurredDate) ?? '',
        attachmentIds,
      })
    },
    meta: { silentError: true },
    onSuccess: async (transaction) => {
      await queryClient.invalidateQueries({ queryKey: financeQueryKeys.all })
      toast.success(`Đã ghi khoản thu ${formatMoney(transaction.amount)} vào ${transaction.fundName}.`)
      onDone()
    },
    onError: (error) => {
      setServerErrorsApplied(applyServerFieldErrors(error, form.setError, SERVER_FIELDS, SERVER_RENAME))
      // Vừa mất quyền (ví dụ bị thu hồi chức Thủ quỹ): tải lại quỹ để nút ghi biến mất.
      if (isForbidden(error)) void queryClient.invalidateQueries({ queryKey: financeQueryKeys.fund(clubId, fundId) })
    },
  })

  const error = mutation.error
  const filesError = error instanceof ApiError ? (error.fieldErrors.find((fieldError) => fieldError.field === 'attachmentIds')?.message ?? null) : null
  return {
    form,
    categories: INCOME_CATEGORIES,
    files,
    setFiles,
    filesError,
    // Chờ cả lúc kiểm form lẫn lúc gửi, để nhấp đúp không tạo hai khoản thu (NFR-REL-01).
    submit: form.handleSubmit((values) => mutation.mutateAsync(values).catch(() => undefined)),
    pending: form.formState.isSubmitting || mutation.isPending,
    errorMessage: error && !(serverErrorsApplied && error instanceof ApiError) && filesError === null ? getErrorMessage(error) : null,
  }
}
