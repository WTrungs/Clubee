import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { clubQueryKeys } from '@/features/club/viewModel/useClubDetail'
import { presidencyTransferRepository } from '../model/presidencyTransferRepository'

export const transferQueryKeys = {
  overview: (clubId: string) => ['presidencyTransfer', clubId] as const,
}

/** FR-ACC-08 phía thành viên: thấy ban chủ nhiệm không hoạt động, gửi hoặc hủy yêu cầu chuyển quyền. */
export function usePresidencyTransferViewModel() {
  const queryClient = useQueryClient()
  const { clubId } = useCurrentClub()
  const [dialog, setDialog] = useState<'request' | 'cancel' | null>(null)
  const overview = useQuery({ queryKey: transferQueryKeys.overview(clubId), queryFn: () => presidencyTransferRepository.overview(clubId) })
  const refresh = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: transferQueryKeys.overview(clubId) }), queryClient.invalidateQueries({ queryKey: clubQueryKeys.detail(clubId) })])

  const onError = (error: unknown) => {
    setDialog(null)
    // Lệch version thì nói chung chung; các 409 khác (ví dụ người khác vừa gửi trước) dùng câu của máy chủ.
    const stale = isConflict(error) && error instanceof ApiError && error.code === 'VERSION_CONFLICT'
    toast.error(stale ? 'Yêu cầu vừa thay đổi ở nơi khác. Đã tải lại trạng thái mới nhất.' : getErrorMessage(error))
    void refresh()
  }
  const send = useMutation({
    mutationFn: (reason: string) => presidencyTransferRepository.request(clubId, reason),
    meta: { silentError: true },
    onSuccess: async () => {
      setDialog(null)
      await refresh()
      toast.success('Đã gửi yêu cầu chuyển quyền. Quản trị hệ thống sẽ xem xét.')
    },
    onError,
  })
  const cancel = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => presidencyTransferRepository.cancel(clubId, id, version),
    meta: { silentError: true },
    onSuccess: async () => {
      setDialog(null)
      await refresh()
      toast.success('Đã hủy yêu cầu chuyển quyền.')
    },
    onError,
  })

  const data = overview.data
  const request = data?.request ?? null
  const pending = request?.status === 'PENDING' ? request : null
  return {
    /** Chỉ hiện dải thông báo khi có việc liên quan, để trang Cơ cấu bình thường không thêm gì. */
    visible: data !== undefined && (data.boardInactive || pending !== null),
    /** Lỗi tải điều kiện chuyển quyền; dải này là lối vào duy nhất của FR-ACC-08 phía thành viên nên không bỏ qua im lặng. */
    error: overview.error,
    retry: () => void overview.refetch(),
    boardInactive: data?.boardInactive ?? false,
    inactiveDays: data?.inactiveDays ?? 0,
    pending,
    canRequest: data?.allowedActions.includes('REQUEST') ?? false,
    canCancel: pending?.allowedActions.includes('CANCEL') ?? false,
    dialog,
    openRequest: () => setDialog('request'),
    openCancel: () => setDialog('cancel'),
    closeDialog: () => {
      if (!send.isPending && !cancel.isPending) setDialog(null)
    },
    sendRequest: (reason: string) => send.mutate(reason),
    confirmCancel: () => {
      if (pending) cancel.mutate({ id: pending.id, version: pending.version })
    },
    pendingAction: send.isPending || cancel.isPending,
  }
}
