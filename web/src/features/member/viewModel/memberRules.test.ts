import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { hasPosition, isPositionOpen, positionHolderOf } from '@/api/mocks/mockPermissions'
import { clubRepository } from '@/features/club/model/clubRepository'
import { eventRepository } from '@/features/event/model/eventRepository'
import { taskRepository } from '@/features/task/model/taskRepository'
import { signInAs } from '@/testUtils'
import { memberRepository } from '../model/memberRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const versionOf = (membershipId: string) => db.memberships.find((membership) => membership.id === membershipId)?.version ?? 0
const membershipIdOf = (userId: string, clubId = 'c-guitar') =>
  db.memberships.find((membership) => membership.userId === userId && membership.clubId === clubId && membership.status !== 'LEFT')?.id ?? ''

describe('join requests (FR-MEM-02, 03, BR-MEM-01)', () => {
  it('creates a pending membership and blocks a second active one', async () => {
    signInAs('u-ha')
    const missingId = await fail(memberRepository.requestToJoin('c-volunteer', { introduction: 'Mình muốn tham gia chiến dịch môi trường.' }))
    expect(missingId?.status).toBe(400)
    expect(missingId?.fieldErrors.map((error) => error.field)).toEqual(['studentId'])

    const receipt = await memberRepository.requestToJoin('c-volunteer', { introduction: 'Mình muốn tham gia chiến dịch môi trường.', studentId: '26001003' })
    expect(receipt.status).toBe('PENDING')
    expect((await fail(memberRepository.requestToJoin('c-volunteer', { introduction: 'Gửi lại lần nữa cho chắc.', studentId: '26001003' })))?.status).toBe(409)
    expect((await fail(memberRepository.requestToJoin('c-guitar', { introduction: 'Mình đã là thành viên rồi.', studentId: '26001003' })))?.status).toBe(409)

    const pendingClub = await fail(clubRepository.getClub('c-volunteer'))
    expect(pendingClub?.code).toBe('MEMBERSHIP_PENDING')
    const directory = await clubRepository.directory({})
    expect(directory.content.find((club) => club.id === 'c-volunteer')).toMatchObject({ myMembership: { status: 'PENDING' }, allowedActions: [] })
  })

  it('approves into the club setting and shows past memberships to the board', async () => {
    signInAs('u-anh')
    const requests = await memberRepository.joinRequests('c-guitar', {})
    const phuong = requests.content.find((request) => request.applicant.id === 'u-phuong')
    expect(phuong?.pastMemberships[0]).toMatchObject({ exitKind: 'RESIGNED', reason: 'Xin rời để tập trung thực tập ở tỉnh khác.' })
    expect(phuong?.allowedActions).toEqual(['APPROVE_PROBATION', 'APPROVE_ACTIVE', 'REJECT'])

    const noDepartment = await fail(memberRepository.transition('c-guitar', 'm-guitar-quan', { action: 'APPROVE_PROBATION', version: versionOf('m-guitar-quan') }))
    expect(noDepartment?.fieldErrors[0]?.field).toBe('departmentId')
    const approved = await memberRepository.transition('c-guitar', 'm-guitar-quan', { action: 'APPROVE_PROBATION', departmentId: 'd-media', version: versionOf('m-guitar-quan') })
    expect(approved).toMatchObject({ status: 'PROBATION', department: { id: 'd-media' } })
    expect((await taskRepository.assignableScopes('c-guitar')).find((scope) => scope.id === 'd-media')?.members.map((member) => member.id)).toContain('u-quan')

    const rejected = await memberRepository.transition('c-guitar', 'm-guitar-phuong', { action: 'REJECT', reason: 'Đợt này CLB đã đủ người.', version: versionOf('m-guitar-phuong') })
    expect(rejected).toMatchObject({ status: 'LEFT', exitKind: 'REJECTED' })
    signInAs('u-ha')
    const left = await memberRepository.list('c-guitar', { status: ['LEFT'] })
    expect(left.content.map((member) => member.membershipId)).not.toContain('m-guitar-phuong')
    expect((await fail(memberRepository.get('c-guitar', 'm-guitar-phuong')))?.status).toBe(404)

    signInAs('u-phuong')
    const entry = (await clubRepository.directory({})).content.find((club) => club.id === 'c-guitar')
    expect(entry).toMatchObject({ myMembership: { rejectionReason: 'Đợt này CLB đã đủ người.' }, allowedActions: ['REQUEST_TO_JOIN'] })
  })

  it('approves straight to Chính thức when the club has no probation step', async () => {
    signInAs('u-ha')
    const receipt = await memberRepository.requestToJoin('c-volunteer', { introduction: 'Mình muốn tham gia chiến dịch môi trường.', studentId: '26001003' })
    signInAs('u-tam')
    const probation = await fail(memberRepository.transition('c-volunteer', receipt.membershipId, { action: 'APPROVE_PROBATION', departmentId: 'd-vol-field', version: 1 }))
    expect(probation?.status).toBe(422)
    const approved = await memberRepository.transition('c-volunteer', receipt.membershipId, { action: 'APPROVE_ACTIVE', departmentId: 'd-vol-field', version: 1 })
    expect(approved.status).toBe('ACTIVE')
  })

  it('keeps join requests away from members outside the board', async () => {
    signInAs('u-ha')
    expect((await fail(memberRepository.joinRequests('c-guitar', {})))?.status).toBe(403)
    const error = await fail(memberRepository.transition('c-guitar', 'm-guitar-quan', { action: 'APPROVE_ACTIVE', departmentId: 'd-media', version: 1 }))
    expect(error?.status).toBe(403)
    expect(error?.detail).toContain('ban chủ nhiệm')
  })
})

