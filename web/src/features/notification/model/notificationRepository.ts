import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type {
  AnnouncementAudience,
  NotificationDetail,
  NotificationQuery,
  NotificationSummary,
  SendAnnouncementRequest,
  SendAnnouncementResult,
  UnreadCount,
} from './notificationTypes'

const notification = (id: string) => `/me/notifications/${encodeURIComponent(id)}`
const club = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}`

/** FR-NOT-03: hộp thông báo của người dùng, gộp mọi CLB. */
export const notificationRepository = {
  list: (query: NotificationQuery) =>
    httpClient.get<Page<NotificationSummary>>('/me/notifications', {
      query: { category: query.category, unread: query.unread ? 'true' : undefined, q: query.q, page: query.page, size: query.size },
    }),
  unreadCount: () => httpClient.get<UnreadCount>('/me/notifications/unread-count'),
  get: (id: string) => httpClient.get<NotificationDetail>(notification(id)),
  markRead: (id: string) => httpClient.post<NotificationSummary>(`${notification(id)}/read`),
  markAllRead: () => httpClient.post<void>('/me/notifications/read-all'),
  /** FR-NOT-01: nhóm nhận người gọi được chọn ở CLB hiện hành. */
  audiences: (clubId: string) => httpClient.get<AnnouncementAudience[]>(`${club(clubId)}/announcement-audiences`),
  sendAnnouncement: (clubId: string, request: SendAnnouncementRequest) => httpClient.post<SendAnnouncementResult>(`${club(clubId)}/announcements`, request),
}
