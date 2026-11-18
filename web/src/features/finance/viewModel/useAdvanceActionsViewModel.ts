import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { formatDate, parseVnDate, toVnDateKey } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import { advanceRepository } from '../model/advanceRepository'
import type { AdvanceDetail, AdvanceTransitionRequest } from '../model/advanceTypes'
import { financeRepository } from '../model/financeRepository'
import { disburseSchema, type DisburseValues } from './advanceSchemas'
import { financeQueryKeys } from './financeQueryKeys'

export type AdvanceDialog = 'REJECT' | 'DISBURSE' | null

const successText: Record<AdvanceTransitionRequest['action'], (advance: AdvanceDetail) => string> = {
  APPROVE: () => 'Đã duyệt tạm ứng. Thủ quỹ sẽ được báo để ghi đã ứng.',
  REJECT: () => 'Đã từ chối tạm ứng.',
  DISBURSE: (advance) => `Đã ghi đã ứng ${formatMoney(advance.amount)}.`,
}

/** Chi tiết một tạm ứng và các thao tác máy chủ cho phép (FR-FIN-07): duyệt, từ chối, ghi đã ứng. */
export function useAdvanceActionsViewModel(advanceId: string | null) {
  const { clubId } = useCurrentClub()
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<AdvanceDialog>(null)
  const [today] = useState(() => toVnDateKey(new Date()))
  const [schema] = useState(() => disburseSchema(today))
  const disburseForm = useForm<DisburseValues>({ resolver: zodResolver(schema), defaultValues: { disbursedDate: formatDate(today) } })

  const detail = useQuery({
    queryKey: financeQueryKeys.advance(clubId, advanceId ?? ''),
    queryFn: () => advanceRepository.get(clubId, advanceId ?? ''),
    enabled: advanceId !== null,
  })
  const advance = detail.data ?? null
  // Số dư hỏi lại máy chủ mỗi lần mở hộp ghi đã ứng, không lấy bản cũ trong cache (BR-FIN-08).
  const fund = useQuery({
    queryKey: financeQueryKeys.fund(clubId, advance?.fundId ?? ''),
    queryFn: () => financeRepository.fund(clubId, advance?.fundId ?? ''),
    enabled: dialog === 'DISBURSE' && advance !== null,
    staleTime: 0,
  })
  const balanceFresh = fund.isFetchedAfterMount && !fund.isFetching && fund.isSuccess

  const transition = useMutation({
    mutationFn: (request: Omit<AdvanceTransitionRequest, 'version'>) => {
      if (!advance) throw new Error('Advance not loaded')
      return advanceRepository.transition(clubId, advance.id, { ...request, version: advance.version })
    },
    meta: { silentError: true },
    onSuccess: async (updated, request) => {
      queryClient.setQueryData(financeQueryKeys.advance(clubId, updated.id), updated)
      await queryClient.invalidateQueries({ queryKey: financeQueryKeys.all })
      setDialog(null)
      toast.success(successText[request.action](updated))
    },
    onError: (error) => {
      // Lỗi ngày ứng nằm ở ô của hộp; còn lại (409, 403, 422 số dư) báo chung rồi tải lại để nút hiện đúng.
      if (error instanceof ApiError && error.fieldErrors.some((fieldError) => fieldError.field === 'disbursedOn')) {
        disburseForm.setError('disbursedDate', { type: 'server', message: getErrorMessage(error) })
        return
      }
      setDialog(null)
      toast.error(isConflict(error) ? 'Tạm ứng vừa được người khác cập nhật. Đã tải lại trạng thái mới nhất.' : getErrorMessage(error))
      void queryClient.invalidateQueries({ queryKey: financeQueryKeys.all })
    },
  })

  const allowed = advance?.allowedActions ?? []
  return {
    advance,
    loading: detail.isPending && advanceId !== null,
    error: detail.error,
    refetch: () => void detail.refetch(),
    canApprove: allowed.includes('APPROVE'),
    canReject: allowed.includes('REJECT'),
    canDisburse: allowed.includes('DISBURSE'),
    pending: transition.isPending,
    pendingAction: transition.isPending ? (transition.variables?.action ?? null) : null,
    approve: () => transition.mutate({ action: 'APPROVE' }),
    dialog,
    openReject: () => setDialog('REJECT'),
    openDisburse: () => {
      disburseForm.reset({ disbursedDate: formatDate(today) })
      setDialog('DISBURSE')
    },
    closeDialog: () => {
      if (!transition.isPending) setDialog(null)
    },
    confirmReject: (reason: string) => transition.mutate({ action: 'REJECT', reason }),
    disburseForm,
    fundBalance: balanceFresh && fund.data ? fund.data.balance : null,
    fundBalanceError: fund.isError && !fund.isFetching ? getErrorMessage(fund.error) : null,
    retryFundBalance: () => void fund.refetch(),
    submitDisburse: disburseForm.handleSubmit((values) => transition.mutate({ action: 'DISBURSE', disbursedOn: parseVnDate(values.disbursedDate) ?? today })),
  }
}

export type AdvanceActionsViewModel = ReturnType<typeof useAdvanceActionsViewModel>