describe('member list and status (FR-MEM-04, 06, ST-MEM, SRS 3.5)', () => {
  it('shows contact and student id to the board only', async () => {
    signInAs('u-ha')
    const seenByMember = await memberRepository.list('c-guitar', {})
    expect(seenByMember.content.every((member) => member.contact === null && member.studentId === null)).toBe(true)
    expect(seenByMember.content.some((member) => member.status === 'PENDING' || member.status === 'LEFT')).toBe(false)
    const detail = await memberRepository.get('c-guitar', membershipIdOf('u-linh'))
    expect(detail).toMatchObject({ history: null, leaveReason: null, allowedActions: [] })
    const dat = await memberRepository.get('c-guitar', 'm-guitar-dat')
    expect(dat).toMatchObject({ status: 'LEFT', exitKind: null, leftOn: null, leaveReason: null })

    signInAs('u-anh')
    const seenByBoard = await memberRepository.list('c-guitar', { q: 'linh.dang' })
    expect(seenByBoard.content).toHaveLength(1)
    expect(seenByBoard.content[0]?.contact?.email).toBe('linh.dang@demo.test')
    expect(seenByBoard.content[0]?.studentId).toMatch(/^2600/)
  })

  it('filters by status, department, position and join year', async () => {
    signInAs('u-ha')
    expect((await memberRepository.list('c-guitar', { status: ['ON_LEAVE'] })).content.map((member) => member.person.id)).toEqual(['u-yen'])
    expect((await memberRepository.list('c-guitar', { status: ['LEFT'] })).content.map((member) => member.person.id).sort()).toEqual(['u-dat', 'u-phuong'])
    const heads = await memberRepository.list('c-guitar', { role: 'DEPARTMENT_HEAD' })
    expect(heads.content.map((member) => member.person.id).sort()).toEqual(['u-linh', 'u-long', 'u-son'])
    const media = await memberRepository.list('c-guitar', { departmentId: 'd-media' })
    expect(media.content.every((member) => member.department?.id === 'd-media')).toBe(true)
    const facets = await memberRepository.facets('c-guitar')
    const year = facets.joinYears[0] ?? 0
    const byYear = await memberRepository.list('c-guitar', { joinYear: year })
    expect(byYear.content.every((member) => member.joinedOn?.startsWith(String(year)))).toBe(true)
  })

  it('follows the ST-MEM table and refuses everything else', async () => {
    signInAs('u-anh')
    const tram = membershipIdOf('u-tram')
    expect((await memberRepository.get('c-guitar', tram)).allowedActions).toEqual(['CONFIRM', 'REMOVE', 'EDIT_INFO', 'TRANSFER_DEPARTMENT'])
    const invalid = await fail(memberRepository.transition('c-guitar', tram, { action: 'RETURN', reason: 'Không hợp lệ.', version: versionOf(tram) }))
    expect(invalid?.status).toBe(422)
    const noReason = await fail(memberRepository.transition('c-guitar', tram, { action: 'CONFIRM', version: versionOf(tram) }))
    expect(noReason?.status).toBe(400)
    const stale = await fail(memberRepository.transition('c-guitar', tram, { action: 'CONFIRM', reason: 'Hoàn thành thử việc.', version: versionOf(tram) - 1 }))
    expect(stale?.status).toBe(409)
    const confirmed = await memberRepository.transition('c-guitar', tram, { action: 'CONFIRM', reason: 'Hoàn thành thử việc.', version: versionOf(tram) })
    expect(confirmed.status).toBe('ACTIVE')
    expect(confirmed.history?.[0]).toMatchObject({ fromStatus: 'PROBATION', toStatus: 'ACTIVE', reason: 'Hoàn thành thử việc.' })

    const yen = membershipIdOf('u-yen')
    expect((await memberRepository.transition('c-guitar', yen, { action: 'RETURN', reason: 'Đã đi trao đổi về.', version: versionOf(yen) })).status).toBe('ACTIVE')

    const self = await fail(memberRepository.transition('c-guitar', membershipIdOf('u-anh'), { action: 'PUT_ON_LEAVE', reason: 'Tự cho mình nghỉ.', version: 1 }))
    expect(self?.status).toBe(422)
  })

  it('blocks leave while the member holds a standing position (FR-MEM-06, BR-MEM-05)', async () => {
    signInAs('u-anh')
    const linh = membershipIdOf('u-linh')
    const error = await fail(memberRepository.transition('c-guitar', linh, { action: 'PUT_ON_LEAVE', reason: 'Bận thi cuối kỳ.', version: versionOf(linh) }))
    expect(error?.status).toBe(422)
    expect(error?.detail).toContain('Trưởng ban Truyền thông')
  })
})

