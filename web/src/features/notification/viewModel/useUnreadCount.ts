import { useQuery } from '@tanstack/react-query'
import { notificationRepository } from '../model/notificationRepository'
import { notificationQueryKeys } from './notificationQueryKeys'

/** Chuông trên header hỏi lại mỗi 60 giây; SRS không đòi thông báo thời gian thực. */
export function useUnreadCount() {
  return useQuery({
    queryKey: notificationQueryKeys.unreadCount,
    queryFn: notificationRepository.unreadCount,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
}
