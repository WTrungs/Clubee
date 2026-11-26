import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { hasPosition, positionHolderOf } from '@/api/mocks/mockPermissions'
import { financeRepository } from '@/features/finance/model/financeRepository'
import { memberRepository } from '@/features/member/model/memberRepository'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { taskRepository } from '@/features/task/model/taskRepository'
import { signInAs } from '@/testUtils'
import { eventRepository } from '../model/eventRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const ENGLISH = 'ch-winter-english'
const coHostRecord = (id = ENGLISH) => {
  const found = db.eventCoHosts.find((coHost) => coHost.id === id)
  if (!found) throw new Error(`Thiếu ${id}`)
  return found
}
const titlesOf = async (userId: string) => {
  signInAs(userId)
  return (await notificationRepository.list({ category: 'EVENT', size: 100 })).content.map((notification) => notification.title)
}
const subcommitteeOf = async (subcommitteeId: string) => {
  const found = (await eventRepository.subcommittees('c-guitar', 'e-winter')).find((subcommittee) => subcommittee.id === subcommitteeId)
  if (!found) throw new Error(`Thiếu ${subcommitteeId}`)
  return found
}

/** u-tu là Chủ nhiệm CLB Tiếng Anh, nhận lời mời có sẵn trong seed. */
async function acceptEnglish() {
  signInAs('u-tu')
  return eventRepository.decideCoHost('c-english', ENGLISH, { decision: 'ACCEPT', note: null, version: coHostRecord().version })
}
async function addTam(subcommitteeId = 'sc-winter-logistics') {
  signInAs('u-bao')
  return eventRepository.addStaff('c-guitar', 'e-winter', subcommitteeId, 'u-tam', ENGLISH)
}
async function makeTamLogisticsLead() {
  await acceptEnglish()
  await addTam()
  signInAs('u-bao')
  return eventRepository.setSubcommitteeLead('c-guitar', 'e-winter', 'sc-winter-logistics', { userId: 'u-tam', reason: 'Cần người lo phần song ngữ.' })
}

describe('inviting a co-host club (FR-EVT-08, ST-COH)', () => {
  it('lets the event lead invite another club and tells that club board', async () => {
    signInAs('u-long')
    expect((await fail(eventRepository.inviteCoHost('c-guitar', 'e-winter', { clubId: 'c-volunteer', message: '' })))?.status).toBe(403)

    signInAs('u-bao')
    const created = await eventRepository.inviteCoHost('c-guitar', 'e-winter', { clubId: 'c-volunteer', message: 'Cùng làm góc tình nguyện nhé.' })
    expect(created).toMatchObject({ status: 'SENT', club: { id: 'c-volunteer' }, staffCount: 0, allowedActions: [] })
    expect((await eventRepository.coHosts('c-guitar', 'e-winter')).map((coHost) => coHost.club.id)).toEqual(['c-volunteer', 'c-english'])
    // u-tam là Chủ nhiệm Đội Tình nguyện Xanh.
    expect(await titlesOf('u-tam')).toContain('CLB Guitar Sinh viên mời CLB đồng tổ chức Đêm nhạc Mùa đông')
  })

  it('checks the club and refuses a second open invitation', async () => {
    signInAs('u-bao')
    const invite = (clubId: string) => fail(eventRepository.inviteCoHost('c-guitar', 'e-winter', { clubId, message: '' }))
    expect(await invite('c-guitar')).toMatchObject({ status: 400, fieldErrors: [{ field: 'clubId' }] })
    expect(await invite('c-none')).toMatchObject({ status: 400, fieldErrors: [{ field: 'clubId' }] })
    expect(await invite('c-english')).toMatchObject({ status: 409, code: 'CO_HOST_EXISTS' })
    expect(await fail(eventRepository.inviteCoHost('c-guitar', 'e-winter', { clubId: 'c-volunteer', message: 'x'.repeat(501) }))).toMatchObject({ status: 400 })
  })

  it('stops once the event is no longer running', async () => {
    const winter = db.events.find((event) => event.id === 'e-winter')
    if (!winter) throw new Error('Thiếu e-winter')
    winter.status = 'CLOSED'
    signInAs('u-anh')
    expect(await fail(eventRepository.inviteCoHost('c-guitar', 'e-winter', { clubId: 'c-volunteer', message: '' }))).toMatchObject({ status: 422, code: 'EVENT_READ_ONLY' })
  })
})