describe('removing a member (FR-MEM-08, BR-MEM-04, BR-ORG-02)', () => {
  it('ends every position and staff role at once and moves open work to the backlog', async () => {
    signInAs('u-anh')
    const long = membershipIdOf('u-long')
    // Chức đã kết thúc từ nhiệm kỳ trước giữ nguyên lý do cũ.
    const openBefore = db.positions.filter((position) => position.userId === 'u-long' && isPositionOpen(position)).map((position) => position.id)
    const removed = await memberRepository.transition('c-guitar', long, { action: 'REMOVE', reason: 'Vi phạm nội quy nhiều lần.', version: versionOf(long) })
    expect(removed).toMatchObject({ status: 'LEFT', exitKind: 'REMOVED', backlogCount: 4, positionTitles: [] })
    expect(db.backlogItems.map((item) => item.kind).sort()).toEqual(['POSITION', 'POSITION', 'TASK', 'TASK_REVIEW'])
    expect(hasPosition('u-long', 'DEPARTMENT_HEAD', 'd-logistics')).toBe(false)
    expect(positionHolderOf('SUBCOMMITTEE_LEAD', 'sc-winter-logistics')).toBeNull()
    expect(openBefore).toHaveLength(2)
    expect(db.positions.filter((position) => openBefore.includes(position.id)).every((position) => position.revokeReason?.startsWith('Bị đưa ra khỏi CLB'))).toBe(true)
    expect(db.positions.find((position) => position.id.startsWith('p-2025-department_vice_head-d-logistics'))?.revokeReason).toBe('Xin thôi chức để tập trung thi cuối kỳ.')

    const logistics = (await eventRepository.subcommittees('c-guitar', 'e-winter')).find((subcommittee) => subcommittee.id === 'sc-winter-logistics')
    expect(logistics?.lead).toBeNull()
    expect(logistics?.members.map((member) => member.id)).not.toContain('u-long')
    const scope = (await taskRepository.assignableScopes('c-guitar')).find((candidate) => candidate.id === 'd-logistics')
    expect(scope?.members.map((member) => member.id)).not.toContain('u-long')

    signInAs('u-long')
    expect((await taskRepository.listMine({ size: 50 })).content).toHaveLength(0)
    expect((await fail(taskRepository.get('c-guitar', 't-sound')))?.status).toBe(403)
    expect((await fail(clubRepository.getClub('c-guitar')))?.status).toBe(403)
  })

  it('refuses to remove the last president', async () => {
    signInAs('u-huy')
    const anh = membershipIdOf('u-anh')
    const error = await fail(memberRepository.transition('c-guitar', anh, { action: 'REMOVE', reason: 'Kiểm thử chủ nhiệm cuối.', version: versionOf(anh) }))
    expect(error?.status).toBe(422)
    expect(error?.code).toBe('LAST_PRESIDENT')
  })
})

describe('removing a co-host member from their home club (FR-EVT-08, BR-MEM-04)', () => {
  it('ends their staff place and subcommittee lead post in the other club event at once', async () => {
    signInAs('u-tu')
    await eventRepository.decideCoHost('c-english', 'ch-winter-english', { decision: 'ACCEPT', note: null, version: 1 })
    signInAs('u-bao')
    await eventRepository.addStaff('c-guitar', 'e-winter', 'sc-winter-logistics', 'u-tam', 'ch-winter-english')
    await eventRepository.setSubcommitteeLead('c-guitar', 'e-winter', 'sc-winter-logistics', { userId: 'u-tam', reason: 'Cần người lo phần song ngữ.' })

    signInAs('u-tu')
    const tam = membershipIdOf('u-tam', 'c-english')
    await memberRepository.transition('c-english', tam, { action: 'REMOVE', reason: 'Không tham gia sinh hoạt.', version: versionOf(tam) })
    expect(positionHolderOf('SUBCOMMITTEE_LEAD', 'sc-winter-logistics')).toBeNull()
    expect(db.eventStaff.find((staff) => staff.userId === 'u-tam' && staff.eventId === 'e-winter')?.leftAt).not.toBeNull()
    // Không đưa vào tồn đọng của CLB Tiếng Anh: chức vụ thuộc CLB Guitar.
    expect(db.backlogItems.filter((item) => item.clubId === 'c-english' && item.kind === 'POSITION')).toHaveLength(0)
    const told = db.notifications.find((notification) => notification.title === 'Dương Thanh Tâm thôi làm nhân sự Đêm nhạc Mùa đông')
    expect(db.notificationRecipients.some((recipient) => recipient.notificationId === told?.id && recipient.userId === 'u-bao')).toBe(true)
  })
})
