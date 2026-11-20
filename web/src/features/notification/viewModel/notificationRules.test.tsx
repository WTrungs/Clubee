import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { notify } from '@/api/mocks/mockNotifications'
import { vnDate, vnDayAt } from '@/api/mocks/mockTime'
import { eventRepository } from '@/features/event/model/eventRepository'
import { memberRepository } from '@/features/member/model/memberRepository'
import { orgRepository } from '@/features/org/model/orgRepository'
import { formatDate } from '@/shared/format/formatDate'
import { taskRepository } from '@/features/task/model/taskRepository'
import { createTestWrapper, signInAs } from '@/testUtils'
import { notificationRepository } from '../model/notificationRepository'
import { NotificationDetailSheet } from '../view/NotificationDetailSheet'
import { notificationQueryKeys } from './notificationQueryKeys'
import { useNotificationInboxViewModel } from './useNotificationInboxViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const titles = async () => (await notificationRepository.list({ size: 50 })).content.map((item) => item.title)

describe('automatic notifications (FR-NOT-02)', () => {
  it('never notifies the person who did the action and sends once per person', () => {
    const notification = notify(['u-anh', 'u-ha', 'u-ha', null], { clubId: 'c-guitar', category: 'TASK', title: 'Thử', actorId: 'u-anh' })
    expect(db.notificationRecipients.filter((recipient) => recipient.notificationId === notification?.id).map((recipient) => recipient.userId)).toEqual(['u-ha'])
    expect(notify(['u-anh'], { clubId: 'c-guitar', category: 'TASK', title: 'Thử', actorId: 'u-anh' })).toBeNull()
  })

  it('tells the applicant when the join request is approved', async () => {
    signInAs('u-quan')
    const before = (await notificationRepository.unreadCount()).count
    signInAs('u-anh')
    const request = (await memberRepository.joinRequests('c-guitar', {})).content.find((item) => item.applicant.id === 'u-quan')
    if (!request) throw new Error('Thiếu yêu cầu của Quân trong seed')
    await memberRepository.transition('c-guitar', request.membershipId, { action: 'APPROVE_PROBATION', departmentId: 'd-media', version: request.version })
    expect(await titles()).not.toContain('Yêu cầu gia nhập CLB Guitar Sinh viên đã được duyệt')

    signInAs('u-quan')
    expect((await notificationRepository.unreadCount()).count).toBe(before + 1)
    const [latest] = (await notificationRepository.list({})).content
    expect(latest).toMatchObject({ category: 'MEMBERSHIP', title: 'Yêu cầu gia nhập CLB Guitar Sinh viên đã được duyệt', target: { type: 'CLUB', clubId: 'c-guitar' } })
  })

  it('tells the owner and collaborators about a new task, and the owner when it is sent back', async () => {
    signInAs('u-linh')
    const task = await taskRepository.create('c-guitar', {
      title: 'Chụp ảnh buổi tập',
      description: '',
      scopeType: 'DEPARTMENT',
      scopeId: 'd-media',
      ownerId: 'u-ha',
      collaboratorIds: ['u-vy'],
      dueAt: vnDayAt(5, 18),
      priority: 'MEDIUM',
    })
    for (const userId of ['u-ha', 'u-vy']) {
      signInAs(userId)
      expect(await titles()).toContain('Bạn được giao việc: Chụp ảnh buổi tập')
    }

    signInAs('u-ha')
    const started = await taskRepository.transition('c-guitar', task.id, { action: 'START', version: task.version })
    const submitted = await taskRepository.transition('c-guitar', task.id, { action: 'SUBMIT', note: 'Đã chụp xong.', version: started.version })
    signInAs('u-linh')
    await taskRepository.transition('c-guitar', task.id, { action: 'REQUEST_CHANGES', reason: 'Thiếu ảnh toàn cảnh.', version: submitted.version })
    signInAs('u-ha')
    const returned = (await notificationRepository.list({ category: 'TASK' })).content[0]
    expect(returned).toMatchObject({ title: 'Việc bị trả lại: Chụp ảnh buổi tập', target: { type: 'TASK', id: task.id } })
    expect((await notificationRepository.get(returned?.id ?? '')).body).toBe('Nhận xét: Thiếu ảnh toàn cảnh.')
  })

  it('tells the holder when a position is assigned or revoked, with the reason', async () => {
    signInAs('u-anh')
    const endOn = db.terms.find((term) => term.clubId === 'c-guitar' && term.status === 'RUNNING')?.endOn ?? ''
    await orgRepository.assign('c-guitar', { userId: 'u-hieu', role: 'DEPARTMENT_HEAD', scopeId: 'd-design', startOn: vnDate(0), endOn })
    const linhHead = db.positions.find((position) => position.userId === 'u-linh' && position.role === 'DEPARTMENT_HEAD' && position.scopeId === 'd-media')
    await orgRepository.revoke('c-guitar', linhHead?.id ?? '', { reason: 'Bàn giao cho người mới.', handoverOn: vnDate(0), version: linhHead?.version ?? 1 })
    expect(await titles()).not.toEqual(expect.arrayContaining([expect.stringContaining('Trưởng ban Thiết kế')]))

    signInAs('u-hieu')
    expect(await titles()).toContain('Bạn được gán chức Trưởng ban Thiết kế')
    signInAs('u-linh')
    const revoked = (await notificationRepository.list({ category: 'POSITION' })).content[0]
    expect(revoked).toMatchObject({ title: `Chức Trưởng ban Truyền thông của bạn được thu hồi từ ${formatDate(vnDate(0))}`, target: { type: 'STRUCTURE', clubId: 'c-guitar' } })
    expect((await notificationRepository.get(revoked?.id ?? '')).body).toBe('Lý do: Bàn giao cho người mới.')
  })

  it('tells registrants and the event lead when an event is cancelled', async () => {
    signInAs('u-anh')
    const event = await eventRepository.get('c-guitar', 'e-winter')
    await eventRepository.transition('c-guitar', 'e-winter', { action: 'CANCEL', reason: 'Hội trường đột xuất sửa chữa.', version: event.version })
    for (const userId of ['u-bao', 'u-linh', 'u-tram']) {
      signInAs(userId)
      expect(await titles()).toContain('Sự kiện Đêm nhạc Mùa đông đã bị hủy')
    }
  })
})

