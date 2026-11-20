import { useQuery } from '@tanstack/react-query'
import { adminRepository } from '../model/adminRepository'
import { adminQueryKeys } from './adminQueryKeys'

/** FR-ACC-09: số liệu vận hành, luôn tải mới khi mở trang. */
export function useAdminMetricsViewModel() {
  const metrics = useQuery({ queryKey: adminQueryKeys.metrics, queryFn: adminRepository.metrics, staleTime: 0 })
  return {
    metrics: metrics.data ?? null,
    loading: metrics.isPending,
    error: metrics.error,
    refetch: () => void metrics.refetch(),
  }
}
