import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/features/account/viewModel/useSession'
import { publicEventRepository } from '../model/publicEventRepository'

export const publicEventQueryKeys = {
  detail: (eventId: string) => ['publicEvents', eventId] as const,
}

/** FR-CLB-07: trang công khai của sự kiện mở cho khách; thành viên CLB được gợi ý mở trong ứng dụng. */
export function usePublicEventViewModel(eventId: string) {
  const session = useSession()
  const event = useQuery({ queryKey: publicEventQueryKeys.detail(eventId), queryFn: () => publicEventRepository.get(eventId) })
  const data = event.data ?? null
  const memberOfClub = data !== null && (session.data?.memberships.some((membership) => membership.clubId === data.clubId && membership.memberStatus !== 'PENDING') ?? false)
  return {
    event: data,
    loading: event.isPending,
    error: event.error,
    refetch: () => void event.refetch(),
    /** Thành viên đăng ký trong ứng dụng để được tính chuyên cần; khách dùng form trên trang này. */
    appPath: memberOfClub && data ? `/clubs/${encodeURIComponent(data.clubId)}/events/${encodeURIComponent(data.id)}` : null,
  }
}