describe('inbox (FR-NOT-03, BR-SEC-02)', () => {
  it('filters unread, marks one and then all as read', async () => {
    signInAs('u-ha')
    expect((await notificationRepository.unreadCount()).count).toBe(2)
    const unread = await notificationRepository.list({ unread: true })
    expect(unread.content.map((item) => item.title)).toEqual(['Bạn được giao việc: Viết bài giới thiệu thành viên mới', 'Lịch sinh hoạt tháng 11'])
    expect(unread.content.every((item) => !('body' in item))).toBe(true)

    const read = await notificationRepository.markRead(unread.content[0]?.id ?? '')
    expect(read.readAt).not.toBeNull()
    expect((await notificationRepository.unreadCount()).count).toBe(1)
    await notificationRepository.markAllRead()
    expect((await notificationRepository.unreadCount()).count).toBe(0)
  })

  it('hides other people’s notifications', async () => {
    signInAs('u-anh')
    expect((await fail(notificationRepository.get('n-ha-task')))?.status).toBe(404)
    expect((await fail(notificationRepository.markRead('n-ha-task')))?.status).toBe(404)
    expect(db.notificationRecipients.find((recipient) => recipient.notificationId === 'n-ha-task')?.readAt).toBeNull()
  })

  it('re-checks membership when an announcement is opened, but still explains a removal', async () => {
    signInAs('u-ha')
    expect((await notificationRepository.get('n-guitar-schedule')).body).toContain('Sinh hoạt chung tối thứ Tư')

    signInAs('u-anh')
    const ha = (await memberRepository.list('c-guitar', { q: 'Lê Thu Hà' })).content[0]
    const detail = await memberRepository.get('c-guitar', ha?.membershipId ?? '')
    await memberRepository.transition('c-guitar', detail.membershipId, { action: 'REMOVE', reason: 'Vắng quá nhiều buổi.', version: detail.version })

    signInAs('u-ha')
    const blocked = await fail(notificationRepository.get('n-guitar-schedule'))
    expect(blocked?.status).toBe(403)
    expect(blocked?.detail).toContain('không còn là thành viên CLB Guitar Sinh viên')
    const removal = (await notificationRepository.list({ category: 'MEMBERSHIP' })).content[0]
    expect(removal?.title).toBe('Bạn đã bị đưa ra khỏi CLB Guitar Sinh viên')
    expect((await notificationRepository.get(removal?.id ?? '')).body).toBe('Lý do: Vắng quá nhiều buổi.')
  })
})

