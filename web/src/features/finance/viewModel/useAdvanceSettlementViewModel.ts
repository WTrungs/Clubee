import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { eventQueryKeys } from '@/features/event/viewModel/eventQueryKeys'
import { formatDate, parseVnDate, toVnDateKey } from '@/shared/format/formatDate'
import { advanceRepository } from '../model/advanceRepository'
import type { AdvanceDetail } from '../model/advanceTypes'
import { closureText, closurePreview } from './advanceDisplay'
import { closeAdvanceSchema, type CloseAdvanceValues } from './advanceSchemas'
import { financeQueryKeys } from './financeQueryKeys'

type SettlementRequest = { kind: 'CONFIRM'; lineId: string } | { kind: 'RETURN'; lineId: string; note: string } | { kind: 'CLOSE'; refundOn?: string }

/** Sheet tạm ứng dựa vào khóa này để không đóng giữa lúc đang xác nhận, trả lại hay chốt. */
export const ADVANCE_SETTLEMENT_MUTATION = ['advanceSettlement'] as const

export type SettlementDialog = { kind: 'SUBMIT' } | { kind: 'RETURN'; lineId: string } | { kind: 'CLOSE' } | null

/** FR-FIN-08: Thủ quỹ xác nhận hoặc trả lại từng lần nộp, rồi chốt; người ứng mở form nộp chứng từ. Lỗi 409, 422 thì tải lại. */
export function useAdvanceSettlementViewModel(advance: AdvanceDetail) {
  const { clubId } = useCurrentClub()
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<SettlementDialog>(null)
  const [today] = useState(() => toVnDateKey(new Date()))
  const closeForm = useForm<CloseAdvanceValues>({
    resolver: zodResolver(closeAdvanceSchema(advance.disbursedOn, today)),
    defaultValues: { refundDate: formatDate(today) },
  })

  const mutation = useMutation({
    mutationKey: ADVANCE_SETTLEMENT_MUTATION,
    mutationFn: (request: SettlementRequest) => {
      const version = advance.version
      if (request.kind === 'CLOSE') return advanceRepository.close(clubId, advance.id, { refundOn: request.refundOn, version })
      return request.kind === 'CONFIRM'
        ? advanceRepository.decideLine(clubId, advance.id, request.lineId, { action: 'CONFIRM', version })
        : advanceRepository.decideLine(clubId, advance.id, request.lineId, { action: 'RETURN', note: request.note, version })
    },
    meta: { silentError: true },
    onSuccess: async (updated, request) => {
      queryClient.setQueryData(financeQueryKeys.advance(clubId, updated.id), updated)
      await Promise.all([queryClient.invalidateQueries({ queryKey: financeQueryKeys.all }), queryClient.invalidateQueries({ queryKey: eventQueryKeys.details })])
      setDialog(null)
      if (request.kind === 'CONFIRM') toast.success('Đã xác nhận chứng từ.')
      else if (request.kind === 'RETURN') toast.success('Đã trả lại chứng từ. Người ứng sẽ được báo kèm lý do.')
      else toast.success(`Đã chốt quyết toán. ${updated.closure ? closureText(updated.closure) : ''}`.trim())
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fieldErrors.some((fieldError) => fieldError.field === 'refundOn')) {
        closeForm.setError('refundDate', { type: 'server', message: getErrorMessage(error) })
        return
      }
      setDialog(null)
      toast.error(isConflict(error) ? 'Tạm ứng vừa được người khác cập nhật. Đã tải lại trạng thái mới nhất.' : getErrorMessage(error))
      void queryClient.invalidateQueries({ queryKey: financeQueryKeys.all })
    },
  })

  const allowed = advance.allowedActions
  const preview = closurePreview(advance.amount, advance.confirmedAmount)
  const pendingLine = mutation.isPending && mutation.variables.kind !== 'CLOSE' ? mutation.variables.lineId : null
  return {
    canSubmit: allowed.includes('SUBMIT_SETTLEMENT'),
    canDecide: allowed.includes('DECIDE_LINES'),
    canClose: allowed.includes('CLOSE'),
    pendingLines: advance.lines.filter((line) => line.status === 'SUBMITTED').length,
    preview,
    dialog,
    pending: mutation.isPending,
    pendingLine,
    openSubmit: () => setDialog({ kind: 'SUBMIT' }),
    openReturn: (lineId: string) => setDialog({ kind: 'RETURN', lineId }),
    openClose: () => {
      closeForm.reset({ refundDate: formatDate(today) })
      setDialog({ kind: 'CLOSE' })
    },
    closeDialog: () => {
      if (!mutation.isPending) setDialog(null)
    },
    confirmLine: (lineId: string) => mutation.mutate({ kind: 'CONFIRM', lineId }),
    confirmReturn: (note: string) => {
      if (dialog?.kind === 'RETURN') mutation.mutate({ kind: 'RETURN', lineId: dialog.lineId, note })
    },
    closeForm,
    // Chỉ gửi ngày nhận lại khi có phần thừa phải hoàn.
    submitClose: closeForm.handleSubmit((values) =>
      mutation.mutate({ kind: 'CLOSE', refundOn: preview.kind === 'REFUND' ? (parseVnDate(values.refundDate) ?? today) : undefined }),
    ),
  }
}

export type AdvanceSettlementViewModel = ReturnType<typeof useAdvanceSettlementViewModel>
