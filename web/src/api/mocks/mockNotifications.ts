import type { AnnouncementAudienceRef, NotificationCategory, NotificationKind, NotificationTarget } from '@/features/notification/model/notificationTypes'
import { db, type DbNotification } from './db'
import { channelsOf } from './mockNotificationPreferences'
import { newId } from './mockHttp'
import { nowIso } from './mockTime'

export interface NotifyInput {
  clubId: string | null
  category: NotificationCategory
  title: string
  body?: string
  target?: NotificationTarget | null
  /** Người làm thao tác; không tự gửi thông báo cho chính mình. */
  actorId: string
  kind?: NotificationKind
  sendEmail?: boolean
  /** Nhóm nhận của thông báo gửi tay, để kiểm lại lúc mở (BR-SEC-02). */
  audience?: AnnouncementAudienceRef
}

/** FR-NOT-02: ghi một thông báo cho những người liên quan; trả `null` khi không còn ai để nhận. */
export function notify(userIds: Iterable<string | null | undefined>, input: NotifyInput): DbNotification | null {
  const recipients = [...new Set([...userIds].filter((userId): userId is string => Boolean(userId) && userId !== input.actorId))]
  if (recipients.length === 0) return null
  const kind = input.kind ?? 'SYSTEM'
  const notification: DbNotification = {
    id: newId('n'),
    clubId: input.clubId,
    kind,
    category: input.category,
    title: input.title,
    body: input.body ?? '',
    senderId: kind === 'MANUAL' ? input.actorId : null,
    target: input.target ?? null,
    sendEmail: input.sendEmail ?? false,
    createdAt: nowIso(),
    ...(input.audience ? { audience: input.audience } : {}),
  }
  db.notifications.push(notification)
  // Trong hệ thống luôn ghi; email, push theo tùy chọn của từng người nhận, thông báo gửi tay chỉ có email khi người gửi chọn.
  db.notificationRecipients.push(
    ...recipients.map((userId) => {
      const channels = channelsOf(userId, input.category)
      return { notificationId: notification.id, userId, readAt: null, email: channels.email && (kind === 'SYSTEM' || notification.sendEmail), push: channels.push }
    }),
  )
  return notification
}

export const clubTarget = (clubId: string): NotificationTarget => ({ type: 'CLUB', clubId, id: null })
export const structureTarget = (clubId: string): NotificationTarget => ({ type: 'STRUCTURE', clubId, id: null })
export const membersTarget = (clubId: string, tab: string | null = null): NotificationTarget => ({ type: 'MEMBERS', clubId, id: tab })
export const eventTarget = (clubId: string, eventId: string): NotificationTarget => ({ type: 'EVENT', clubId, id: eventId })
/** Tab Sự kiện chung của CLB được mời đồng tổ chức (FR-EVT-08). */
export const sharedEventsTarget = (clubId: string): NotificationTarget => ({ type: 'EVENT_SHARED', clubId, id: null })
export const sessionTarget = (clubId: string, sessionId: string): NotificationTarget => ({ type: 'SESSION', clubId, id: sessionId })
export const taskTarget = (clubId: string, taskId: string): NotificationTarget => ({ type: 'TASK', clubId, id: taskId })
export const financeTarget = (clubId: string, transactionId: string): NotificationTarget => ({ type: 'FINANCE', clubId, id: transactionId })
export const termsTarget = (clubId: string): NotificationTarget => ({ type: 'TERM', clubId, id: null })
export const handoverTarget = (clubId: string, handoverId: string): NotificationTarget => ({ type: 'HANDOVER', clubId, id: handoverId })
/** Trang đợt tuyển phía ứng viên; mở ra thì máy chủ kiểm lại quyền xem (BR-SEC-02). */
export const applicationTarget = (recruitmentId: string): NotificationTarget => ({ type: 'APPLICATION', clubId: null, id: recruitmentId })
export const recruitmentTarget = (clubId: string, recruitmentId: string): NotificationTarget => ({ type: 'RECRUITMENT', clubId, id: recruitmentId })