describe('answering an invitation (FR-EVT-08, ST-COH)', () => {
  it('shows invitations only to the invited club board, who accepts and tells the inviter', async () => {
    signInAs('u-ha')
    // Trưởng ban không thuộc ban chủ nhiệm.
    expect((await fail(eventRepository.coHostInvitations('c-english')))?.status).toBe(403)
    expect((await fail(eventRepository.decideCoHost('c-english', ENGLISH, { decision: 'ACCEPT', note: null, version: 1 })))?.status).toBe(404)

    signInAs('u-tu')
    const [invitation] = await eventRepository.coHostInvitations('c-english')
    expect(invitation).toMatchObject({ id: ENGLISH, status: 'SENT', event: { id: 'e-winter', clubName: 'CLB Guitar Sinh viên' }, allowedActions: ['ACCEPT', 'DECLINE'] })
    expect((await fail(eventRepository.decideCoHost('c-english', ENGLISH, { decision: 'ACCEPT', note: null, version: 0 })))?.status).toBe(409)
    const accepted = await acceptEnglish()
    expect(accepted).toMatchObject({ status: 'ACCEPTED', decidedBy: { id: 'u-tu' }, allowedActions: [] })
    expect(await titlesOf('u-bao')).toContain('CLB Tiếng Anh Giao tiếp nhận lời đồng tổ chức Đêm nhạc Mùa đông')
    expect((await fail(acceptEnglish()))?.code).toBe('CO_HOST_NOT_PENDING')
  })

  it('needs a reason to decline, and a declined invitation cannot be accepted later', async () => {
    signInAs('u-tu')
    expect(await fail(eventRepository.decideCoHost('c-english', ENGLISH, { decision: 'DECLINE', note: 'bận', version: 1 }))).toMatchObject({
      status: 400,
      fieldErrors: [{ field: 'note' }],
    })
    const declined = await eventRepository.decideCoHost('c-english', ENGLISH, { decision: 'DECLINE', note: 'Lịch học dày tháng này.', version: 1 })
    expect(declined).toMatchObject({ status: 'DECLINED', decisionNote: 'Lịch học dày tháng này.' })
    expect((await fail(acceptEnglish()))?.code).toBe('CO_HOST_NOT_PENDING')
    expect((await titlesOf('u-bao')).some((title) => title.includes('từ chối đồng tổ chức'))).toBe(true)
    // CLB chủ trì mời lần mới được.
    signInAs('u-bao')
    expect((await eventRepository.inviteCoHost('c-guitar', 'e-winter', { clubId: 'c-english', message: '' })).status).toBe('SENT')
  })
})

describe('staff from the co-host club (FR-EVT-08, BR-ORG-01)', () => {
  it('lists only members of the accepted club who are not in the host club, name and department only', async () => {
    signInAs('u-bao')
    expect(await fail(eventRepository.staffCandidates('c-guitar', 'e-winter', '', ENGLISH))).toMatchObject({ status: 422, code: 'CO_HOST_NOT_ACTIVE' })
    await acceptEnglish()
    signInAs('u-bao')
    const candidates = await eventRepository.staffCandidates('c-guitar', 'e-winter', '', ENGLISH)
    // u-ha, u-bao cũng ở CLB Guitar nên mời như thành viên.
    expect(candidates.map((candidate) => candidate.id).toSorted()).toEqual(['u-tam', 'u-tu'])
    expect(Object.keys(candidates[0] ?? {}).toSorted()).toEqual(['conflicts', 'departmentName', 'fullName', 'id'])
    expect((await subcommitteeOf('sc-winter-logistics')).allowedActions).toContain('ADD_CO_HOST_STAFF')

    signInAs('u-long')
    expect((await fail(eventRepository.staffCandidates('c-guitar', 'e-winter', '', ENGLISH)))?.status).toBe(403)
    expect((await fail(eventRepository.addStaff('c-guitar', 'e-winter', 'sc-winter-logistics', 'u-tam', ENGLISH)))?.status).toBe(403)
  })

  it('adds a co-host member with their home club, refuses outsiders and duplicates', async () => {
    await acceptEnglish()
    signInAs('u-bao')
    expect(await fail(eventRepository.addStaff('c-guitar', 'e-winter', 'sc-winter-logistics', 'u-ha', ENGLISH))).toMatchObject({ status: 400 })
    const updated = await addTam()
    expect(updated.members.find((member) => member.id === 'u-tam')).toMatchObject({ kind: 'CO_HOST', homeClubName: 'CLB Tiếng Anh Giao tiếp', departmentName: 'Nội dung' })
    expect((await fail(addTam()))?.status).toBe(409)
    expect(await titlesOf('u-tam')).toContain('Bạn được thêm vào tiểu ban Hậu cần (đồng tổ chức) của Đêm nhạc Mùa đông')

    signInAs('u-tam')
    expect((await eventRepository.get('c-guitar', 'e-winter')).allowedActions).toContain('VIEW_STAFF')
    // BR-SEC-01: ngoài sự kiện chung, không đọc được dữ liệu CLB chủ trì.
    expect((await fail(memberRepository.list('c-guitar', {})))?.status).toBe(403)
    expect((await fail(financeRepository.fund('c-guitar', 'fund-c-guitar')))?.status).toBeGreaterThanOrEqual(403)
  })
})

