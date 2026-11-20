import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { formatDate, parseVnDate, toVnDateKey } from '@/shared/format/formatDate'
import { formatMoney, formatNumber, parseMoney } from '@/shared/format/formatMoney'
import { duesRepository } from '../model/duesRepository'
import { remainingDue } from '../model/duesRules'
import type { DuesItem } from '../model/duesTypes'
import { confirmPaymentSchema, type ConfirmPaymentValues } from './duesSchemas'
import { financeQueryKeys } from './financeQueryKeys'

/** FR-FIN-10: Thủ quỹ xác nhận một người đã nộp; số tiền điền sẵn số còn thiếu, ngày nộp mặc định hôm nay. */
export function useConfirmPaymentViewModel(campaignId: string) {
  const { clubId } = useCurrentClub()
  const queryClient = useQueryClient()
  const [today] = useState(() => toVnDateKey(new Date()))
  const [item, setItem] = useState<DuesItem | null>(null)
  const owed = item ? remainingDue(item) : 0
  const form = useForm<ConfirmPaymentValues>({
    resolver: (values, context, options) => zodResolver(confirmPaymentSchema(today, owed))(values, context, options),
    defaultValues: { amount: '', paidDate: formatDate(today) },
  })

  const mutation = useMutation({
    mutationFn: ({ target, values }: { target: DuesItem; values: ConfirmPaymentValues }) =>
      duesRepository.recordPayment(clubId, campaignId, target.id, {
        amount: parseMoney(values.amount) ?? 0,
        paidOn: parseVnDate(values.paidDate) ?? today,
        version: target.version,
      }),
    meta: { silentError: true },
    onSuccess: async (updated, { values }) => {
      await queryClient.invalidateQueries({ queryKey: financeQueryKeys.all })
      setItem(null)
      const left = remainingDue(updated)
      toast.success(
        `Đã xác nhận ${updated.member.fullName} nộp ${formatMoney(parseMoney(values.amount) ?? 0)}.${left > 0 ? ` Còn thiếu ${formatMoney(left)}.` : ''} Sổ Quỹ chung có khoản thu mới.`,
      )
    },
    onError: (error) => {
      let shown = false
      if (error instanceof ApiError && error.status === 400) {
        for (const fieldError of error.fieldErrors) {
          const field = fieldError.field === 'paidOn' ? 'paidDate' : fieldError.field
          if (field === 'amount' || field === 'paidDate') {
            form.setError(field, { type: 'server', message: fieldError.message })
            shown = true
          }
        }
      }
      if (shown) return
      // 409 (đã có người xác nhận trước), 403, 422: đóng hộp, báo lý do, tải lại để không ghi trùng.
      setItem(null)
      toast.error(isConflict(error) ? 'Khoản đóng quỹ này vừa được cập nhật. Đã tải lại số đã nộp mới nhất.' : getErrorMessage(error))
      void queryClient.invalidateQueries({ queryKey: financeQueryKeys.all })
    },
  })

  return {
    item,
    owed,
    form,
    pending: mutation.isPending,
    open: (target: DuesItem) => {
      form.reset({ amount: formatNumber(remainingDue(target)), paidDate: formatDate(today) })
      setItem(target)
    },
    close: () => {
      if (!mutation.isPending) setItem(null)
    },
    submit: form.handleSubmit((values) => {
      if (item) mutation.mutate({ target: item, values })
    }),
  }
}

export type ConfirmPaymentViewModel = ReturnType<typeof useConfirmPaymentViewModel>
