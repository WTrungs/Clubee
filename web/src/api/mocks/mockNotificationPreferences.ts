import type { NotificationCategory, NotificationChannelPreference, NotificationPreferences } from '@/features/notification/model/notificationTypes'
import { db } from './db'

/** Tùy chọn kênh gửi của một người (FR-ACC-07); chưa có bản ghi là mặc định bật hết (chốt 22/11). */
export interface DbNotificationPreference {
  userId: string
  channels: Partial<Record<NotificationCategory, { email: boolean; push: boolean }>>
  updatedAt: string
  version: number
}

export const PREFERENCE_CATEGORIES: NotificationCategory[] = ['ANNOUNCEMENT', 'TASK', 'EVENT', 'SESSION', 'FINANCE', 'POSITION', 'TERM', 'MEMBERSHIP', 'RECRUITMENT']

export const preferenceRecordOf = (userId: string) => db.notificationPreferences.find((preference) => preference.userId === userId)

export function channelsOf(userId: string, category: NotificationCategory): { email: boolean; push: boolean } {
  return preferenceRecordOf(userId)?.channels[category] ?? { email: true, push: true }
}

export function toPreferences(userId: string): NotificationPreferences {
  const record = preferenceRecordOf(userId)
  const categories: NotificationChannelPreference[] = PREFERENCE_CATEGORIES.map((category) => ({ category, ...channelsOf(userId, category) }))
  return { categories, updatedAt: record?.updatedAt ?? null, version: record?.version ?? 0 }
}
