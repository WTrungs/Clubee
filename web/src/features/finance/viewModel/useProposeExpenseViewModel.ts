import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isForbidden } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { formatMoney, parseMoney } from '@/shared/format/formatMoney'
import { financeRepository } from '../model/financeRepository'
import { EXPENSE_CATEGORIES, type FundDetail } from '../model/financeTypes'
import { financeQueryKeys } from './financeQueryKeys'
import { missingReceipt, proposeExpenseSchema, type ProposeExpenseValues } from './financeSchemas'
import { uploadVouchers } from './uploadVouchers'

const SERVER_FIELDS = ['amount', 'category', 'description'] as const

/** FR-FIN-02: đề xuất chi từ quỹ đang xem; trên ngưỡng phải có chứng từ (BR-FIN-03); chờ ban chủ nhiệm khác người đề xuất duyệt. */
export function useProposeExpenseViewModel(fund: Pick<FundDetail, 'id' | 'receiptThreshold'>, onDone: () => void) {
  const { clubId } = useCurrentClub()
  const queryClient = useQueryClient()
  const form = useForm<ProposeExpenseValues>({ resolver: zodResolver(proposeExpenseSchema), defaultValues: { amount: '', description: '' } })
  const [files, setFiles] = useState<File[]>([])
  const amount = useWatch({ control: form.control, name: 'amount' })
  // Chỉ báo thiếu chứng từ sau lần bấm gửi đầu tiên, rồi cập nhật ngay khi đổi số tiền hay thêm tệp.
  const [attempted, setAttempted] = useState(false)
  const receiptMissing = attempted && missingReceipt(amount ?? '', fund.receiptThreshold, files.length)
  const uploaded = useRef(new Map<File, string>())
  const [serverErrorsApplied, setServerErrorsApplied] = useState(false)

  const mutation = useMutation({
    mutationFn: async (values: ProposeExpenseValues) => {
      const attachmentIds = await uploadVouchers(clubId, files, uploaded.current)
      return financeRepository.create(clubId, {
        fundId: fund.id,
        type: 'EXPENSE',
        amount: parseMoney(values.amount) ?? 0,
        category: values.category,
        description: values.description.trim(),
        attachmentIds,
      })
    },
    meta: { silentError: true },
    onSuccess: async (transaction) => {
      await queryClient.invalidateQueries({ queryKey: financeQueryKeys.all })
      toast.success(`Đã gửi đề xuất chi ${formatMoney(transaction.amount)}. Ban chủ nhiệm sẽ được báo để duyệt.`)
      onDone()
    },
    onError: (error) => {
      setServerErrorsApplied(applyServerFieldErrors(error, form.setError, SERVER_FIELDS))
      if (isForbidden(error)) void queryClient.invalidateQueries({ queryKey: financeQueryKeys.fund(clubId, fund.id) })
    },
  })

  const error = mutation.error
  const serverFilesError = error instanceof ApiError ? (error.fieldErrors.find((fieldError) => fieldError.field === 'attachmentIds')?.message ?? null) : null
  return {
    form,
    categories: EXPENSE_CATEGORIES,
    receiptThreshold: fund.receiptThreshold,
    files,
    setFiles,
    filesError: receiptMissing ? `Khoản chi trên ${formatMoney(fund.receiptThreshold)} phải có chứng từ.` : serverFilesError,
    submit: form.handleSubmit(
      async (values) => {
        setAttempted(true)
        if (missingReceipt(values.amount, fund.receiptThreshold, files.length)) return
        await mutation.mutateAsync(values).catch(() => undefined)
      },
      () => setAttempted(true),
    ),
    pending: form.formState.isSubmitting || mutation.isPending,
    errorMessage: error && !(serverErrorsApplied && error instanceof ApiError) && serverFilesError === null ? getErrorMessage(error) : null,
  }
}
