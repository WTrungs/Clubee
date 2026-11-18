import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { clubRepository } from '@/features/club/model/clubRepository'
import { financeRepository } from '@/features/finance/model/financeRepository'
import { memberRepository } from '@/features/member/model/memberRepository'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { orgRepository } from '@/features/org/model/orgRepository'
import { taskRepository } from '@/features/task/model/taskRepository'
import { signInAs } from '@/testUtils'
import { eventRepository } from '../model/eventRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const TAM = 'tam.duong@demo.test'

const addCollaborator = (actorId: string, email: string, subcommitteeId = 'sc-winter-logistics') => {
  signInAs(actorId)
  return eventRepository.addCollaborator('c-guitar', 'e-winter', subcommitteeId, email)
}
const staffRows = (userId: string) => db.eventStaff.filter((staff) => staff.userId === userId && staff.eventId === 'e-winter' && staff.leftAt === null)
const winter = () => {
  const event = db.events.find((candidate) => candidate.id === 'e-winter')
  if (!event) throw new Error('Thiếu e-winter')
  return event
}

describe('adding a collaborator (FR-EVT-07, BR-ORG-01)', () => {
  it('lets the event lead add an outside account right away and tells that person', async () => {
    const updated = await addCollaborator('u-bao', `  ${TAM.toUpperCase()} `)
    expect(updated.members.find((member) => member.id === 'u-tam')).toMatchObject({ kind: 'COLLABORATOR', departmentName: null })
    expect(staffRows('u-tam')).toHaveLength(1)
    signInAs('u-tam')
    const inbox = (await notificationRepository.list({ category: 'EVENT', size: 50 })).content
    expect(inbox.map((notification) => notification.title)).toContain('Bạn được thêm làm cộng tác viên tiểu ban Hậu cần của Đêm nhạc Mùa đông')
  })

  it('refuses a subcommittee lead, since adding collaborators needs the right over the whole event', async () => {
    signInAs('u-long')
    expect((await eventRepository.subcommittees('c-guitar', 'e-winter')).find((item) => item.id === 'sc-winter-logistics')?.allowedActions).toEqual(['INVITE_MEMBER'])
    expect((await fail(addCollaborator('u-long', TAM)))?.status).toBe(403)
    expect(staffRows('u-tam')).toHaveLength(0)
    signInAs('u-bao')
    expect((await eventRepository.subcommittees('c-guitar', 'e-winter'))[0]?.allowedActions).toEqual(['INVITE_MEMBER', 'ADD_COLLABORATOR'])
  })

  it('checks the email without revealing locked or unverified accounts', async () => {
    expect(await fail(addCollaborator('u-bao', 'không-phải-email'))).toMatchObject({ status: 400, fieldErrors: [{ field: 'email' }] })
    expect(await fail(addCollaborator('u-bao', 'nobody@demo.test'))).toMatchObject({ status: 422, code: 'ACCOUNT_NOT_FOUND' })
    const locked = await fail(addCollaborator('u-bao', 'khanh.vuong@demo.test'))
    const unverified = await fail(addCollaborator('u-bao', 'lan.to@demo.test'))
    expect([locked?.code, unverified?.code]).toEqual(['ACCOUNT_NOT_FOUND', 'ACCOUNT_NOT_FOUND'])
    expect(locked?.detail).toBe(unverified?.detail)
    expect(await fail(addCollaborator('u-bao', 'admin@demo.test'))).toMatchObject({ code: 'ACCOUNT_NOT_FOUND' })
  })

  it('sends members to the invite button, refuses a duplicate, and stops once the event is closed', async () => {
    expect(await fail(addCollaborator('u-bao', 'kiet.ly@demo.test'))).toMatchObject({ status: 422, code: 'IS_MEMBER' })
    expect((await fail(addCollaborator('u-bao', 'yen.trinh@demo.test')))?.detail).toContain('Tạm nghỉ')
    // Người đang chờ duyệt gia nhập không phải người ngoài CLB.
    expect((await fail(addCollaborator('u-bao', 'quan.truong@demo.test')))?.detail).toContain('chờ ban chủ nhiệm duyệt')
    await addCollaborator('u-bao', TAM)
    expect(await fail(addCollaborator('u-bao', TAM))).toMatchObject({ status: 409, code: 'ALREADY_STAFF' })
    await addCollaborator('u-bao', TAM, 'sc-winter-media')
    expect(staffRows('u-tam')).toHaveLength(2)
    winter().status = 'CANCELLED'
    expect(await fail(addCollaborator('u-anh', 'tu.chau@demo.test'))).toMatchObject({ status: 422, code: 'EVENT_READ_ONLY' })
  })

  it('never lets a collaborator lead a subcommittee (BR-ORG-01)', async () => {
    await addCollaborator('u-bao', TAM)
    signInAs('u-bao')
    const created = await fail(eventRepository.createSubcommittee('c-guitar', 'e-winter', { name: 'Lễ tân', description: '', quota: null, leadUserId: 'u-tam' }))
    expect(created).toMatchObject({ status: 400, fieldErrors: [{ field: 'leadUserId' }] })
    expect((await eventRepository.staffCandidates('c-guitar', 'e-winter', '')).map((candidate) => candidate.id)).not.toContain('u-tam')
  })
})

