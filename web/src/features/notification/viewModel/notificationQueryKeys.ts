import type { NotificationQuery } from '../model/notificationTypes'

export const notificationQueryKeys = {
  all: ['notifications'] as const,
  list: (query: NotificationQuery) => ['notifications', 'list', query] as const,
  unreadCount: ['notifications', 'unreadCount'] as const,
  detail: (id: string) => ['notifications', 'detail', id] as const,
  sent: (page: number, size: number) => ['notifications', 'sent', page, size] as const,
  receipts: (announcementId: string, read: boolean) => ['notifications', 'receipts', announcementId, read] as const,
  /** Gốc khóa riêng để việc đánh dấu đã đọc không làm tải lại danh sách nhóm nhận. */
  audiences: (clubId: string) => ['announcementAudiences', clubId] as const,
}
