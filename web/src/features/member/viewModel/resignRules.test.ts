import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { vnToday } from '@/api/mocks/mockTime'
import { clubRepository } from '@/features/club/model/clubRepository'
import { signInAs } from '@/testUtils'
import { memberRepository } from '../model/memberRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const membershipOf = (membershipId: string) => {
  const membership = db.memberships.find((candidate) => candidate.id === membershipId)
  if (!membership) throw new Error(`Thiếu ${membershipId}`)
  return membership
}

describe('coming back from leave (FR-MEM-07, ST-MEM)', () => {
  it('returns to official status at once, without joining again', async () => {
    signInAs('u-yen')
    const mine = await memberRepository.myMembership('c-guitar')
    expect(mine.allowedActions).toEqual(['RETURN', 'RESIGN'])
    expect((await fail(memberRepository.transitionMine('c-guitar', { action: 'RETURN', version: 0 })))?.status).toBe(409)
    const back = await memberRepository.transitionMine('c-guitar', { action: 'RETURN', version: mine.version })
    expect(back.status).toBe('ACTIVE')
    expect(membershipOf('m-guitar-yen').history.at(-1)).toMatchObject({ actorId: 'u-yen', fromStatus: 'ON_LEAVE', toStatus: 'ACTIVE' })
    expect(db.memberships.filter((membership) => membership.userId === 'u-yen' && membership.clubId === 'c-guitar')).toHaveLength(1)
    expect((await fail(memberRepository.transitionMine('c-guitar', { action: 'RETURN', version: back.version })))?.code).toBe('INVALID_TRANSITION')
  })
})

describe('resigning (FR-MEM-07, BR-MEM-03)', () => {
  it('lists what is still owed and changes nothing while anything is left', async () => {
    signInAs('u-linh')
    const mine = await memberRepository.myMembership('c-guitar')
    const titles = (kind: string) => mine.resignBlockers.filter((blocker) => blocker.kind === kind).map((blocker) => blocker.title)
    expect(titles('POSITION')).toEqual(expect.arrayContaining(['Trưởng ban Truyền thông', 'Trưởng tiểu ban Truyền thông (Đêm nhạc Mùa đông)']))
    expect(titles('TASK_REVIEW').length).toBeGreaterThan(0)

    signInAs('u-ha')
    const ha = await memberRepository.myMembership('c-guitar')
    expect(ha.resignBlockers.map((blocker) => blocker.kind)).toContain('TASK')
    const blocked = await fail(memberRepository.transitionMine('c-guitar', { action: 'RESIGN', reason: 'Chuyển sang CLB khác.', version: ha.version }))
    expect(blocked).toMatchObject({ status: 422, code: 'RESIGN_BLOCKED' })
    expect(blocked?.fieldErrors.map((error) => error.message)).toEqual(ha.resignBlockers.map((blocker) => blocker.title))
    expect(membershipOf('m-guitar-ha').status).toBe('ACTIVE')
  })

  it('leaves at once when nothing is owed, leaving the organising committee and telling the managers', async () => {
    signInAs('u-tram')
    const mine = await memberRepository.myMembership('c-guitar')
    expect(mine.resignBlockers).toEqual([])
    expect((await fail(memberRepository.transitionMine('c-guitar', { action: 'RESIGN', reason: 'ngắn', version: mine.version })))?.fieldErrors.map((error) => error.field)).toEqual([
      'reason',
    ])
    await memberRepository.transitionMine('c-guitar', { action: 'RESIGN', reason: 'Chuyển trường vào học kỳ sau.', version: mine.version })

    const tram = membershipOf('m-guitar-tram')
    expect(tram).toMatchObject({ status: 'LEFT', exitKind: 'RESIGNED', leftOn: vnToday(), leaveReason: 'Chuyển trường vào học kỳ sau.' })
    expect(tram.departmentHistory.at(-1)?.toOn).toBe(vnToday())
    expect(db.eventStaff.find((staff) => staff.userId === 'u-tram')?.leftAt).not.toBeNull()
    expect((await fail(clubRepository.getClub('c-guitar')))?.status).toBe(403)
    expect((await fail(memberRepository.myMembership('c-guitar')))?.status).toBe(403)
    const told = db.notifications.find((notification) => notification.title === 'Ngô Bảo Trâm đã rời CLB Guitar Sinh viên')
    expect(db.notificationRecipients.some((recipient) => recipient.notificationId === told?.id && recipient.userId === 'u-anh')).toBe(true)

    signInAs('u-anh')
    const left = await memberRepository.list('c-guitar', { status: ['LEFT'] })
    expect(left.content.map((member) => member.membershipId)).toContain('m-guitar-tram')
  })

  it('withdraws a pending leave request when the member resigns', async () => {
    signInAs('u-hieu')
    const sent = await memberRepository.requestLeave('c-guitar', 'Thực tập ở công ty xa trường.')
    await memberRepository.transitionMine('c-guitar', { action: 'RESIGN', reason: 'Không sắp xếp được thời gian.', version: sent.version })
    expect(db.leaveRequests.find((leave) => leave.id === sent.leaveRequest?.id)?.status).toBe('WITHDRAWN')
  })
})
