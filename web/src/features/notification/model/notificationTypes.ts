import type { PersonRef } from '@/api/commonTypes'

/** Thông báo do hệ thống sinh (FR-NOT-02) hay do người gửi soạn (FR-NOT-01). */
export type NotificationKind = 'SYSTEM' | 'MANUAL'

/** Loại để lọc hộp thông báo (FR-NOT-03). */
export type NotificationCategory = 'MEMBERSHIP' | 'POSITION' | 'TASK' | 'EVENT' | 'SESSION' | 'FINANCE' | 'TERM' | 'ANNOUNCEMENT' | 'RECRUITMENT'

/** Nghĩa của `id` theo loại: giao dịch (`FINANCE`), tạm ứng (`ADVANCE`), đợt đóng quỹ (`DUES`), phiên bàn giao, tab trang Thành viên, mã lời mời, đợt tuyển (`APPLICATION` phía ứng viên, `RECRUITMENT` phía ban chủ nhiệm). */
export type NotificationTargetType =
  | 'CLUB'
  | 'STRUCTURE'
  | 'MEMBERS'
  | 'TASK'
  | 'EVENT'
  | 'EVENT_SHARED'
  | 'SESSION'
  | 'FINANCE'
  | 'ADVANCE'
  | 'DUES'
  | 'TERM'
  | 'HANDOVER'
  | 'DIRECTORY'
  | 'INVITATION'
  | 'APPLICATION'
  | 'RECRUITMENT'

/** Màn hình liên quan; mở ra thì màn đó tự kiểm tra quyền tại thời điểm mở (BR-SEC-02). */
export interface NotificationTarget {
  type: NotificationTargetType
  clubId: string | null
  id: string | null
}

export interface NotificationSummary {
  id: string
  kind: NotificationKind
  category: NotificationCategory
  title: string
  clubId: string | null
  clubName: string | null
  createdAt: string
  readAt: string | null
  target: NotificationTarget | null
  /** FR-NOT-05: người gửi ghim; đứng đầu hộp thư. */
  pinned: boolean
}

/** Nội dung chỉ trả khi mở chi tiết, sau khi máy chủ kiểm tra lại quyền (BR-SEC-02). */
export interface NotificationDetail extends NotificationSummary {
  body: string
  sender: PersonRef | null
}

/** FR-ACC-07: kênh gửi ngoài hệ thống cho một loại thông báo; thông báo trong hệ thống luôn bật. Push chỉ tới ứng dụng Android. */
export interface NotificationChannelPreference {
  category: NotificationCategory
  email: boolean
  push: boolean
}

export interface NotificationPreferences {
  categories: NotificationChannelPreference[]
  updatedAt: string | null
  version: number
}

export interface UpdateNotificationPreferencesRequest {
  categories: NotificationChannelPreference[]
  version: number
}

export interface UnreadCount {
  count: number
}

/** Nhóm nhận thông báo (FR-NOT-01): toàn CLB, một ban, hoặc ban tổ chức một sự kiện. */
export type AnnouncementAudienceKind = 'CLUB' | 'DEPARTMENT' | 'EVENT_STAFF'

export interface AnnouncementAudienceRef {
  kind: AnnouncementAudienceKind
  /** Mã CLB, ban hoặc sự kiện tùy `kind`. */
  scopeId: string
}

/** Nhóm người gọi được chọn theo phạm vi chức vụ; `recipientCount` không tính chính người gửi. */
export interface AnnouncementAudience extends AnnouncementAudienceRef {
  label: string
  recipientCount: number
}

export interface SendAnnouncementRequest {
  audience: AnnouncementAudienceRef
  title: string
  body: string
  sendEmail: boolean
}

export interface SendAnnouncementResult {
  id: string
  recipientCount: number
}

export interface NotificationQuery {
  category?: NotificationCategory
  unread?: boolean
  q?: string
  page?: number
  size?: number
}

/** FR-NOT-05: thông báo người gọi đã gửi, kèm số người đã đọc. */
export type SentAnnouncementAction = 'PIN' | 'UNPIN'

export interface SentAnnouncement {
  id: string
  clubId: string
  clubName: string
  title: string
  audienceLabel: string
  createdAt: string
  recipientCount: number
  readCount: number
  pinned: boolean
  allowedActions: SentAnnouncementAction[]
}

export interface AnnouncementReceipt {
  person: PersonRef
  readAt: string | null
}

export interface AnnouncementReceiptQuery {
  read?: boolean
  page?: number
}
