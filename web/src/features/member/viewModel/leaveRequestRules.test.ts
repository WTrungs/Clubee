import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { grantPosition } from '@/api/mocks/mockPermissions'
import { nowIso } from '@/api/mocks/mockTime'
import { signInAs } from '@/testUtils'
import { memberRepository } from '../model/memberRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const membershipOf = (membershipId: string) => {
  const membership = db.memberships.find((candidate) => candidate.id === membershipId)
  if (!membership) throw new Error(`Thiếu ${membershipId}`)
  return membership
}
const leaveOf = (requestId: string) => {
  const leave = db.leaveRequests.find((candidate) => candidate.id === requestId)
  if (!leave) throw new Error(`Thiếu ${requestId}`)
  return leave
}
const notifiedTitles = (userId: string) =>
  db.notificationRecipients.filter((recipient) => recipient.userId === userId).map((recipient) => db.notifications.find((notification) => notification.id === recipient.notificationId)?.title)

describe('asking for leave (FR-MEM-07, BR-MEM-05)', () => {
  it('sends one pending request, tells the managers and lets the member withdraw it', async () => {
    signInAs('u-ha')
    expect((await memberRepository.myMembership('c-guitar')).allowedActions).toEqual(['REQUEST_LEAVE', 'RESIGN'])
    const sent = await memberRepository.requestLeave('c-guitar', 'Ôn thi cuối kỳ trong một tháng.')
    expect(sent.leaveRequest).toMatchObject({ status: 'PENDING', reason: 'Ôn thi cuối kỳ trong một tháng.', allowedActions: [] })
    expect(sent.allowedActions).toEqual(['WITHDRAW_LEAVE_REQUEST', 'RESIGN'])
    expect((await fail(memberRepository.requestLeave('c-guitar', 'Gửi thêm lần nữa.')))?.code).toBe('LEAVE_REQUEST_EXISTS')
    expect(notifiedTitles('u-anh')).toContain('Lê Thu Hà xin tạm nghỉ')

    const requestId = sent.leaveRequest?.id ?? ''
    expect((await fail(memberRepository.withdrawLeave('c-guitar', requestId, 0)))?.status).toBe(409)
    const withdrawn = await memberRepository.withdrawLeave('c-guitar', requestId, sent.leaveRequest?.version ?? 0)
    expect(withdrawn.leaveRequest?.status).toBe('WITHDRAWN')
    expect(withdrawn.allowedActions).toContain('REQUEST_LEAVE')
    expect((await fail(memberRepository.withdrawLeave('c-guitar', requestId, leaveOf(requestId).version)))?.code).toBe('REQUEST_CLOSED')
    expect(membershipOf('m-guitar-ha').status).toBe('ACTIVE')
  })

  it('refuses short reasons, members not yet official and holders of a standing position', async () => {
    signInAs('u-ha')
    expect((await fail(memberRepository.requestLeave('c-guitar', 'ngắn')))?.fieldErrors.map((error) => error.field)).toEqual(['reason'])
    signInAs('u-tram')
    expect((await fail(memberRepository.requestLeave('c-guitar', 'Bận việc gia đình.')))?.code).toBe('INVALID_TRANSITION')
    signInAs('u-linh')
    const mine = await memberRepository.myMembership('c-guitar')
    expect(mine.leaveBlockers[0]).toContain('Trưởng ban Truyền thông')
    expect((await fail(memberRepository.requestLeave('c-guitar', 'Bận việc gia đình.')))?.code).toBe('HOLDS_STANDING_POSITION')
    expect(db.leaveRequests.filter((leave) => leave.userId === 'u-linh')).toEqual([])
  })

  it('lets the board approve: the member goes on leave and is told', async () => {
    signInAs('u-anh')
    const pending = (await memberRepository.leaveRequests('c-guitar', {})).content
    expect(pending.map((leave) => leave.id)).toEqual(['lr-guitar-khoa'])
    expect(pending[0]).toMatchObject({ member: { id: 'u-khoa' }, department: { id: 'd-logistics' }, blockers: [], allowedActions: ['APPROVE', 'REJECT'] })

    const approved = await memberRepository.decideLeave('c-guitar', 'lr-guitar-khoa', { action: 'APPROVE', version: 1 })
    expect(approved).toMatchObject({ status: 'APPROVED', decidedBy: { id: 'u-anh' }, allowedActions: [] })
    expect(membershipOf('m-guitar-khoa')).toMatchObject({ status: 'ON_LEAVE' })
    expect(membershipOf('m-guitar-khoa').history.at(-1)).toMatchObject({ actorId: 'u-anh', fromStatus: 'ACTIVE', toStatus: 'ON_LEAVE' })
    expect(notifiedTitles('u-khoa')).toContain('Yêu cầu tạm nghỉ ở CLB Guitar Sinh viên đã được duyệt')
    expect((await fail(memberRepository.decideLeave('c-guitar', 'lr-guitar-khoa', { action: 'APPROVE', version: 1 })))?.status).toBe(409)
    expect((await fail(memberRepository.decideLeave('c-guitar', 'lr-guitar-khoa', { action: 'REJECT', note: 'Thử lại.', version: 2 })))?.code).toBe('REQUEST_CLOSED')
    expect((await memberRepository.leaveRequests('c-guitar', { status: 'DECIDED' })).content.map((leave) => leave.id)).toEqual(['lr-guitar-khoa'])
  })

  it('requires a note to reject, and the member then sees why and may ask again', async () => {
    signInAs('u-anh')
    expect((await fail(memberRepository.decideLeave('c-guitar', 'lr-guitar-khoa', { action: 'REJECT', version: 1 })))?.fieldErrors.map((error) => error.field)).toEqual(['note'])
    await memberRepository.decideLeave('c-guitar', 'lr-guitar-khoa', { action: 'REJECT', note: 'Ban Hậu cần đang thiếu người tuần này.', version: 1 })
    signInAs('u-khoa')
    const mine = await memberRepository.myMembership('c-guitar')
    expect(mine.leaveRequest).toMatchObject({ status: 'REJECTED', decisionNote: 'Ban Hậu cần đang thiếu người tuần này.', decidedBy: { id: 'u-anh' } })
    expect(mine.allowedActions).toContain('REQUEST_LEAVE')
    expect(membershipOf('m-guitar-khoa').status).toBe('ACTIVE')
  })

  it('checks the standing positions again when approving', async () => {
    grantPosition({ userId: 'u-khoa', clubId: 'c-guitar', role: 'DEPARTMENT_VICE_HEAD', scopeId: 'd-logistics', assignedBy: 'u-anh' })
    signInAs('u-anh')
    const [leave] = (await memberRepository.leaveRequests('c-guitar', {})).content
    expect(leave?.blockers[0]).toContain('Phó ban Hậu cần')
    expect((await fail(memberRepository.decideLeave('c-guitar', 'lr-guitar-khoa', { action: 'APPROVE', version: 1 })))?.code).toBe('HOLDS_STANDING_POSITION')
    expect(membershipOf('m-guitar-khoa').status).toBe('ACTIVE')
  })

  it('refuses outsiders, people without the member permission and deciding on your own request', async () => {
    signInAs('u-ha')
    expect((await fail(memberRepository.leaveRequests('c-guitar', {})))?.status).toBe(403)
    expect((await fail(memberRepository.decideLeave('c-guitar', 'lr-guitar-khoa', { action: 'APPROVE', version: 1 })))?.status).toBe(403)
    signInAs('u-quan')
    expect((await fail(memberRepository.myMembership('c-guitar')))?.status).toBe(403)

    db.permissionOverrides.push({ clubId: 'c-guitar', role: 'TREASURER', permission: 'MANAGE_MEMBERS', enabled: false, updatedBy: 'u-anh', updatedAt: nowIso() })
    signInAs('u-mai')
    expect((await fail(memberRepository.leaveRequests('c-guitar', {})))?.status).toBe(403)

    db.leaveRequests.push({ ...leaveOf('lr-guitar-khoa'), id: 'lr-own', membershipId: 'm-guitar-huy', userId: 'u-huy' })
    signInAs('u-huy')
    const own = (await memberRepository.leaveRequests('c-guitar', {})).content.find((leave) => leave.id === 'lr-own')
    expect(own?.allowedActions).toEqual([])
    expect((await fail(memberRepository.decideLeave('c-guitar', 'lr-own', { action: 'APPROVE', version: 1 })))?.code).toBe('SELF_TRANSITION')
  })

  it('closes a pending request when the board changes the membership directly', async () => {
    signInAs('u-anh')
    await memberRepository.transition('c-guitar', 'm-guitar-khoa', { action: 'PUT_ON_LEAVE', reason: 'Đi thực tập hai tháng.', version: membershipOf('m-guitar-khoa').version })
    expect(leaveOf('lr-guitar-khoa')).toMatchObject({ status: 'APPROVED', decidedBy: 'u-anh' })

    signInAs('u-ha')
    const sent = await memberRepository.requestLeave('c-guitar', 'Ôn thi cuối kỳ trong một tháng.')
    signInAs('u-anh')
    await memberRepository.transition('c-guitar', 'm-guitar-ha', { action: 'REMOVE', reason: 'Kiểm thử đưa ra khỏi CLB.', version: membershipOf('m-guitar-ha').version })
    expect(leaveOf(sent.leaveRequest?.id ?? '').status).toBe('CLOSED')
  })
})
