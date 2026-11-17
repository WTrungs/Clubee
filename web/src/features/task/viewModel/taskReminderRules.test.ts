import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { toVnIso, vnDayAt } from '@/api/mocks/mockTime'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { formatDateTime } from '@/shared/format/formatDate'
import { signInAs } from '@/testUtils'
import { taskRepository } from '../model/taskRepository'

const HOUR_MS = 60 * 60 * 1000
const stored = (id: string) => {
  const task = db.tasks.find((candidate) => candidate.id === id)
  if (!task) throw new Error(`Thiếu việc ${id}`)
  return task
}
const fromNow = (hours: number) => toVnIso(Date.now() + hours * HOUR_MS)
/** Mỗi request đã đăng nhập chạy việc theo giờ. */
const visitAs = async (userId: string) => {
  signInAs(userId)
  await taskRepository.listMine({})
}
const countTitle = async (userId: string, title: string) => {
  signInAs(userId)
  return (await notificationRepository.list({ category: 'TASK', size: 100 })).content.filter((notification) => notification.title === title).length
}
const membershipOf = (userId: string) => {
  const found = db.memberships.find((membership) => membership.clubId === 'c-guitar' && membership.userId === userId && membership.status !== 'LEFT')
  if (!found) throw new Error(`Thiếu tư cách ${userId}`)
  return found
}
const winter = () => {
  const event = db.events.find((candidate) => candidate.id === 'e-winter')
  if (!event) throw new Error('Thiếu e-winter')
  return event
}
const guitar = () => {
  const club = db.clubs.find((candidate) => candidate.id === 'c-guitar')
  if (!club) throw new Error('Thiếu c-guitar')
  return club
}

afterEach(() => vi.useRealTimers())

