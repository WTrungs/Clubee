import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isForbidden } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { formatMoney, parseMoney } from '@/shared/format/formatMoney'
import { financeRepository } from '../model/financeRepository'
import type { TransactionDetail } from '../model/financeTypes'
import { financeQueryKeys } from './financeQueryKeys'
import { adjustmentSchema, type AdjustmentValues } from './financeSchemas'

const SERVER_FIELDS = ['amount', 'direction'] as const
const SERVER_RENAME = { description: 'reason' } as const

/** FR-FIN-05: Thủ quỹ điều chỉnh một giao dịch đã ghi sổ; tăng quỹ ghi sổ ngay, giảm quỹ chờ ban chủ nhiệm khác duyệt. */
export function useAdjustmentViewModel(original: Pick<TransactionDetail, 'id' | 'fundId'>, onDone: () => void) {
  const { clubId } = useCurrentClub()
  const queryClient = useQueryClient()
  const form = useForm<AdjustmentValues>({ resolver: zodResolver(adjustmentSchema), defaultValues: { amount: '', reason: '' } })
  const direction = useWatch({ control: form.control, name: 'direction' })
  const [serverErrorsApplied, setServerErrorsApplied] = useState(false)

  const mutation = useMutation({
    mutationFn: (values: AdjustmentValues) =>
      financeRepository.create(clubId, {
        fundId: original.fundId,
        type: 'ADJUSTMENT',
        amount: parseMoney(values.amount) ?? 0,
        description: values.reason.trim(),
        originalTransactionId: original.id,
        direction: values.direction,
        attachmentIds: [],
      }),
    meta: { silentError: true },
    onSuccess: async (adjustment) => {
      await queryClient.invalidateQueries({ queryKey: financeQueryKeys.all })
      toast.success(
        adjustment.flow === 'IN'
          ? `Đã ghi điều chỉnh tăng quỹ ${formatMoney(adjustment.amount)}.`
          : `Đã gửi điều chỉnh giảm quỹ ${formatMoney(adjustment.amount)}, chờ một thành viên ban chủ nhiệm khác duyệt.`,
      )
      onDone()
    },
    onError: (error) => {
      setServerErrorsApplied(applyServerFieldErrors(error, form.setError, SERVER_FIELDS, SERVER_RENAME))
      // Vừa mất quyền, hoặc quỹ vừa quyết toán: tải lại để nút điều chỉnh hiện đúng.
      if (isForbidden(error) || (error instanceof ApiError && error.status === 422)) void queryClient.invalidateQueries({ queryKey: financeQueryKeys.all })
    },
  })

  const error = mutation.error
  return {
    form,
    decreasing: direction === 'OUT',
    submit: form.handleSubmit((values) => mutation.mutateAsync(values).catch(() => undefined)),
    pending: form.formState.isSubmitting || mutation.isPending,
    errorMessage: error && !(serverErrorsApplied && error instanceof ApiError) ? getErrorMessage(error) : null,
  }
}