describe('a collaborator as an event guest (SRS 3.5, NFR-SEC-02)', () => {
  it('opens the host club as a guest with only public details and only the events they staff', async () => {
    await addCollaborator('u-bao', TAM)
    signInAs('u-tam')
    const club = await clubRepository.getClub('c-guitar')
    expect(club).toMatchObject({ viewerRole: 'EVENT_GUEST', rules: '', memberCount: 0, currentTerm: null, allowedActions: [], generalFundId: '' })
    expect((await eventRepository.list('c-guitar', {})).content.map((event) => event.id)).toEqual(['e-winter'])
    signInAs('u-anh')
    expect((await clubRepository.getClub('c-guitar')).viewerRole).toBe('MEMBER')
  })

  it('sees the event, its subcommittees, the event fund and the subcommittee tasks they work on', async () => {
    await addCollaborator('u-bao', TAM)
    db.tasks.find((task) => task.id === 't-lights')?.collaboratorIds.push('u-tam')
    signInAs('u-tam')
    const event = await eventRepository.get('c-guitar', 'e-winter')
    expect(event.allowedActions).toEqual(expect.arrayContaining(['VIEW_STAFF', 'VIEW_FUND']))
    expect(event.allowedActions).not.toContain('MANAGE_SUBCOMMITTEES')
    expect(await eventRepository.subcommittees('c-guitar', 'e-winter')).toHaveLength(3)
    expect((await financeRepository.fund('c-guitar', 'fund-e-winter')).id).toBe('fund-e-winter')
    expect((await taskRepository.get('c-guitar', 't-lights')).id).toBe('t-lights')
  })

  it('is refused members, the general fund and the structure of the host club', async () => {
    await addCollaborator('u-bao', TAM)
    signInAs('u-tam')
    expect((await fail(memberRepository.list('c-guitar', {})))?.status).toBe(403)
    expect((await fail(financeRepository.fund('c-guitar', 'fund-c-guitar')))?.status).toBeGreaterThanOrEqual(403)
    expect((await fail(orgRepository.departments('c-guitar', 'ACTIVE')))?.status).toBe(403)
    expect((await fail(clubRepository.settings('c-guitar')))?.status).toBe(403)
  })

  it('loses guest access once the event is closed', async () => {
    await addCollaborator('u-bao', TAM)
    winter().status = 'CLOSED'
    signInAs('u-tam')
    expect((await fail(clubRepository.getClub('c-guitar')))?.status).toBe(403)
    expect((await fail(eventRepository.get('c-guitar', 'e-winter')))?.status).toBe(404)
  })
})

describe('an event lead who leaves the club can stay on as a collaborator (progress report 17/11, 1.5)', () => {
  it('is replaced by the board, then added back as a collaborator without the lead role', async () => {
    signInAs('u-anh')
    const membership = db.memberships.find((candidate) => candidate.id === 'm-guitar-bao')
    await memberRepository.transition('c-guitar', 'm-guitar-bao', { action: 'REMOVE', reason: 'Chuyển sang học ở cơ sở khác.', version: membership?.version ?? 0 })
    const backlog = (await memberRepository.backlog('c-guitar', { status: 'OPEN', formerMemberId: 'u-bao' })).content
    const leadItem = backlog.find((item) => item.position?.role === 'EVENT_LEAD' && item.position.eventName === 'Đêm nhạc Mùa đông')
    if (!leadItem) throw new Error('Thiếu mục Trưởng BTC')
    await memberRepository.resolveBacklog('c-guitar', leadItem.id, { action: 'APPOINT', userId: 'u-huy', version: leadItem.version })

    const updated = await addCollaborator('u-huy', 'bao.tran@demo.test', 'sc-winter-program')
    expect(updated.members.find((member) => member.id === 'u-bao')?.kind).toBe('COLLABORATOR')
    signInAs('u-bao')
    const event = await eventRepository.get('c-guitar', 'e-winter')
    expect(event.lead?.id).toBe('u-huy')
    expect(event.allowedActions).not.toContain('MANAGE_SUBCOMMITTEES')
    expect((await clubRepository.getClub('c-guitar')).viewerRole).toBe('EVENT_GUEST')
  })
})
