import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { positionHolderOf } from '@/api/mocks/mockPermissions'
import { vnDate } from '@/api/mocks/mockTime'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { taskRepository } from '@/features/task/model/taskRepository'
import { termRepository } from '@/features/term/model/termRepository'
import { signInAs } from '@/testUtils'
import type { BacklogItem, BacklogKind } from '../model/backlogTypes'
import { memberRepository } from '../model/memberRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const membershipId = (userId: string) => `m-guitar-${userId.slice(2)}`
const versionOf = (id: string) => db.memberships.find((membership) => membership.id === id)?.version ?? 0
const membership = (userId: string) => {
  const found = db.memberships.find((candidate) => candidate.id === membershipId(userId))
  if (!found) throw new Error(`Thiếu tư cách seed của ${userId}`)
  return found
}

/** Chủ nhiệm u-anh đưa một người ra khỏi CLB (FR-MEM-08), rồi đọc tồn đọng chưa xử lý của người đó. */
async function remove(userId: string): Promise<BacklogItem[]> {
  signInAs('u-anh')
  const id = membershipId(userId)
  await memberRepository.transition('c-guitar', id, { action: 'REMOVE', reason: 'Vi phạm nội quy nhiều lần.', version: versionOf(id) })
  return (await memberRepository.backlog('c-guitar', { status: 'OPEN', formerMemberId: userId })).content
}

const itemOf = (items: BacklogItem[], kind: BacklogKind, title?: string) => {
  const found = items.find((item) => item.kind === kind && (title === undefined || item.title === title))
  if (!found) throw new Error(`Thiếu mục ${kind} ${title ?? ''}`)
  return found
}
const resolve = (item: BacklogItem, request: { action: BacklogItem['allowedActions'][number]; userId?: string; reason?: string }) =>
  memberRepository.resolveBacklog('c-guitar', item.id, { ...request, version: item.version })

describe('backlog list (FR-MEM-09)', () => {
  it('lists what a removed member left, for the board only', async () => {
    const items = await remove('u-long')
    expect(items.map((item) => [item.kind, item.title]).toSorted()).toEqual([
      ['POSITION', 'Trưởng ban Hậu cần'],
      ['POSITION', 'Trưởng tiểu ban Hậu cần'],
      ['TASK', 'Chuẩn bị âm thanh phòng tập'],
      ['TASK_REVIEW', 'Mượn loa từ CLB bạn'],
    ])
    expect(itemOf(items, 'TASK').allowedActions).toEqual(['REASSIGN'])
    expect(itemOf(items, 'POSITION', 'Trưởng ban Hậu cần').allowedActions).toEqual(['APPOINT', 'DISMISS'])
    expect(itemOf(items, 'TASK_REVIEW').task).toMatchObject({ scopeName: 'Ban Hậu cần', counterpart: { id: 'u-khoa' }, overdue: true })

    signInAs('u-ha')
    expect((await fail(memberRepository.backlog('c-guitar', {})))?.status).toBe(403)
    expect((await fail(memberRepository.backlogCandidates('c-guitar', items[0]?.id ?? '')))?.status).toBe(403)
  })

  it('resolves an item on its own once the task is done, and the profile count follows', async () => {
    const items = await remove('u-long')
    const task = db.tasks.find((candidate) => candidate.id === 't-sound')
    if (task) task.status = 'DONE'
    const fresh = (await memberRepository.backlog('c-guitar', { formerMemberId: 'u-long' })).content
    expect(itemOf(fresh, 'TASK')).toMatchObject({ status: 'RESOLVED', resolvedNote: 'Việc đã hoàn thành.', resolution: null, allowedActions: [] })
    expect((await memberRepository.get('c-guitar', membershipId('u-long'))).backlogCount).toBe(items.length - 1)
    expect(await fail(resolve(itemOf(fresh, 'TASK'), { action: 'REASSIGN', userId: 'u-tram' }))).toMatchObject({ status: 422, code: 'BACKLOG_RESOLVED' })
  })
})