describe('notification detail sheet (BR-SEC-02)', () => {
  it('asks the server again on every open, so a member who has left no longer sees the content', async () => {
    signInAs('u-ha')
    const { wrapper: Wrapper } = createTestWrapper('/notifications')
    const sheet = (id: string | null) => (
      <Wrapper>
        <NotificationDetailSheet id={id} onClose={() => {}} />
      </Wrapper>
    )
    const view = render(sheet('n-guitar-schedule'))
    expect(await screen.findByText(/Sinh hoạt chung tối thứ Tư/)).toBeInTheDocument()
    view.rerender(sheet(null))

    const membership = db.memberships.find((candidate) => candidate.userId === 'u-ha' && candidate.clubId === 'c-guitar' && candidate.status !== 'LEFT')
    if (membership) Object.assign(membership, { status: 'LEFT' })
    view.rerender(sheet('n-guitar-schedule'))
    expect(await screen.findByText(/không còn là thành viên CLB Guitar Sinh viên/)).toBeInTheDocument()
    expect(screen.queryByText(/Sinh hoạt chung tối thứ Tư/)).toBeNull()
  })

  it('drops the content from the cache once the sheet is closed', async () => {
    signInAs('u-ha')
    const { wrapper: Wrapper, queryClient } = createTestWrapper('/notifications')
    const view = render(
      <Wrapper>
        <NotificationDetailSheet id="n-guitar-schedule" onClose={() => {}} />
      </Wrapper>,
    )
    expect(await screen.findByText(/Sinh hoạt chung tối thứ Tư/)).toBeInTheDocument()
    view.rerender(
      <Wrapper>
        <NotificationDetailSheet id={null} onClose={() => {}} />
      </Wrapper>,
    )
    await waitFor(() => expect(queryClient.getQueryCache().find({ queryKey: notificationQueryKeys.detail('n-guitar-schedule') })).toBeUndefined())
  })
})

describe('useNotificationInboxViewModel (FR-NOT-03)', () => {
  it('goes to the task page for a system notice and opens announcements in the sheet', async () => {
    signInAs('u-ha')
    const { wrapper } = createTestWrapper('/notifications')
    const { result } = renderHook(() => ({ vm: useNotificationInboxViewModel(), location: useLocation() }), { wrapper })
    await waitFor(() => expect(result.current.vm.items.length).toBeGreaterThan(0))

    const announcement = result.current.vm.items.find((item) => item.kind === 'MANUAL')
    const task = result.current.vm.items.find((item) => item.category === 'TASK')
    if (!announcement || !task) throw new Error('Thiếu thông báo mẫu của Hà')
    act(() => result.current.vm.open(announcement))
    expect(result.current.vm.openedId).toBe(announcement.id)
    expect(result.current.location.pathname).toBe('/notifications')

    act(() => result.current.vm.open(task))
    expect(`${result.current.location.pathname}${result.current.location.search}`).toBe('/me/tasks?task=t-intro-post&taskClub=c-guitar')
    await waitFor(() => expect(db.notificationRecipients.filter((recipient) => recipient.userId === 'u-ha' && recipient.readAt === null)).toHaveLength(0))
  })

  it('narrows the list by category and unread', async () => {
    signInAs('u-ha')
    const { wrapper } = createTestWrapper('/notifications')
    const { result } = renderHook(() => useNotificationInboxViewModel(), { wrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(3))
    act(() => result.current.toggleCategory('POSITION'))
    await waitFor(() => expect(result.current.items.map((item) => item.category)).toEqual(['POSITION']))
    act(() => result.current.setTab('unread'))
    await waitFor(() => expect(result.current.items).toHaveLength(0))
    expect(result.current.filtered).toBe(true)
  })
})