describe('due reminders (FR-TASK-06)', () => {
  it('sends nothing for the sample data on the first visit', async () => {
    const before = db.notifications.length
    await visitAs('u-ha')
    await visitAs('u-linh')
    expect(db.notifications.length).toBe(before)
  })

  it('reminds the owner once per due date, and again after the due date moves', async () => {
    const title = 'Việc sắp đến hạn: Viết bài giới thiệu thành viên mới'
    Object.assign(stored('t-intro-post'), { dueAt: fromNow(12), remindedFor: null })
    await visitAs('u-ha')
    await visitAs('u-ha')
    expect(await countTitle('u-ha', title)).toBe(1)
    expect((await taskRepository.get('c-guitar', 't-intro-post')).dueSoon).toBe(true)

    signInAs('u-linh')
    await taskRepository.update('c-guitar', 't-intro-post', { dueAt: fromNow(72), reason: 'Lùi lịch đăng bài.', version: stored('t-intro-post').version })
    expect((await taskRepository.get('c-guitar', 't-intro-post')).dueSoon).toBe(false)
    expect(await countTitle('u-ha', title)).toBe(1)

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 60 * HOUR_MS)
    await visitAs('u-ha')
    expect(await countTitle('u-ha', title)).toBe(2)
  })

  it('counts reminder days by calendar day, so one day means due by the end of tomorrow', async () => {
    Object.assign(stored('t-intro-post'), { dueAt: vnDayAt(1, 23), remindedFor: null })
    Object.assign(stored('t-teaser'), { dueAt: vnDayAt(2, 1), remindedFor: null })
    signInAs('u-linh')
    expect((await taskRepository.get('c-guitar', 't-intro-post')).dueSoon).toBe(true)
    expect((await taskRepository.get('c-guitar', 't-teaser')).dueSoon).toBe(false)
  })

  it('reminds only the owner, not collaborators, and nobody who left the club (BR-MEM-04)', async () => {
    Object.assign(stored('t-teaser'), { dueAt: fromNow(12), remindedFor: null })
    Object.assign(stored('t-intro-post'), { dueAt: fromNow(12), remindedFor: null })
    membershipOf('u-ha').status = 'LEFT'
    await visitAs('u-linh')
    expect(await countTitle('u-vy', 'Việc sắp đến hạn: Quay video teaser 30 giây')).toBe(1)
    expect(await countTitle('u-ha', 'Việc sắp đến hạn: Quay video teaser 30 giây')).toBe(0)
    expect(await countTitle('u-ha', 'Việc sắp đến hạn: Viết bài giới thiệu thành viên mới')).toBe(0)
  })

  it('stops reminding a collaborator from outside the club once they leave the subcommittee (BR-MEM-04)', async () => {
    const title = 'Việc sắp đến hạn: In vé mời Đêm nhạc Mùa đông'
    const staff = { userId: 'u-tu', eventId: 'e-winter', subcommitteeId: 'sc-winter-media', kind: 'COLLABORATOR' as const, joinedAt: fromNow(-48), leftAt: null as string | null }
    db.eventStaff.push(staff)
    Object.assign(stored('t-invite'), { ownerId: 'u-tu', dueAt: fromNow(12), remindedFor: null })
    staff.leftAt = fromNow(-1)
    await visitAs('u-linh')
    expect(await countTitle('u-tu', title)).toBe(0)

    // Cùng việc, người ngoài CLB còn trong tiểu ban thì vẫn được nhắc.
    Object.assign(stored('t-invite'), { dueAt: fromNow(13), remindedFor: null })
    staff.leftAt = null
    await visitAs('u-linh')
    expect(await countTitle('u-tu', title)).toBe(1)
  })

  it('treats the same moment written in another time zone as the same due date', async () => {
    const dueAt = fromNow(12)
    Object.assign(stored('t-intro-post'), { dueAt, remindedFor: new Date(Date.parse(dueAt)).toISOString() })
    await visitAs('u-ha')
    expect(await countTitle('u-ha', 'Việc sắp đến hạn: Viết bài giới thiệu thành viên mới')).toBe(0)
  })

  it('does not remind done or cancelled tasks whose due date is near', async () => {
    Object.assign(stored('t-old-banner'), { dueAt: fromNow(12), remindedFor: null })
    Object.assign(stored('t-photo-oct'), { dueAt: fromNow(12), remindedFor: null })
    const before = db.notifications.length
    await visitAs('u-linh')
    expect(db.notifications.length).toBe(before)
    expect((await taskRepository.get('c-guitar', 't-old-banner')).dueSoon).toBe(false)
    expect((await taskRepository.get('c-guitar', 't-photo-oct')).dueSoon).toBe(false)
  })

  it('does not send a reminder right after assigning a task that is already near its due date', async () => {
    signInAs('u-linh')
    const task = await taskRepository.create('c-guitar', {
      title: 'Gửi ảnh bìa bản cuối',
      description: '',
      scopeType: 'DEPARTMENT',
      scopeId: 'd-media',
      ownerId: 'u-vy',
      collaboratorIds: [],
      dueAt: fromNow(10),
      priority: 'HIGH',
    })
    expect(task.dueSoon).toBe(true)
    await visitAs('u-vy')
    expect(await countTitle('u-vy', 'Bạn được giao việc: Gửi ảnh bìa bản cuối')).toBe(1)
    expect(await countTitle('u-vy', 'Việc sắp đến hạn: Gửi ảnh bìa bản cuối')).toBe(0)
  })

  it('does not remind tasks of a closed event even when the due date is near', async () => {
    winter().status = 'CLOSED'
    Object.assign(stored('t-invite'), { dueAt: fromNow(12), remindedFor: null })
    const before = db.notifications.length
    await visitAs('u-linh')
    expect(db.notifications.length).toBe(before)
    signInAs('u-ha')
    expect((await taskRepository.listMine({ eventId: 'e-winter' })).content.find((task) => task.id === 't-invite')?.dueSoon).toBe(false)
  })

  it('does not remind again right after moving the due date into the reminder window', async () => {
    signInAs('u-linh')
    await taskRepository.update('c-guitar', 't-teaser', { dueAt: fromNow(10), reason: 'Cần video sớm hơn.', version: stored('t-teaser').version })
    await visitAs('u-vy')
    expect(await countTitle('u-vy', 'Việc sắp đến hạn: Quay video teaser 30 giây')).toBe(0)
    expect(await countTitle('u-vy', `Hạn việc Quay video teaser 30 giây đổi thành ${formatDateTime(stored('t-teaser').dueAt)}`)).toBe(1)
  })

  it('does not remind when the club sets zero days', async () => {
    guitar().taskReminderDays = 0
    Object.assign(stored('t-intro-post'), { dueAt: fromNow(12), remindedFor: null })
    await visitAs('u-ha')
    expect(await countTitle('u-ha', 'Việc sắp đến hạn: Viết bài giới thiệu thành viên mới')).toBe(0)
    expect((await taskRepository.get('c-guitar', 't-intro-post')).dueSoon).toBe(false)
  })
})

