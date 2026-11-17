import type { NotificationCategory, NotificationKind, NotificationTarget } from '@/features/notification/model/notificationTypes'
import { vnDayAt } from '../mockTime'
import { createMembershipSeed } from './memberSeed'

/** Thông báo (SRS 4.1): một bản ghi, người nhận và trạng thái đã đọc lưu riêng theo từng người. */
export interface DbNotification {
  id: string
  clubId: string | null
  kind: NotificationKind
  category: NotificationCategory
  title: string
  body: string
  senderId: string | null
  target: NotificationTarget | null
  sendEmail: boolean
  createdAt: string
}

export interface DbNotificationRecipient {
  notificationId: string
  userId: string
  readAt: string | null
}

interface SeedSpec {
  notification: DbNotification
  recipients: string[]
  read?: boolean
}

function rosterOf(clubId: string, except: string): string[] {
  return createMembershipSeed()
    .filter((membership) => membership.clubId === clubId && ['PROBATION', 'ACTIVE', 'ON_LEAVE'].includes(membership.status) && membership.userId !== except)
    .map((membership) => membership.userId)
}

function specs(): SeedSpec[] {
  const system = (id: string, clubId: string, category: NotificationCategory, title: string, target: NotificationTarget, createdAt: string) => ({
    id,
    clubId,
    kind: 'SYSTEM' as const,
    category,
    title,
    body: '',
    senderId: null,
    target,
    sendEmail: false,
    createdAt,
  })
  return [
    {
      notification: {
        id: 'n-guitar-schedule',
        clubId: 'c-guitar',
        kind: 'MANUAL',
        category: 'ANNOUNCEMENT',
        title: 'Lịch sinh hoạt tháng 11',
        body: 'Sinh hoạt chung tối thứ Tư hằng tuần, 18:30 tại phòng B2.05.\nTuần cuối tháng tập tổng duyệt cho Đêm nhạc Mùa đông, các ban nhớ đi đủ.',
        senderId: 'u-anh',
        target: { type: 'CLUB', clubId: 'c-guitar', id: null },
        sendEmail: true,
        createdAt: vnDayAt(-2, 20),
      },
      recipients: rosterOf('c-guitar', 'u-anh'),
    },
    {
      notification: system('n-ha-task', 'c-guitar', 'TASK', 'Bạn được giao việc: Viết bài giới thiệu thành viên mới', { type: 'TASK', clubId: 'c-guitar', id: 't-intro-post' }, vnDayAt(-1, 9)),
      recipients: ['u-ha'],
    },
    {
      notification: system('n-ha-position', 'c-english', 'POSITION', 'Bạn được gán chức Trưởng ban Nội dung', { type: 'STRUCTURE', clubId: 'c-english', id: null }, vnDayAt(-200, 10)),
      recipients: ['u-ha'],
      read: true,
    },
    {
      notification: system('n-bao-lead', 'c-guitar', 'EVENT', 'Bạn được chọn làm Trưởng BTC Đêm nhạc Mùa đông', { type: 'EVENT', clubId: 'c-guitar', id: 'e-winter' }, vnDayAt(-10, 15)),
      recipients: ['u-bao'],
    },
    {
      notification: system('n-anh-president', 'c-guitar', 'POSITION', 'Bạn được gán chức Chủ nhiệm', { type: 'STRUCTURE', clubId: 'c-guitar', id: null }, vnDayAt(-64, 9)),
      recipients: ['u-anh'],
      read: true,
    },
  ]
}

export function createNotificationSeed(): { notifications: DbNotification[]; recipients: DbNotificationRecipient[] } {
  const all = specs()
  return {
    notifications: all.map((spec) => spec.notification),
    recipients: all.flatMap((spec) =>
      spec.recipients.map((userId) => ({ notificationId: spec.notification.id, userId, readAt: spec.read ? spec.notification.createdAt : null })),
    ),
  }
}
