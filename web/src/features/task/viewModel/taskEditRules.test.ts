import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { signInAs } from '@/testUtils'
import { taskRepository } from '../model/taskRepository'
import type { UpdateTaskRequest } from '../model/taskTypes'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const stored = (id: string) => {
  const task = db.tasks.find((candidate) => candidate.id === id)
  if (!task) throw new Error(`Thiếu việc ${id}`)
  return task
}
const update = (id: string, changes: Omit<UpdateTaskRequest, 'version'> & { version?: number }) =>
  taskRepository.update('c-guitar', id, { version: stored(id).version, ...changes })
const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
const titlesFor = async (userId: string) => {
  signInAs(userId)
  return (await notificationRepository.list({ category: 'TASK' })).content.map((notification) => notification.title)
}
const membership = (userId: string) => {
  const found = db.memberships.find((candidate) => candidate.clubId === 'c-guitar' && candidate.userId === userId && candidate.status !== 'LEFT')
  if (!found) throw new Error(`Thiếu tư cách ${userId}`)
  return found
}

describe('changing who works on a task and its due date (FR-TASK-05)', () => {
  it('lets only the assigner change or cancel a task, and leaves the task untouched otherwise (NFR-SEC-03)', async () => {
    const before = { ...stored('t-intro-post') }
    signInAs('u-ha')
    expect((await taskRepository.get('c-guitar', 't-intro-post')).allowedActions).toEqual(['START'])
    expect(await fail(update('t-intro-post', { dueAt: inDays(9), reason: 'Em cần thêm thời gian.' }))).toMatchObject({
      status: 403,
      detail: 'Chỉ người giao việc được đổi người, đổi hạn hoặc hủy việc.',
    })
    const cancel = await fail(taskRepository.transition('c-guitar', 't-intro-post', { action: 'CANCEL', version: 1, reason: 'Không cần nữa.' }))
    expect(cancel).toMatchObject({ status: 403, detail: 'Chỉ người giao việc được hủy việc.' })
    // Quyền được kiểm trước version và trạng thái.
    expect(await fail(taskRepository.transition('c-guitar', 't-intro-post', { action: 'CANCEL', version: 0, reason: 'Không cần nữa.' }))).toMatchObject({ status: 403 })
    expect(await fail(taskRepository.transition('c-guitar', 't-photo-oct', { action: 'CANCEL', version: 1, reason: 'Không cần nữa.' }))).toMatchObject({ status: 403 })
    expect(stored('t-intro-post')).toMatchObject({ ownerId: 'u-ha', status: 'ASSIGNED', dueAt: before.dueAt, version: 1, changes: [], cancelReason: null })

    signInAs('u-linh')
    expect((await taskRepository.get('c-guitar', 't-intro-post')).allowedActions).toEqual(['CANCEL', 'REASSIGN', 'CHANGE_DUE'])
  })

  it('moves the due date, keeps the status and tells the people on the task', async () => {
    signInAs('u-linh')
    const before = stored('t-teaser').dueAt
    const next = inDays(10)
    const saved = await update('t-teaser', { dueAt: next, reason: 'Phòng tập bận tuần này.' })
    expect(saved).toMatchObject({ status: 'ASSIGNED', version: 2, dueAt: next })
    expect(saved.changes[0]).toMatchObject({ field: 'DUE_AT', fromDueAt: before, toDueAt: next, reason: 'Phòng tập bận tuần này.', actor: { id: 'u-linh' } })
    expect((await titlesFor('u-vy'))[0]).toMatch(/^Hạn việc Quay video teaser 30 giây đổi thành \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
    expect((await titlesFor('u-ha'))[0]).toMatch(/^Hạn việc Quay video teaser/)
  })

  it('hands the task to someone else in the scope, recording names and telling each person once', async () => {
    signInAs('u-linh')
    const saved = await update('t-intro-post', { ownerId: 'u-vy', collaboratorIds: ['u-ha'], reason: 'Hà đang làm poster.' })
    expect(saved).toMatchObject({ owner: { id: 'u-vy' }, collaborators: [{ id: 'u-ha' }], status: 'ASSIGNED' })
    expect(saved.changes.map((change) => change.field)).toEqual(['COLLABORATORS', 'OWNER'])
    expect(saved.changes[1]).toMatchObject({ fromPeople: ['Lê Thu Hà'], toPeople: ['Hoàng Thảo Vy'] })
    expect((await titlesFor('u-vy'))[0]).toBe('Bạn được giao việc: Viết bài giới thiệu thành viên mới')
    // Người chính cũ vẫn phối hợp nên chỉ nhận thông báo được thêm phối hợp.
    const ha = await titlesFor('u-ha')
    expect(ha[0]).toBe('Bạn được thêm phối hợp việc: Viết bài giới thiệu thành viên mới')
    expect(ha).not.toContain('Bạn không còn là người chính của việc: Viết bài giới thiệu thành viên mới')
    signInAs('u-vy')
    expect((await taskRepository.listMine({})).content.map((task) => task.id)).toContain('t-intro-post')
  })

  it('rejects people outside the scope, overlaps, past dates, short reasons and no-op saves (BR-TASK-01, BR-MEM-05)', async () => {
    signInAs('u-linh')
    const fields = async (changes: Omit<UpdateTaskRequest, 'version'>) => (await fail(update('t-intro-post', changes)))?.fieldErrors.map((error) => error.field)
    expect(await fields({ ownerId: 'u-yen', reason: 'Đổi người làm.' })).toEqual(['ownerId'])
    expect(await fields({ ownerId: 'u-bao', reason: 'Đổi người làm.' })).toEqual(['ownerId'])
    expect(await fields({ ownerId: 'u-vy', collaboratorIds: ['u-vy'], reason: 'Đổi người làm.' })).toEqual(['collaboratorIds'])
    expect(await fields({ dueAt: inDays(-1), reason: 'Đổi hạn.' })).toEqual(['dueAt'])
    expect(await fields({ dueAt: inDays(9), reason: 'Gấp' })).toEqual(['reason'])
    expect(await fail(update('t-intro-post', { ownerId: 'u-ha', dueAt: stored('t-intro-post').dueAt, reason: 'Không đổi gì.' }))).toMatchObject({
      status: 400,
      detail: 'Chưa có thay đổi nào để lưu.',
    })
    expect(stored('t-intro-post')).toMatchObject({ ownerId: 'u-ha', version: 1, changes: [] })
  })

  it('keeps a collaborator who went on leave but does not add new ones out of scope', async () => {
    membership('u-ha').status = 'ON_LEAVE'
    signInAs('u-linh')
    const saved = await update('t-teaser', { ownerId: 'u-linh', collaboratorIds: ['u-ha'], reason: 'Vy bận thi.' })
    expect(saved.collaborators.map((person) => person.id)).toEqual(['u-ha'])
    const error = await fail(update('t-teaser', { collaboratorIds: ['u-ha', 'u-yen'], reason: 'Thêm người.' }))
    expect(error?.fieldErrors.map((fieldError) => fieldError.field)).toEqual(['collaboratorIds'])
  })

  it('checks permission, then version, then status', async () => {
    // Trưởng ban mất quyền giao việc theo ma trận: không đổi người được, vẫn đổi hạn và hủy được.
    db.permissionOverrides.push({ clubId: 'c-guitar', role: 'DEPARTMENT_HEAD', permission: 'ASSIGN_TASK', enabled: false, updatedBy: 'u-anh', updatedAt: '2026-11-16T10:00:00+07:00' })
    signInAs('u-linh')
    expect((await taskRepository.get('c-guitar', 't-intro-post')).allowedActions).toEqual(['CANCEL', 'CHANGE_DUE'])
    expect(await fail(update('t-intro-post', { ownerId: 'u-vy', reason: 'Đổi người.', version: 0 }))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    expect(stored('t-intro-post')).toMatchObject({ ownerId: 'u-ha', version: 1, changes: [] })
    expect(await fail(update('t-intro-post', { dueAt: inDays(9), reason: 'Đổi hạn.', version: 0 }))).toMatchObject({ status: 409 })
    expect((await update('t-intro-post', { dueAt: inDays(9), reason: 'Đổi hạn.' })).version).toBe(2)
    const cancelled = await taskRepository.transition('c-guitar', 't-subtitle', { action: 'CANCEL', version: stored('t-subtitle').version, reason: 'Clip không dùng nữa.' })
    expect(cancelled.status).toBe('CANCELLED')
    db.permissionOverrides.length = 0

    expect(await fail(update('t-photo-oct', { dueAt: inDays(9), reason: 'Mở lại.' }))).toMatchObject({ status: 422, code: 'TASK_CLOSED' })
    const media = db.departments.find((department) => department.id === 'd-media')
    if (media) media.status = 'CLOSED'
    expect((await taskRepository.get('c-guitar', 't-teaser')).allowedActions).toEqual(['CANCEL', 'CHANGE_DUE'])
    expect(await fail(update('t-teaser', { ownerId: 'u-ha', reason: 'Đổi người.' }))).toMatchObject({ status: 422, code: 'SCOPE_CLOSED' })
  })

  it('cannot touch tasks of a closed event (FR-EVT-16)', async () => {
    const event = db.events.find((candidate) => candidate.id === 'e-winter')
    if (event) event.status = 'CLOSED'
    signInAs('u-linh')
    expect(await fail(update('t-invite', { dueAt: inDays(9), reason: 'Đổi hạn.' }))).toMatchObject({ status: 422, code: 'EVENT_READ_ONLY' })
    const cancel = await fail(taskRepository.transition('c-guitar', 't-invite', { action: 'CANCEL', version: 1, reason: 'Không cần nữa.' }))
    expect(cancel).toMatchObject({ status: 422, code: 'EVENT_READ_ONLY' })
  })

  it('tells a dropped collaborator and a former owner who is no longer on the task', async () => {
    signInAs('u-linh')
    await update('t-poster', { ownerId: 'u-linh', collaboratorIds: [], reason: 'Chị tự làm cho kịp.' })
    expect((await titlesFor('u-ha'))[0]).toBe('Bạn không còn là người chính của việc: Thiết kế poster Đêm nhạc Mùa đông')
    expect((await titlesFor('u-vy'))[0]).toBe('Bạn không còn phối hợp việc: Thiết kế poster Đêm nhạc Mùa đông')
  })
})

describe('cancelling a task (FR-TASK-05, ST-TASK)', () => {
  it.each([
    ['t-intro-post', 'ASSIGNED'],
    ['t-poster', 'IN_PROGRESS'],
    ['t-cover', 'PENDING_REVIEW'],
  ] as const)('cancels %s from %s with a reason', async (id, from) => {
    signInAs('u-linh')
    expect(stored(id).status).toBe(from)
    expect(await fail(taskRepository.transition('c-guitar', id, { action: 'CANCEL', version: stored(id).version }))).toMatchObject({
      status: 400,
      fieldErrors: [{ field: 'reason' }],
    })
    const saved = await taskRepository.transition('c-guitar', id, { action: 'CANCEL', version: stored(id).version, reason: 'Đổi kế hoạch truyền thông.' })
    expect(saved).toMatchObject({ status: 'CANCELLED', cancelReason: 'Đổi kế hoạch truyền thông.', allowedActions: [], overdue: false })
    expect(saved.history[0]).toMatchObject({ fromStatus: from, toStatus: 'CANCELLED', note: 'Đổi kế hoạch truyền thông.' })
  })

  it('tells the owner and collaborators, and never cancels a finished task', async () => {
    signInAs('u-linh')
    await taskRepository.transition('c-guitar', 't-poster', { action: 'CANCEL', version: 1, reason: 'Đổi kế hoạch truyền thông.' })
    expect((await titlesFor('u-ha'))[0]).toBe('Việc đã bị hủy: Thiết kế poster Đêm nhạc Mùa đông')
    expect((await titlesFor('u-vy'))[0]).toBe('Việc đã bị hủy: Thiết kế poster Đêm nhạc Mùa đông')
    signInAs('u-linh')
    expect(await fail(taskRepository.transition('c-guitar', 't-photo-oct', { action: 'CANCEL', version: 1, reason: 'Không cần.' }))).toMatchObject({ status: 422 })
  })
})
