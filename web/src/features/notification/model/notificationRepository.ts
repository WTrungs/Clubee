import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type {
  AnnouncementAudience,
  AnnouncementReceipt,
  AnnouncementReceiptQuery,
  NotificationDetail,
  NotificationPreferences,
  NotificationQuery,
  NotificationSummary,
  SendAnnouncementRequest,
  SendAnnouncementResult,
  SentAnnouncement,
  UnreadCount,
  UpdateNotificationPreferencesRequest,
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
  /** FR-ACC-07: kênh email, push theo loại thông báo. */
  preferences: () => httpClient.get<NotificationPreferences>('/me/notification-preferences'),
  updatePreferences: (request: UpdateNotificationPreferencesRequest) => httpClient.put<NotificationPreferences>('/me/notification-preferences', request),
  /** FR-NOT-01: nhóm nhận người gọi được chọn ở CLB hiện hành. */
  audiences: (clubId: string) => httpClient.get<AnnouncementAudience[]>(`${club(clubId)}/announcement-audiences`),
  sendAnnouncement: (clubId: string, request: SendAnnouncementRequest) => httpClient.post<SendAnnouncementResult>(`${club(clubId)}/announcements`, request),
  /** FR-NOT-05: thông báo tôi đã gửi, ai đã đọc, ghim lên đầu hộp thư người nhận. */
  sentAnnouncements: (page = 0, size = 20) => httpClient.get<Page<SentAnnouncement>>('/me/sent-announcements', { query: { page, size } }),
  receipts: (clubId: string, announcementId: string, query: AnnouncementReceiptQuery) =>
    httpClient.get<Page<AnnouncementReceipt>>(`${club(clubId)}/announcements/${encodeURIComponent(announcementId)}/receipts`, { query: { read: query.read, page: query.page } }),
  pin: (clubId: string, announcementId: string, pinned: boolean) => httpClient.put<SentAnnouncement>(`${club(clubId)}/announcements/${encodeURIComponent(announcementId)}/pin`, { pinned }),
}
