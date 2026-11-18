import type { PersonRef } from '@/api/commonTypes'

/** Thông báo do hệ thống sinh (FR-NOT-02) hay do người gửi soạn (FR-NOT-01). */
export type NotificationKind = 'SYSTEM' | 'MANUAL'

/** Loại để lọc hộp thông báo (FR-NOT-03). */
export type NotificationCategory = 'MEMBERSHIP' | 'POSITION' | 'TASK' | 'EVENT' | 'SESSION' | 'FINANCE' | 'TERM' | 'ANNOUNCEMENT'

/** Nghĩa của `id` theo loại: giao dịch (`FINANCE`), tạm ứng (`ADVANCE`), phiên bàn giao, tab trang Thành viên (`MEMBERS`, null là mặc định), mã lời mời. */
export type NotificationTargetType = 'CLUB' | 'STRUCTURE' | 'MEMBERS' | 'TASK' | 'EVENT' | 'EVENT_SHARED' | 'SESSION' | 'FINANCE' | 'ADVANCE' | 'TERM' | 'HANDOVER' | 'DIRECTORY' | 'INVITATION'

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
}

/** Nội dung chỉ trả khi mở chi tiết, sau khi máy chủ kiểm tra lại quyền (BR-SEC-02). */
export interface NotificationDetail extends NotificationSummary {
  body: string
  sender: PersonRef | null
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
