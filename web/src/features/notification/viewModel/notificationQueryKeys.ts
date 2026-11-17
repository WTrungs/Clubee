import type { NotificationQuery } from '../model/notificationTypes'

export const notificationQueryKeys = {
  all: ['notifications'] as const,
  list: (query: NotificationQuery) => ['notifications', 'list', query] as const,
  unreadCount: ['notifications', 'unreadCount'] as const,
  detail: (id: string) => ['notifications', 'detail', id] as const,
  /** Gốc khóa riêng để việc đánh dấu đã đọc không làm tải lại danh sách nhóm nhận. */
  audiences: (clubId: string) => ['announcementAudiences', clubId] as const,
}
