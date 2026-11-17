import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict, isForbidden } from '@/api/apiError'
import { financeRepository } from '../model/financeRepository'
import type { TransactionDetail, TransactionTransitionAction } from '../model/financeTypes'
import { TRANSACTION_TRANSITIONS, transactionActionSuccess } from './financeDisplay'
import { financeQueryKeys } from './financeQueryKeys'

interface TransitionInput {
  action: TransactionTransitionAction
  reason?: string
}

/** ST-EXP trong sheet chi tiết: chỉ hiện nút máy chủ cho phép; chỉ báo thành công khi máy chủ đã lưu (NFR-REL-04), 409 cho tải lại (NFR-REL-03). */
export function useTransactionActionsViewModel(clubId: string, transaction: TransactionDetail | undefined) {
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<TransactionTransitionAction | null>(null)
  const [conflict, setConflict] = useState(false)
  const fundId = transaction?.fundId ?? ''
  // Duyệt điều chỉnh giảm quỹ là ghi sổ luôn, nên cũng cần xác nhận kèm số dư như ghi sổ khoản chi.
  const approvalPosts = transaction?.type === 'ADJUSTMENT'
  const showsBalance = dialog === 'POST' || (dialog === 'APPROVE' && approvalPosts)
  // Số dư hỏi lại máy chủ mỗi lần mở hộp ghi sổ, không lấy bản cũ trong cache (BR-FIN-08).
  const fund = useQuery({
    queryKey: financeQueryKeys.fund(clubId, fundId),
    queryFn: () => financeRepository.fund(clubId, fundId),
    enabled: showsBalance && fundId !== '',
    staleTime: 0,
  })
  const balanceFresh = fund.isFetchedAfterMount && !fund.isFetching && fund.isSuccess
  const liveBalance = balanceFresh && fund.data ? fund.data.balance : null
  // Giữ số dư đã cho người dùng xem lúc bấm Ghi sổ, để hộp đang đóng không hiện số dư đã bị trừ.
  const [confirmedBalance, setConfirmedBalance] = useState<number | null>(null)

  const mutation = useMutation({
    mutationFn: ({ action, reason }: TransitionInput) => {
      if (!transaction) throw new Error('Transaction not loaded')
      return financeRepository.transition(clubId, transaction.id, { action, reason, version: transaction.version })
    },
    meta: { silentError: true },
    onSuccess: async (updated, input) => {
      queryClient.setQueriesData({ queryKey: financeQueryKeys.transactionAll(clubId, updated.id) }, updated)
      await queryClient.invalidateQueries({ queryKey: financeQueryKeys.all })
      setDialog(null)
      toast.success(transactionActionSuccess(input.action, updated.type))
    },
    onError: (error) => {
      setDialog(null)
      if (isConflict(error)) {
        setConflict(true)
        return
      }
      toast.error(getErrorMessage(error))
      // Vừa mất quyền hoặc trạng thái đã đổi: tải lại để nút hiện đúng.
      if (isForbidden(error) || (error instanceof ApiError && error.status === 422)) void queryClient.invalidateQueries({ queryKey: financeQueryKeys.all })
    },
  })

  const allowed = transaction?.allowedActions ?? []
  return {
    actions: TRANSACTION_TRANSITIONS.filter((action) => allowed.includes(action)),
    /** Duyệt khoản chi gửi ngay; từ chối cần lý do; rút, ghi sổ và duyệt điều chỉnh (ghi sổ luôn) cần xác nhận. */
    request: (action: TransactionTransitionAction) => {
      if (mutation.isPending) return
      if (action === 'APPROVE' && !approvalPosts) {
        mutation.mutate({ action })
        return
      }
      setConfirmedBalance(null)
      setDialog(action)
    },
    dialog,
    closeDialog: () => {
      if (!mutation.isPending) setDialog(null)
    },
    confirm: (reason?: string) => {
      if (!dialog) return
      if (showsBalance) setConfirmedBalance(liveBalance)
      mutation.mutate({ action: dialog, reason })
    },
    pending: mutation.isPending,
    pendingAction: mutation.isPending ? (mutation.variables?.action ?? null) : null,
    currentBalance: confirmedBalance ?? liveBalance,
    balanceError: fund.isError && !fund.isFetching ? getErrorMessage(fund.error) : null,
    retryBalance: () => void fund.refetch(),
    conflict,
    reloadAfterConflict: () => {
      setConflict(false)
      void queryClient.invalidateQueries({ queryKey: financeQueryKeys.all })
    },
  }
}

export type TransactionActionsViewModel = ReturnType<typeof useTransactionActionsViewModel>