describe('resolving backlog items (FR-MEM-09, BR-MEM-05, BR-ORG-01, BR-ORG-04)', () => {
  it('reassigns an open task only to a working member of its scope, with history and a notification', async () => {
    const items = await remove('u-long')
    const task = itemOf(items, 'TASK')
    membership('u-khoa').status = 'ON_LEAVE'
    expect((await memberRepository.backlogCandidates('c-guitar', task.id)).map((candidate) => candidate.id)).not.toContain('u-khoa')
    const onLeave = await fail(resolve(task, { action: 'REASSIGN', userId: 'u-khoa' }))
    expect(onLeave?.fieldErrors.map((fieldError) => fieldError.field)).toEqual(['userId'])

    const saved = await resolve(task, { action: 'REASSIGN', userId: 'u-tram' })
    expect(saved).toMatchObject({ status: 'RESOLVED', resolution: { action: 'REASSIGN', person: { id: 'u-tram' }, by: { id: 'u-anh' } } })
    const detail = await taskRepository.get('c-guitar', 't-sound')
    expect(detail.owner.id).toBe('u-tram')
    // Lần đổi người ghi họ tên lúc đổi và lý do, trạng thái việc giữ nguyên (FR-TASK-05).
    expect(detail.status).toBe('IN_PROGRESS')
    expect(detail.changes[0]).toMatchObject({ actor: { id: 'u-anh' }, field: 'OWNER', fromPeople: ['Bùi Đức Long'], toPeople: ['Ngô Bảo Trâm'], reason: 'Bùi Đức Long đã rời CLB.' })
    signInAs('u-tram')
    expect((await notificationRepository.list({ category: 'TASK' })).content[0]?.title).toBe('Bạn được giao lại việc Chuẩn bị âm thanh phòng tập')
  })

  it('drops the new owner from the collaborators, so nobody is both (FR-TASK-01)', async () => {
    const items = await remove('u-khoa')
    const speaker = itemOf(items, 'TASK', 'Mượn loa từ CLB bạn')
    expect(db.tasks.find((task) => task.id === 't-speaker')?.collaboratorIds).toContain('u-tram')
    await resolve(speaker, { action: 'REASSIGN', userId: 'u-tram' })
    expect(db.tasks.find((task) => task.id === 't-speaker')).toMatchObject({ ownerId: 'u-tram', collaboratorIds: [] })
    expect(db.tasks.find((task) => task.id === 't-speaker')?.changes.map((change) => change.field)).toEqual(['OWNER', 'COLLABORATORS'])
  })

  it('needs a new owner and a new reviewer for a task the removed member gave to themselves (BR-TASK-02)', async () => {
    const sound = db.tasks.find((task) => task.id === 't-sound')
    if (sound) sound.assignerId = 'u-long'
    const items = await remove('u-long')
    expect(items.filter((item) => item.title === 'Chuẩn bị âm thanh phòng tập').map((item) => item.kind).toSorted()).toEqual(['TASK', 'TASK_REVIEW'])
    await resolve(itemOf(items, 'TASK', 'Chuẩn bị âm thanh phòng tập'), { action: 'REASSIGN', userId: 'u-tram' })
    const open = (await memberRepository.backlog('c-guitar', { status: 'OPEN', formerMemberId: 'u-long' })).content
    expect(itemOf(open, 'TASK_REVIEW', 'Chuẩn bị âm thanh phòng tập').allowedActions).toEqual(['REASSIGN'])
  })

  it('treats subcommittee tasks of a cancelled event as read-only, so they need no handover', async () => {
    const items = await remove('u-khoa')
    const lights = items.find((item) => item.kind === 'TASK' && item.task?.eventName === 'Đêm nhạc Mùa đông')
    if (!lights) throw new Error('Thiếu việc của tiểu ban')
    const winter = db.events.find((event) => event.id === 'e-winter')
    if (winter) winter.status = 'CANCELLED'
    const fresh = (await memberRepository.backlog('c-guitar', { formerMemberId: 'u-khoa' })).content.find((item) => item.id === lights.id)
    expect(fresh).toMatchObject({ status: 'RESOLVED', resolvedNote: 'Sự kiện đã hủy nên việc chỉ còn để tra cứu.', allowedActions: [] })
  })

  it('hands the review to someone who manages the scope', async () => {
    const items = await remove('u-long')
    const review = itemOf(items, 'TASK_REVIEW')
    expect((await fail(resolve(review, { action: 'REASSIGN', userId: 'u-ha' })))?.status).toBe(400)
    await resolve(review, { action: 'REASSIGN', userId: 'u-mai' })
    expect(db.tasks.find((task) => task.id === 't-speaker')?.assignerId).toBe('u-mai')
  })

  it('appoints a standing position only to an active member of that department (BR-ORG-01)', async () => {
    const items = await remove('u-long')
    const head = itemOf(items, 'POSITION', 'Trưởng ban Hậu cần')
    expect((await fail(resolve(head, { action: 'APPOINT', userId: 'u-ha' })))?.status).toBe(400)
    expect((await fail(resolve(head, { action: 'APPOINT', userId: 'u-tram' })))?.status).toBe(400)
    await resolve(head, { action: 'APPOINT', userId: 'u-khoa' })
    expect(positionHolderOf('DEPARTMENT_HEAD', 'd-logistics')).toBe('u-khoa')
  })

  it('refuses standing appointments during a handover, and presidency ones from a treasurer', async () => {
    const items = await remove('u-long')
    const head = itemOf(items, 'POSITION', 'Trưởng ban Hậu cần')
    const next = await termRepository.create('c-guitar', { name: 'Nhiệm kỳ 2027–2028', startOn: vnDate(301), endOn: vnDate(665) })
    await termRepository.startHandover('c-guitar', { fromTermId: 't-guitar-2026', toTermId: next.id })
    const during = (await memberRepository.backlog('c-guitar', { status: 'OPEN', formerMemberId: 'u-long' })).content
    const blocked = itemOf(during, 'POSITION', 'Trưởng ban Hậu cần')
    expect(blocked.allowedActions).toEqual(['DISMISS'])
    expect(blocked.appointBlockedReason).toMatch(/^CLB đang bàn giao nhiệm kỳ/)
    expect(await fail(resolve(head, { action: 'APPOINT', userId: 'u-khoa' }))).toMatchObject({ status: 422, code: 'HANDOVER_IN_PROGRESS' })
  })

  it('refuses standing appointments while the term is overdue (quyết định 14/11)', async () => {
    const items = await remove('u-long')
    const term = db.terms.find((candidate) => candidate.id === 't-guitar-2026')
    if (!term) throw new Error('Thiếu nhiệm kỳ seed')
    const oldEnd = term.endOn
    term.endOn = vnDate(-1)
    for (const position of db.positions) if (position.clubId === 'c-guitar' && position.endOn === oldEnd) position.endOn = vnDate(-1)
    const head = itemOf(items, 'POSITION', 'Trưởng ban Hậu cần')
    expect(await fail(resolve(head, { action: 'APPOINT', userId: 'u-khoa' }))).toMatchObject({ status: 422, code: 'TERM_OVERDUE' })
    // Chức vụ sự kiện không phụ thuộc nhiệm kỳ nên vẫn chỉ định được.
    await resolve(itemOf(items, 'POSITION', 'Trưởng tiểu ban Hậu cần'), { action: 'APPOINT', userId: 'u-tram' })
  })

  it('lets only the president or vice president replace a vice president', async () => {
    const items = await remove('u-huy')
    const vice = itemOf(items, 'POSITION', 'Phó chủ nhiệm')
    signInAs('u-mai')
    const asTreasurer = (await memberRepository.backlog('c-guitar', { status: 'OPEN', formerMemberId: 'u-huy' })).content
    expect(itemOf(asTreasurer, 'POSITION', 'Phó chủ nhiệm').allowedActions).toEqual(['DISMISS'])
    expect(await fail(resolve(vice, { action: 'APPOINT', userId: 'u-son' }))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    signInAs('u-anh')
    await resolve(vice, { action: 'APPOINT', userId: 'u-son' })
    expect(positionHolderOf('VICE_PRESIDENT', 'c-guitar')).toBe('u-son')
  })

  it('appoints event roles: one subcommittee lead per person (BR-ORG-04), and a new event lead', async () => {
    const items = await remove('u-long')
    const lead = itemOf(items, 'POSITION', 'Trưởng tiểu ban Hậu cần')
    expect(await fail(resolve(lead, { action: 'APPOINT', userId: 'u-linh' }))).toMatchObject({ status: 422, code: 'LEAD_TAKEN' })
    await resolve(lead, { action: 'APPOINT', userId: 'u-tram' })
    expect(positionHolderOf('SUBCOMMITTEE_LEAD', 'sc-winter-logistics')).toBe('u-tram')
    expect(db.eventStaff.some((staff) => staff.subcommitteeId === 'sc-winter-logistics' && staff.userId === 'u-tram' && staff.leftAt === null)).toBe(true)

    const kiet = await remove('u-kiet')
    const eventLead = itemOf(kiet, 'POSITION', 'Trưởng BTC')
    expect(eventLead.position).toMatchObject({ role: 'EVENT_LEAD', scopeName: 'Livestream hướng dẫn bấm hợp âm' })
    await resolve(eventLead, { action: 'APPOINT', userId: 'u-son' })
    expect(positionHolderOf('EVENT_LEAD', 'e-livestream')).toBe('u-son')
  })

  it('dismisses a position with a reason, and guards the version (NFR-REL-03)', async () => {
    const items = await remove('u-long')
    const lead = itemOf(items, 'POSITION', 'Trưởng tiểu ban Hậu cần')
    expect(await fail(resolve(lead, { action: 'DISMISS', reason: 'ok' }))).toMatchObject({ status: 400 })
    expect(await fail(resolve(itemOf(items, 'TASK'), { action: 'DISMISS', reason: 'Không cần làm nữa.' }))).toMatchObject({ status: 400 })
    await resolve(lead, { action: 'DISMISS', reason: 'Tiểu ban gộp vào Truyền thông.' })
    expect(await fail(resolve(lead, { action: 'DISMISS', reason: 'Tiểu ban gộp vào Truyền thông.' }))).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' })
    const resolved = (await memberRepository.backlog('c-guitar', { status: 'RESOLVED', formerMemberId: 'u-long' })).content
    expect(itemOf(resolved, 'POSITION', 'Trưởng tiểu ban Hậu cần').resolution).toMatchObject({ action: 'DISMISS', person: null, reason: 'Tiểu ban gộp vào Truyền thông.' })
    expect((await memberRepository.get('c-guitar', membershipId('u-long'))).backlogCount).toBe(3)
  })
})
