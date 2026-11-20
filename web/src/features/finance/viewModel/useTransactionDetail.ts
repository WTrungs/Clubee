import { useQuery } from '@tanstack/react-query'
import { financeRepository } from '../model/financeRepository'
import { financeQueryKeys } from './financeQueryKeys'

/** Chi tiết giao dịch nhìn từ quỹ đang xem; máy chủ kiểm tra quyền mỗi lần mở (BR-SEC-02). */
export function useTransactionDetail(clubId: string, transactionId: string | null, fundId: string | null = null) {
  return useQuery({
    queryKey: financeQueryKeys.transaction(clubId, transactionId ?? '', fundId),
    queryFn: () => financeRepository.transaction(clubId, transactionId ?? '', fundId ?? undefined),
    enabled: transactionId !== null,
    // Không giữ nội dung trong cache: quyền xem có thể đã mất giữa hai lần mở.
    staleTime: 0,
    gcTime: 0,
  })
}