describe('overdue flag (FR-TASK-06, BR-TASK-03)', () => {
  it('flags once per due date, tells the owner and the assigner, and keeps the mark after the due date moves', async () => {
    const title = 'Việc quá hạn: Viết bài giới thiệu thành viên mới'
    const lateDue = fromNow(-1)
    Object.assign(stored('t-intro-post'), { dueAt: lateDue, remindedFor: lateDue, overdueLog: [] })
    await visitAs('u-ha')
    await visitAs('u-ha')
    expect(await countTitle('u-ha', title)).toBe(1)
    expect(await countTitle('u-linh', title)).toBe(1)

    signInAs('u-linh')
    const moved = await taskRepository.update('c-guitar', 't-intro-post', { dueAt: fromNow(120), reason: 'Chờ ảnh chân dung.', version: stored('t-intro-post').version })
    expect(moved.overdue).toBe(false)
    expect(moved.overdueHistory).toEqual([{ dueAt: lateDue, flaggedAt: expect.any(String) }])
  })

  it('tells only people still on the task when it goes overdue (BR-MEM-04)', async () => {
    const title = 'Việc quá hạn: Viết bài giới thiệu thành viên mới'
    const lateDue = fromNow(-1)
    Object.assign(stored('t-intro-post'), { dueAt: lateDue, remindedFor: lateDue, overdueLog: [] })
    membershipOf('u-ha').status = 'LEFT'
    await visitAs('u-linh')
    expect(await countTitle('u-linh', title)).toBe(1)
    expect(await countTitle('u-ha', title)).toBe(0)
    expect(stored('t-intro-post').overdueLog).toHaveLength(1)
  })

  it('does not flag tasks of a closed event either', async () => {
    winter().status = 'CLOSED'
    Object.assign(stored('t-invite'), { dueAt: fromNow(-5), overdueLog: [], remindedFor: null })
    await visitAs('u-linh')
    expect(stored('t-invite').overdueLog).toEqual([])
  })

  it('never flags or reminds finished tasks and tasks of a cancelled event, and hides those from my tasks', async () => {
    Object.assign(stored('t-old-banner'), { dueAt: fromNow(-5), overdueLog: [] })
    Object.assign(stored('t-photo-oct'), { dueAt: fromNow(-5), overdueLog: [] })
    winter().status = 'CANCELLED'
    Object.assign(stored('t-invite'), { dueAt: fromNow(-5), overdueLog: [], remindedFor: null })
    const before = db.notifications.length
    await visitAs('u-ha')
    expect(db.notifications.length).toBe(before)
    expect(stored('t-invite').overdueLog).toEqual([])
    expect(stored('t-photo-oct').overdueLog).toEqual([])
    expect(stored('t-old-banner').overdueLog).toEqual([])

    signInAs('u-ha')
    expect((await taskRepository.listMine({})).content.map((task) => task.id)).not.toContain('t-invite')
    const byEvent = await taskRepository.listMine({ eventId: 'e-winter' })
    expect(byEvent.content.find((task) => task.id === 't-invite')).toMatchObject({ overdue: false, dueSoon: false })
  })

  it('offers a club filter only when the club still has tasks on the list, and keeps the event filter for old ones', async () => {
    db.eventStaff.push({ userId: 'u-tu', eventId: 'e-winter', subcommitteeId: 'sc-winter-media', kind: 'COLLABORATOR', joinedAt: fromNow(-48), leftAt: null })
    stored('t-invite').ownerId = 'u-tu'
    winter().status = 'CANCELLED'
    signInAs('u-tu')
    const facets = await taskRepository.myFacets()
    expect(facets.clubs).toEqual([])
    expect(facets.events.map((item) => item.id)).toEqual(['e-winter'])
  })
})