describe('changing a subcommittee lead (FR-EVT-08, BR-ORG-01, BR-ORG-04)', () => {
  it('replaces the lead with a reason and lets a co-host lead assign tasks in that subcommittee', async () => {
    await acceptEnglish()
    await addTam()
    signInAs('u-long')
    expect((await fail(eventRepository.setSubcommitteeLead('c-guitar', 'e-winter', 'sc-winter-logistics', { userId: 'u-khoa', reason: null })))?.status).toBe(403)
    signInAs('u-bao')
    expect(await fail(eventRepository.setSubcommitteeLead('c-guitar', 'e-winter', 'sc-winter-logistics', { userId: 'u-tam', reason: null }))).toMatchObject({
      status: 400,
      fieldErrors: [{ field: 'reason' }],
    })
    expect(await fail(eventRepository.setSubcommitteeLead('c-guitar', 'e-winter', 'sc-winter-logistics', { userId: 'u-linh', reason: 'Đổi người phụ trách.' }))).toMatchObject({
      status: 400,
      fieldErrors: [{ field: 'userId' }],
    })
    const updated = await eventRepository.setSubcommitteeLead('c-guitar', 'e-winter', 'sc-winter-logistics', { userId: 'u-tam', reason: 'Cần người lo phần song ngữ.' })
    expect(updated.lead).toMatchObject({ id: 'u-tam', kind: 'CO_HOST' })
    expect(updated.members.map((member) => member.id)).toContain('u-long')
    expect(hasPosition('u-long', 'SUBCOMMITTEE_LEAD', 'sc-winter-logistics')).toBe(false)
    expect(await titlesOf('u-long')).toContain('Bạn thôi làm Trưởng tiểu ban Hậu cần của Đêm nhạc Mùa đông')

    signInAs('u-tam')
    const task = await taskRepository.create('c-guitar', {
      title: 'Dịch kịch bản sang tiếng Anh',
      description: '',
      scopeType: 'SUBCOMMITTEE',
      scopeId: 'sc-winter-logistics',
      ownerId: 'u-khoa',
      collaboratorIds: [],
      dueAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      priority: 'MEDIUM',
    })
    expect(task.assigner.id).toBe('u-tam')
  })

  it('refuses a collaborator and someone already leading another subcommittee', async () => {
    signInAs('u-bao')
    await eventRepository.addCollaborator('c-guitar', 'e-winter', 'sc-winter-program', 'tu.chau@demo.test')
    expect(await fail(eventRepository.setSubcommitteeLead('c-guitar', 'e-winter', 'sc-winter-program', { userId: 'u-tu', reason: 'Đổi người phụ trách.' }))).toMatchObject({
      status: 422,
      code: 'LEAD_NOT_ELIGIBLE',
    })
    await eventRepository.addStaff('c-guitar', 'e-winter', 'sc-winter-program', 'u-linh')
    expect(await fail(eventRepository.setSubcommitteeLead('c-guitar', 'e-winter', 'sc-winter-program', { userId: 'u-linh', reason: 'Đổi người phụ trách.' }))).toMatchObject({
      status: 422,
      code: 'LEAD_TAKEN',
    })
    expect(positionHolderOf('SUBCOMMITTEE_LEAD', 'sc-winter-program')).toBe('u-nam')
  })
})

