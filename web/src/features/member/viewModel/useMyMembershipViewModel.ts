import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { getErrorMessage, isConflict } from '@/api/apiError'
import { sessionQueryKey } from '@/api/queryClient'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { memberRepository } from '../model/memberRepository'
import type { MyMembership } from '../model/memberTypes'
import { memberQueryKeys } from './memberQueryKeys'
import { useRefreshMemberData } from './useRefreshMemberData'

export type MyMembershipDialog = 'leave' | 'withdraw' | 'return' | 'resign'

/** FR-MEM-07: thành viên xin tạm nghỉ, rút yêu cầu, tự quay lại, tự xin rời; máy chủ trả sẵn thao tác được phép và khoản còn tồn. */
export function useMyMembershipViewModel() {
  const { clubId, club } = useCurrentClub()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const refresh = useRefreshMemberData(clubId)
  const [dialog, setDialog] = useState<MyMembershipDialog | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Khoản còn tồn đổi theo thao tác ở module khác (nghiệm thu, thu hồi chức vụ), nên luôn coi là cũ và tải lại khi mở hộp xin rời.
  const mine = useQuery({ queryKey: memberQueryKeys.mine(clubId), queryFn: () => memberRepository.myMembership(clubId), staleTime: 0 })
  const membership = mine.data ?? null

  const run = useMutation({
    mutationFn: async (input: { dialog: MyMembershipDialog; reason: string }): Promise<MyMembership> => {
      if (!membership) throw new Error('Membership not loaded')
      switch (input.dialog) {
        case 'leave':
          return memberRepository.requestLeave(clubId, input.reason)
        case 'withdraw':
          return memberRepository.withdrawLeave(clubId, membership.leaveRequest?.id ?? '', membership.leaveRequest?.version ?? 0)
        case 'return':
          return memberRepository.transitionMine(clubId, { action: 'RETURN', version: membership.version })
        case 'resign':
          return memberRepository.transitionMine(clubId, { action: 'RESIGN', reason: input.reason, version: membership.version })
      }
    },
    meta: { silentError: true },
    onMutate: () => setErrorMessage(null),
    onSuccess: async (saved, input) => {
      setDialog(null)
      if (input.dialog === 'resign') {
        // Rời CLB thì mất quyền vào trang CLB ngay; về danh sách CLB của mình và bỏ dữ liệu nội bộ CLB đã tải (SRS 3.5).
        toast.success(`Bạn đã rời ${club.name}.`)
        await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
        // Chờ rời hẳn trang CLB rồi mới xóa, để thẻ còn gắn không tạo lại truy vấn và nhận 403.
        await navigate('/clubs', { replace: true })
        queryClient.removeQueries({ predicate: (query) => query.queryKey.includes(clubId) })
        return
      }
      queryClient.setQueryData(memberQueryKeys.mine(clubId), saved)
      await refresh()
      toast.success(successMessage(input.dialog))
    },
    onError: (error, input) => {
      if (isConflict(error)) {
        setDialog(null)
        toast.error(getErrorMessage(error))
        void refresh()
        return
      }
      // Hộp xin rời tự hiện lỗi cạnh danh sách khoản còn tồn; các hộp nhập lý do dùng chung thì báo bằng toast.
      if (input.dialog === 'resign') setErrorMessage(getErrorMessage(error))
      else toast.error(getErrorMessage(error))
      // Khoản còn tồn hoặc chức vụ có thể vừa đổi; tải lại để hộp thoại hiện đúng danh sách mới.
      void mine.refetch()
    },
  })

  return {
    membership,
    loading: mine.isPending,
    error: mine.error,
    refetch: () => void mine.refetch(),
    can: (action: MyMembership['allowedActions'][number]) => membership?.allowedActions.includes(action) ?? false,
    dialog,
    open: (next: MyMembershipDialog) => {
      if (run.isPending) return
      setErrorMessage(null)
      setDialog(next)
      if (next === 'resign') void mine.refetch()
    },
    /** Đang tải lại danh sách khoản còn tồn; hộp xin rời chờ xong mới cho gửi. */
    checking: mine.isFetching,
    close: () => {
      if (!run.isPending) setDialog(null)
    },
    confirm: (reason = '') => {
      if (dialog) run.mutate({ dialog, reason })
    },
    pending: run.isPending,
    errorMessage,
  }
}

function successMessage(dialog: Exclude<MyMembershipDialog, 'resign'>): string {
  switch (dialog) {
    case 'leave':
      return 'Đã gửi yêu cầu tạm nghỉ. Ban chủ nhiệm sẽ xem xét.'
    case 'withdraw':
      return 'Đã rút yêu cầu tạm nghỉ.'
    case 'return':
      return 'Chào mừng bạn quay lại sinh hoạt.'
  }
}

export type MyMembershipViewModel = ReturnType<typeof useMyMembershipViewModel>
