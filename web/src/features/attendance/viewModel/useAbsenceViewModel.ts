import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/apiError'
import { sessionRepository } from '../model/sessionRepository'
import type { AbsenceRequestRow, SessionDetail } from '../model/sessionTypes'
import { attendanceQueryKeys } from './attendanceQueryKeys'

/** FR-ATT-04: thành viên xin phép vắng, rút đơn; bị từ chối thì nêu lý do máy chủ và tải lại buổi. */
export function useAbsenceViewModel(clubId: string, sessionId: string) {
  const queryClient = useQueryClient()
  const [requestOpen, setRequestOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const accept = (saved: SessionDetail) => queryClient.setQueryData(attendanceQueryKeys.session(clubId, sessionId), saved)
  const reload = () => void queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.session(clubId, sessionId) })

  const request = useMutation({
    mutationFn: (reason: string) => sessionRepository.requestAbsence(clubId, sessionId, { reason }),
    meta: { silentError: true },
    onSuccess: (saved) => {
      accept(saved)
      setRequestOpen(false)
      toast.success('Đã gửi đơn xin phép. Bạn sẽ được báo khi có kết quả.')
    },
    onError: (error) => {
      setRequestOpen(false)
      toast.error(getErrorMessage(error))
      reload()
    },
  })

  const withdraw = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => sessionRepository.withdrawAbsence(clubId, sessionId, id, version),
    meta: { silentError: true },
    onSuccess: (saved) => {
      accept(saved)
      setWithdrawOpen(false)
      toast.success('Đã rút đơn xin phép.')
    },
    onError: (error) => {
      setWithdrawOpen(false)
      toast.error(getErrorMessage(error))
      reload()
    },
  })

  return {
    requestOpen,
    setRequestOpen: (open: boolean) => {
      if (!request.isPending) setRequestOpen(open)
    },
    submitRequest: (reason: string) => request.mutate(reason),
    requesting: request.isPending,
    withdrawOpen,
    setWithdrawOpen: (open: boolean) => {
      if (!withdraw.isPending) setWithdrawOpen(open)
    },
    confirmWithdraw: (id: string, version: number) => withdraw.mutate({ id, version }),
    withdrawing: withdraw.isPending,
  }
}

/** FR-ATT-04: người phụ trách xem, duyệt, từ chối (kèm lý do) đơn xin phép trước khi chốt điểm danh. */
export function useAbsenceRequestsViewModel(clubId: string, sessionId: string) {
  const queryClient = useQueryClient()
  const [rejecting, setRejecting] = useState<AbsenceRequestRow | null>(null)
  const listKey = attendanceQueryKeys.absenceRequests(clubId, sessionId)
  const list = useQuery({ queryKey: listKey, queryFn: () => sessionRepository.absenceRequests(clubId, sessionId) })
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey }),
      // Số đơn chờ ở nhãn tab và dấu "Có đơn" trên bảng điểm danh.
      queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.session(clubId, sessionId) }),
      queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.sheets({ type: 'SESSION', clubId, id: sessionId }) }),
    ])

  const decide = useMutation({
    mutationFn: ({ row, decision, note }: { row: AbsenceRequestRow; decision: 'APPROVE' | 'REJECT'; note: string | null }) =>
      sessionRepository.decideAbsence(clubId, sessionId, row.id, { decision, note, version: row.version }),
    meta: { silentError: true },
    onSuccess: async (saved) => {
      await refresh()
      setRejecting(null)
      toast.success(saved.status === 'APPROVED' ? `Đã duyệt đơn của ${saved.requester.fullName}.` : `Đã từ chối đơn của ${saved.requester.fullName}.`)
    },
    onError: (error) => {
      // Đơn vừa bị rút, vừa được người khác xử lý hoặc đã chốt điểm danh: nêu lý do và tải lại.
      setRejecting(null)
      toast.error(getErrorMessage(error))
      void refresh()
    },
  })

  return {
    rows: list.data ?? [],
    loading: list.isPending,
    error: list.error,
    refetch: () => void list.refetch(),
    approve: (row: AbsenceRequestRow) => decide.mutate({ row, decision: 'APPROVE', note: null }),
    rejecting,
    openReject: (row: AbsenceRequestRow) => setRejecting(row),
    closeReject: () => {
      if (!decide.isPending) setRejecting(null)
    },
    confirmReject: (note: string) => {
      if (rejecting) decide.mutate({ row: rejecting, decision: 'REJECT', note })
    },
    pendingId: decide.isPending ? (decide.variables?.row.id ?? null) : null,
    deciding: decide.isPending,
  }
}
