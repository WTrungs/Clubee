import type { Tone } from '@/shared/ui/tone'
import type { NotificationCategory, NotificationSummary, NotificationTarget } from '../model/notificationTypes'

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = ['ANNOUNCEMENT', 'TASK', 'EVENT', 'SESSION', 'FINANCE', 'POSITION', 'TERM', 'MEMBERSHIP']

export const notificationCategoryDisplay: Record<NotificationCategory, { label: string; tone: Tone }> = {
  ANNOUNCEMENT: { label: 'Thông báo CLB', tone: 'info' },
  TASK: { label: 'Công việc', tone: 'warning' },
  EVENT: { label: 'Sự kiện', tone: 'success' },
  SESSION: { label: 'Sinh hoạt', tone: 'progress' },
  FINANCE: { label: 'Tài chính', tone: 'info' },
  POSITION: { label: 'Chức vụ', tone: 'progress' },
  TERM: { label: 'Nhiệm kỳ', tone: 'warning' },
  MEMBERSHIP: { label: 'Tư cách thành viên', tone: 'neutral' },
}

/** Trang đích của thông báo; trang đó tự kiểm tra quyền khi mở (BR-SEC-02). `null` khi không có trang riêng. */
export function notificationPath(target: NotificationTarget | null): string | null {
  if (!target) return null
  const club = target.clubId ? encodeURIComponent(target.clubId) : null
  const id = target.id ? encodeURIComponent(target.id) : null
  switch (target.type) {
    case 'DIRECTORY':
      return '/directory'
    case 'CLUB':
      return club ? `/clubs/${club}` : null
    case 'STRUCTURE':
      return club ? `/clubs/${club}/structure` : null
    case 'MEMBERS':
      return club ? `/clubs/${club}/members${id ? `?tab=${id}` : ''}` : null
    case 'EVENT':
      return club && id ? `/clubs/${club}/events/${id}` : null
    case 'EVENT_SHARED':
      return club ? `/clubs/${club}/events?tab=shared` : null
    case 'SESSION':
      return club && id ? `/clubs/${club}/sessions/${id}` : null
    case 'TASK':
      return club && id ? `/me/tasks?task=${id}&taskClub=${club}` : null
    case 'FINANCE':
      return club && id ? `/clubs/${club}/finance?tx=${id}` : null
    case 'ADVANCE':
      // Chi tiết tạm ứng mở trong sheet ở trang Tài chính, máy chủ kiểm lại quyền xem (BR-SEC-02).
      return club && id ? `/clubs/${club}/finance?adv=${id}` : null
    case 'TERM':
      return club ? `/clubs/${club}/terms` : null
    case 'HANDOVER':
      return club && id ? `/clubs/${club}/handovers/${id}` : null
    case 'INVITATION':
      return id ? `/invite/${id}` : null
  }
}

/** Thông báo do người gửi soạn hoặc không có trang đích thì mở nội dung trong sheet; còn lại đi thẳng tới trang đích. */
export function opensInSheet(notification: Pick<NotificationSummary, 'kind' | 'target'>): boolean {
  return notification.kind === 'MANUAL' || notificationPath(notification.target) === null
}

/** Số trên chuông: quá 99 thì hiện 99+ cho gọn. */
export function unreadBadge(count: number): string | null {
  if (count <= 0) return null
  return count > 99 ? '99+' : String(count)
}
