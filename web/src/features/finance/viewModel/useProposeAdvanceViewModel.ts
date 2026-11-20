import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isForbidden } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { eventQueryKeys } from '@/features/event/viewModel/eventQueryKeys'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { parseVnDate, toVnDateKey } from '@/shared/format/formatDate'
import { formatMoney, parseMoney } from '@/shared/format/formatMoney'
import { advanceRepository } from '../model/advanceRepository'
import { EXPENSE_CATEGORIES, type FundDetail } from '../model/financeTypes'
import { defaultSettleBy } from './advanceDisplay'
import { ADVANCE_SETTLE_MAX_DAYS, proposeAdvanceSchema, type ProposeAdvanceValues } from './advanceSchemas'
import { financeQueryKeys } from './financeQueryKeys'

const DAY_MS = 24 * 60 * 60 * 1000
const SERVER_FIELDS = ['amount', 'category', 'purpose'] as const
/** Trường lỗi máy chủ gắn được vào ô của form; lỗi trường khác (ví dụ `fundId`) hiện thành câu chung. */
const FORM_FIELDS: readonly string[] = [...SERVER_FIELDS, 'settleBy']

/** FR-FIN-07: đề xuất tạm ứng từ quỹ đang xem; hạn quyết toán điền sẵn hôm nay cộng số ngày CLB cấu hình. */
export function useProposeAdvanceViewModel(fund: Pick<FundDetail, 'id' | 'advanceSettleDays'>, onDone: () => void) {
  const { clubId } = useCurrentClub()
  const queryClient = useQueryClient()
  // Lấy mốc ngày một lần khi mở hộp, không gọi Date trong lúc render.
  const [bounds] = useState(() => {
    const now = Date.now()
    return { today: toVnDateKey(new Date(now)), latest: toVnDateKey(new Date(now + ADVANCE_SETTLE_MAX_DAYS * DAY_MS)), settleBy: defaultSettleBy(now, fund.advanceSettleDays) }
  })
  const [schema] = useState(() => proposeAdvanceSchema(bounds.today, bounds.latest))
  const form = useForm<ProposeAdvanceValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: '', purpose: '', settleDate: bounds.settleBy },
  })

  const mutation = useMutation({
    mutationFn: (values: ProposeAdvanceValues) =>
      advanceRepository.propose(clubId, {
        fundId: fund.id,
        amount: parseMoney(values.amount) ?? 0,
        category: values.category,
        purpose: values.purpose.trim(),
        settleBy: parseVnDate(values.settleDate) ?? '',
      }),
    meta: { silentError: true },
    onSuccess: async (advance) => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: financeQueryKeys.all }), queryClient.invalidateQueries({ queryKey: eventQueryKeys.details })])
      toast.success(`Đã gửi đề xuất tạm ứng ${formatMoney(advance.amount)}. Ban chủ nhiệm sẽ được báo để duyệt.`)
      onDone()
    },
    onError: (error) => {
      applyServerFieldErrors(error, form.setError, SERVER_FIELDS)
      if (error instanceof ApiError && error.fieldErrors.some((fieldError) => fieldError.field === 'settleBy')) {
        form.setError('settleDate', { type: 'server', message: error.fieldErrors.find((fieldError) => fieldError.field === 'settleBy')?.message })
      }
      if (isForbidden(error)) void queryClient.invalidateQueries({ queryKey: financeQueryKeys.fund(clubId, fund.id) })
    },
  })

  const error = mutation.error
  return {
    form,
    categories: EXPENSE_CATEGORIES,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    // Lỗi gắn được vào ô thì không lặp lại dưới form; còn lại (403, quá hạn BR-FIN-05, quỹ đã quyết toán) hiện ở đây.
    errorMessage:
      error && !(error instanceof ApiError && error.fieldErrors.length > 0 && error.fieldErrors.every((fieldError) => FORM_FIELDS.includes(fieldError.field)))
        ? getErrorMessage(error)
        : null,
  }
}
