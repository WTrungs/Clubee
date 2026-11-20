import { useQueryClient } from '@tanstack/react-query'
import { clubQueryKeys } from '@/features/club/viewModel/useClubDetail'
import { termQueryKeys } from './termQueryKeys'

/** Nhiệm kỳ đổi thì quyền khai báo nhiệm kỳ ở hồ sơ CLB (`CREATE_TERM`) cũng đổi theo. */
export function useRefreshTermData(clubId: string) {
  const queryClient = useQueryClient()
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: termQueryKeys.all }), queryClient.invalidateQueries({ queryKey: clubQueryKeys.detail(clubId) })])
}
