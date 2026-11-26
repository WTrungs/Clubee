import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { notify } from '@/api/mocks/mockNotifications'
import { createTestWrapper, signInAs } from '@/testUtils'
import { notificationRepository } from '../model/notificationRepository'
import { readSummary, useHasSentAnnouncements } from './useSentAnnouncementsViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)

async function sendClubAnnouncement() {
  signInAs('u-anh')
  return notificationRepository.sendAnnouncement('c-guitar', {
    audience: { kind: 'CLUB', scopeId: 'c-guitar' },
    title: 'Họp toàn CLB tối thứ Sáu',
    body: 'Mọi người có mặt lúc 19:00 tại phòng B2.04.',
    sendEmail: false,
  })
}

describe('ghim thông báo, theo dõi đã đọc (FR-NOT-05)', () => {
  it('người gửi thấy số đã đọc và danh sách đã đọc, chưa đọc', async () => {
    const sent = await sendClubAnnouncement()
    const [item] = (await notificationRepository.sentAnnouncements()).content
    expect(item).toMatchObject({ id: sent.id, audienceLabel: 'Toàn CLB', recipientCount: sent.recipientCount, readCount: 0, pinned: false, allowedActions: ['PIN'] })

    signInAs('u-ha')
    await notificationRepository.markRead(sent.id)
    signInAs('u-anh')
    expect((await notificationRepository.sentAnnouncements()).content[0]?.readCount).toBe(1)
    const read = await notificationRepository.receipts('c-guitar', sent.id, { read: true })
    expect(read.content.map((receipt) => receipt.person.id)).toEqual(['u-ha'])
    const unread = await notificationRepository.receipts('c-guitar', sent.id, { read: false })
    expect(unread.totalElements).toBe(sent.recipientCount - 1)
    expect(unread.content.some((receipt) => receipt.person.id === 'u-ha')).toBe(false)
  })

  it('tin ghim đứng đầu hộp thư người nhận kể cả khi có tin mới hơn; bỏ ghim thì về đúng thứ tự', async () => {
    const sent = await sendClubAnnouncement()
    const pinned = await notificationRepository.pin('c-guitar', sent.id, true)
    expect(pinned).toMatchObject({ pinned: true, allowedActions: ['UNPIN'] })
    notify(['u-ha'], { clubId: 'c-guitar', category: 'TASK', title: 'Việc mới hơn', actorId: 'u-linh' })

    signInAs('u-ha')
    const inbox = await notificationRepository.list({})
    expect(inbox.content[0]).toMatchObject({ id: sent.id, pinned: true })

    signInAs('u-anh')
    await notificationRepository.pin('c-guitar', sent.id, false)
    signInAs('u-ha')
    expect((await notificationRepository.list({})).content[0]?.title).toBe('Việc mới hơn')
  })

  it('người không gửi không xem được ai đã đọc, không ghim được', async () => {
    const sent = await sendClubAnnouncement()
    signInAs('u-linh')
    expect(await fail(notificationRepository.receipts('c-guitar', sent.id, {}))).toMatchObject({ status: 403 })
    expect(await fail(notificationRepository.pin('c-guitar', sent.id, true))).toMatchObject({ status: 403 })
    expect((await notificationRepository.sentAnnouncements()).totalElements).toBe(0)
  })

  it('tab Đã gửi chỉ hiện với người từng gửi; câu số đã đọc', async () => {
    signInAs('u-linh')
    const none = renderHook(() => useHasSentAnnouncements(), { wrapper: createTestWrapper().wrapper })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(none.result.current).toBe(false)
    await sendClubAnnouncement()
    const some = renderHook(() => useHasSentAnnouncements(), { wrapper: createTestWrapper().wrapper })
    await waitFor(() => expect(some.result.current).toBe(true))
    expect(readSummary({ readCount: 12, recipientCount: 30 })).toBe('12/30 đã đọc')
  })
})
