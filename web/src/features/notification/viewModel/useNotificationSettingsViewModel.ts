import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { getErrorMessage, isConflict } from '@/api/apiError'
import { notificationRepository } from '../model/notificationRepository'
import type { NotificationCategory, NotificationChannelPreference, NotificationPreferences } from '../model/notificationTypes'
import { NOTIFICATION_CATEGORIES } from './notificationDisplay'

export type Channel = 'email' | 'push'
type ChannelMap = Record<NotificationCategory, { email: boolean; push: boolean }>

export const notificationPreferencesKey = ['notificationPreferences'] as const

/** Đổi danh sách máy chủ trả về thành bảng theo loại, theo thứ tự hiển thị; loại thiếu coi như bật (mặc định). */
export function toChannelMap(preferences: Pick<NotificationPreferences, 'categories'>): ChannelMap {
  return Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((category) => {
      const found = preferences.categories.find((item) => item.category === category)
      return [category, { email: found?.email ?? true, push: found?.push ?? true }]
    }),
  ) as ChannelMap
}

export const toCategories = (map: ChannelMap): NotificationChannelPreference[] => NOTIFICATION_CATEGORIES.map((category) => ({ category, ...map[category] }))

/** Số ô khác bản đã lưu, để bật nút Lưu và nêu số thay đổi. */
export function changedCount(draft: ChannelMap, saved: ChannelMap): number {
  return NOTIFICATION_CATEGORIES.reduce((sum, category) => sum + Number(draft[category].email !== saved[category].email) + Number(draft[category].push !== saved[category].push), 0)
}

/** FR-ACC-07: bật, tắt email và push theo loại; giữ version lúc bắt đầu sửa để biết có ai vừa lưu ở nơi khác (409). */
export function useNotificationSettingsViewModel() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: notificationPreferencesKey, queryFn: notificationRepository.preferences })
  const [draft, setDraft] = useState<ChannelMap | null>(null)
  const [baseVersion, setBaseVersion] = useState<number | null>(null)
  const [conflict, setConflict] = useState(false)
  const saved = query.data ? toChannelMap(query.data) : null
  const values = draft ?? saved

  const save = useMutation({
    mutationFn: (map: ChannelMap) => notificationRepository.updatePreferences({ categories: toCategories(map), version: baseVersion ?? query.data?.version ?? 0 }),
    meta: { silentError: true },
    onSuccess: (next) => {
      queryClient.setQueryData(notificationPreferencesKey, next)
      setDraft(null)
      setBaseVersion(null)
      toast.success('Đã lưu tùy chọn thông báo.')
    },
    onError: (error) => {
      if (isConflict(error)) setConflict(true)
      else toast.error(getErrorMessage(error))
    },
  })

  return {
    loading: query.isPending,
    error: query.error,
    retry: () => void query.refetch(),
    values,
    toggle: (category: NotificationCategory, channel: Channel, enabled: boolean) => {
      if (!values) return
      if (baseVersion === null) setBaseVersion(query.data?.version ?? 0)
      setDraft({ ...values, [category]: { ...values[category], [channel]: enabled } })
    },
    changes: values && saved ? changedCount(values, saved) : 0,
    discard: () => {
      setDraft(null)
      setBaseVersion(null)
    },
    save: () => values && save.mutate(values),
    saving: save.isPending,
    conflict,
    reload: async () => {
      await query.refetch()
      setDraft(null)
      setBaseVersion(null)
      setConflict(false)
    },
    updatedAt: query.data?.updatedAt ?? null,
  }
}
