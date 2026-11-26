import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { notify } from '@/api/mocks/mockNotifications'
import { server } from '@/api/mocks/server'
import { resolveRedirect } from '@/features/account/viewModel/redirect'
import { createTestWrapper, signInAs } from '@/testUtils'
import { notificationRepository } from '../model/notificationRepository'
import type { NotificationChannelPreference } from '../model/notificationTypes'
import { changedCount, toChannelMap, useNotificationSettingsViewModel } from './useNotificationSettingsViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const withEmailOff = (categories: NotificationChannelPreference[], category: string) => categories.map((item) => (item.category === category ? { ...item, email: false } : item))
const recipient = (notificationId: string | undefined, userId: string) => db.notificationRecipients.find((row) => row.notificationId === notificationId && row.userId === userId)

describe('tùy chọn thông báo (FR-ACC-07)', () => {
  it('chưa lưu lần nào thì bật hết email và push cho 9 loại', async () => {
    signInAs('u-ha')
    const preferences = await notificationRepository.preferences()
    expect(preferences.version).toBe(0)
    expect(preferences.categories).toHaveLength(9)
    expect(preferences.categories.every((item) => item.email && item.push)).toBe(true)
  })

  it('lưu được, tăng version; version cũ thì 409; thiếu loại thì 400', async () => {
    signInAs('u-ha')
    const current = await notificationRepository.preferences()
    const saved = await notificationRepository.updatePreferences({ categories: withEmailOff(current.categories, 'TASK'), version: 0 })
    expect(saved.version).toBe(1)
    expect(saved.categories.find((item) => item.category === 'TASK')).toEqual({ category: 'TASK', email: false, push: true })
    expect(await fail(notificationRepository.updatePreferences({ categories: current.categories, version: 0 }))).toMatchObject({ status: 409 })
    expect(await fail(notificationRepository.updatePreferences({ categories: current.categories.slice(1), version: 1 }))).toMatchObject({ status: 400 })
  })

  it('thông báo mới gửi email, push theo tùy chọn người nhận; trong hệ thống luôn có', async () => {
    signInAs('u-ha')
    const current = await notificationRepository.preferences()
    await notificationRepository.updatePreferences({ categories: withEmailOff(current.categories, 'TASK'), version: 0 })

    const task = notify(['u-ha', 'u-thao'], { clubId: 'c-guitar', category: 'TASK', title: 'Việc mới', actorId: 'u-anh' })
    expect(recipient(task?.id, 'u-ha')).toMatchObject({ email: false, push: true })
    expect(recipient(task?.id, 'u-thao')).toMatchObject({ email: true, push: true })

    const manual = notify(['u-ha'], { clubId: 'c-guitar', category: 'ANNOUNCEMENT', title: 'Họp CLB', actorId: 'u-anh', kind: 'MANUAL', sendEmail: false })
    expect(recipient(manual?.id, 'u-ha')).toMatchObject({ email: false, push: true })
    expect((await notificationRepository.list({})).content.some((item) => item.title === 'Việc mới')).toBe(true)
  })

  it('Admin cũng mở được trang tùy chọn sau khi đăng nhập', () => {
    expect(resolveRedirect({ from: '/me/notification-settings' }, 'ADMIN')).toBe('/me/notification-settings')
  })
})

describe('useNotificationSettingsViewModel', () => {
  it('đếm thay đổi, lưu rồi về trạng thái không còn thay đổi', async () => {
    signInAs('u-ha')
    const { result } = renderHook(() => useNotificationSettingsViewModel(), { wrapper: createTestWrapper().wrapper })
    await waitFor(() => expect(result.current.values).not.toBeNull())
    act(() => result.current.toggle('TASK', 'email', false))
    act(() => result.current.toggle('EVENT', 'push', false))
    expect(result.current.changes).toBe(2)
    act(() => result.current.toggle('EVENT', 'push', true))
    expect(result.current.changes).toBe(1)
    act(() => result.current.save())
    await waitFor(() => expect(result.current.changes).toBe(0))
    expect(result.current.values?.TASK.email).toBe(false)
    expect(db.notificationPreferences.find((preference) => preference.userId === 'u-ha')?.version).toBe(1)
  })

  it('409 thì hiện băng xung đột, tải lại thì bỏ bản nháp', async () => {
    signInAs('u-ha')
    const { result } = renderHook(() => useNotificationSettingsViewModel(), { wrapper: createTestWrapper().wrapper })
    await waitFor(() => expect(result.current.values).not.toBeNull())
    act(() => result.current.toggle('TASK', 'email', false))
    server.use(http.put('*/api/v1/me/notification-preferences', () => HttpResponse.json({ status: 409, detail: 'Xung đột.', code: 'VERSION_CONFLICT' }, { status: 409 })))
    act(() => result.current.save())
    await waitFor(() => expect(result.current.conflict).toBe(true))
    await act(() => result.current.reload())
    expect(result.current.conflict).toBe(false)
    expect(result.current.changes).toBe(0)
  })

  it('toChannelMap coi loại thiếu là bật; changedCount đếm từng ô', () => {
    const map = toChannelMap({ categories: [{ category: 'TASK', email: false, push: true }] })
    expect(map.TASK).toEqual({ email: false, push: true })
    expect(map.EVENT).toEqual({ email: true, push: true })
    expect(changedCount({ ...map, EVENT: { email: false, push: false } }, map)).toBe(2)
  })
})