describe('removing a co-host club (FR-EVT-08, ST-COH)', () => {
  it('ends that club staff at once, keeps their tasks, and tells both sides', async () => {
    await makeTamLogisticsLead()
    signInAs('u-tam')
    const task = await taskRepository.create('c-guitar', {
      title: 'Chuẩn bị bảng tên song ngữ',
      description: '',
      scopeType: 'SUBCOMMITTEE',
      scopeId: 'sc-winter-logistics',
      ownerId: 'u-tam',
      collaboratorIds: [],
      dueAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      priority: 'LOW',
    })

    signInAs('u-bao')
    const [english] = await eventRepository.coHosts('c-guitar', 'e-winter')
    expect(english).toMatchObject({ status: 'ACCEPTED', staffCount: 1, allowedActions: ['REMOVE'] })
    const remove = (reason: string, version = coHostRecord().version) => eventRepository.removeCoHost('c-guitar', 'e-winter', ENGLISH, { reason, version })
    expect((await fail(remove('Đổi kế hoạch.', 0)))?.status).toBe(409)
    expect(await fail(remove('ngắn'))).toMatchObject({ status: 400, fieldErrors: [{ field: 'reason' }] })
    const removed = await remove('Đổi kế hoạch chương trình.')
    expect(removed).toMatchObject({ status: 'REMOVED', removeReason: 'Đổi kế hoạch chương trình.', staffCount: 0 })
    expect((await fail(remove('Gỡ lần nữa cho chắc.')))?.code).toBe('CO_HOST_NOT_ACTIVE')
    expect((await subcommitteeOf('sc-winter-logistics')).lead).toBeNull()
    expect(db.tasks.some((candidate) => candidate.id === task.id)).toBe(true)

    expect(await titlesOf('u-tu')).toContain('CLB Tiếng Anh Giao tiếp không còn đồng tổ chức Đêm nhạc Mùa đông')
    expect(await titlesOf('u-tam')).toContain('Bạn thôi làm nhân sự Đêm nhạc Mùa đông')
    signInAs('u-tam')
    expect((await fail(eventRepository.get('c-guitar', 'e-winter')))?.status).toBe(404)
  })
})

describe('choosing a lead when the holder is on leave (BR-ORG-04, BR-MEM-05)', () => {
  const setStatus = (userId: string, clubId: string, status: 'ON_LEAVE' | 'ACTIVE') => {
    const membership = db.memberships.find((candidate) => candidate.userId === userId && candidate.clubId === clubId && candidate.status !== 'LEFT')
    if (!membership) throw new Error(`Thiếu tư cách ${userId}`)
    membership.status = status
  }

  it('ends the post of a lead on leave, so the subcommittee still has one lead when they come back', async () => {
    setStatus('u-long', 'c-guitar', 'ON_LEAVE')
    signInAs('u-bao')
    expect((await subcommitteeOf('sc-winter-logistics')).lead).toBeNull()
    await eventRepository.setSubcommitteeLead('c-guitar', 'e-winter', 'sc-winter-logistics', { userId: 'u-khoa', reason: null })
    setStatus('u-long', 'c-guitar', 'ACTIVE')
    expect(positionHolderOf('SUBCOMMITTEE_LEAD', 'sc-winter-logistics')).toBe('u-khoa')
    expect(hasPosition('u-long', 'SUBCOMMITTEE_LEAD', 'sc-winter-logistics')).toBe(false)
    expect(await titlesOf('u-long')).toContain('Bạn thôi làm Trưởng tiểu ban Hậu cần của Đêm nhạc Mùa đông')
  })

  it('refuses a co-host member who is on leave in their home club', async () => {
    await acceptEnglish()
    await addTam()
    setStatus('u-tam', 'c-english', 'ON_LEAVE')
    signInAs('u-bao')
    expect(await fail(eventRepository.setSubcommitteeLead('c-guitar', 'e-winter', 'sc-winter-logistics', { userId: 'u-tam', reason: null }))).toMatchObject({
      status: 422,
      code: 'LEAD_NOT_ELIGIBLE',
    })
  })
})
