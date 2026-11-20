import { useQueryClient } from '@tanstack/react-query'
import { sessionQueryKey } from '@/api/queryClient'
import { clubQueryKeys } from '@/features/club/viewModel/useClubDetail'
import { eventQueryKeys } from '@/features/event/viewModel/eventQueryKeys'
import { orgQueryKeys } from '@/features/org/viewModel/orgQueryKeys'
import { taskQueryKeys } from '@/features/task/viewModel/taskQueryKeys'
import { termQueryKeys } from '@/features/term/viewModel/termQueryKeys'
import { memberQueryKeys } from './memberQueryKeys'

/** Tư cách hoặc chức vụ đổi thì sĩ số, cơ cấu, phạm vi giao việc và BTC sự kiện cũng đổi theo (BR-MEM-04). */
export function useRefreshMemberData(clubId: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: memberQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: orgQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.detail(clubId) }),
      queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: eventQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: termQueryKeys.all }),
    ])
}
