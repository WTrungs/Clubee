import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { departmentOn } from '@/api/mocks/mockMembers'
import { grantPosition } from '@/api/mocks/mockPermissions'
import { nowIso, vnDate, vnToday } from '@/api/mocks/mockTime'
import { orgRepository } from '@/features/org/model/orgRepository'
import { termRepository } from '@/features/term/model/termRepository'
import type { DepartmentPlanEntry } from '@/features/term/model/termTypes'
import { signInAs } from '@/testUtils'
import { memberRepository } from '../model/memberRepository'
import type { DepartmentTransferRequest } from '../model/memberTypes'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const membershipOf = (membershipId: string) => {
  const membership = db.memberships.find((candidate) => candidate.id === membershipId)
  if (!membership) throw new Error(`Thiếu ${membershipId}`)
  return membership
}
const row = (membershipId: string) => ({ membershipId, version: membershipOf(membershipId).version })
const transfer = (toDepartmentId: string, ...membershipIds: string[]) => memberRepository.transferDepartment('c-guitar', { toDepartmentId, members: membershipIds.map(row) })

describe('department transfer (FR-MEM-10, BR-MEM-06)', () => {
  it('ends the old department yesterday, opens the new one today and keeps tasks of the old department', async () => {
    signInAs('u-anh')
    const result = await transfer('d-music', 'm-guitar-vy')
    expect(result.toDepartment).toEqual({ id: 'd-music', name: 'Chuyên môn' })
    expect(result.members[0]).toMatchObject({ membershipId: 'm-guitar-vy', department: { id: 'd-music' }, version: 2 })

    const vy = membershipOf('m-guitar-vy')
    expect(departmentOn(vy, vnDate(-1))).toBe('d-media')
    expect(departmentOn(vy, vnToday())).toBe('d-music')
    expect(db.tasks.find((task) => task.id === 't-teaser')).toMatchObject({ scopeId: 'd-media', ownerId: 'u-vy' })

    const detail = await memberRepository.get('c-guitar', 'm-guitar-vy')
    expect(detail.departmentHistory?.map((stint) => [stint.department.id, stint.toOn])).toEqual([
      ['d-music', null],
      ['d-media', vnDate(-1)],
    ])
    expect(detail.departmentHistory?.[0]?.changedBy?.id).toBe('u-anh')
    const notice = db.notifications.findLast((notification) => notification.title.startsWith('Ban chính của bạn'))
    expect(notice?.title).toBe('Ban chính của bạn ở CLB Guitar Sinh viên chuyển sang Ban Chuyên môn')
    expect(db.notificationRecipients.some((recipient) => recipient.notificationId === notice?.id && recipient.userId === 'u-vy')).toBe(true)
  })

  it('moves members on leave too, since they keep a main department', async () => {
    signInAs('u-anh')
    expect(membershipOf('m-guitar-yen').status).toBe('ON_LEAVE')
    await transfer('d-design', 'm-guitar-yen')
    expect(membershipOf('m-guitar-yen').departmentId).toBe('d-design')
  })

  it('keeps only the last department when moved twice in a day and hides the cancelled step', async () => {
    signInAs('u-anh')
    await transfer('d-music', 'm-guitar-vy')
    await transfer('d-logistics', 'm-guitar-vy')
    const vy = membershipOf('m-guitar-vy')
    expect(departmentOn(vy, vnToday())).toBe('d-logistics')
    expect(departmentOn(vy, vnDate(-1))).toBe('d-media')
    const detail = await memberRepository.get('c-guitar', 'm-guitar-vy')
    expect(detail.departmentHistory?.map((stint) => stint.department.id)).toEqual(['d-logistics', 'd-media'])
  })

  it('refuses people without the member permission, including through the permission matrix', async () => {
    signInAs('u-ha')
    expect((await fail(transfer('d-music', 'm-guitar-vy')))?.status).toBe(403)
    const seen = (await orgRepository.departments('c-guitar', 'ACTIVE')).find((department) => department.id === 'd-media')
    expect(seen?.allowedActions).not.toContain('TRANSFER_MEMBERS')
    db.permissionOverrides.push({ clubId: 'c-guitar', role: 'TREASURER', permission: 'MANAGE_MEMBERS', enabled: false, updatedBy: 'u-anh', updatedAt: nowIso() })
    signInAs('u-mai')
    expect((await fail(transfer('d-music', 'm-guitar-vy')))?.status).toBe(403)
    expect((await memberRepository.get('c-guitar', 'm-guitar-vy')).allowedActions).not.toContain('TRANSFER_DEPARTMENT')
    expect(membershipOf('m-guitar-vy').departmentId).toBe('d-media')
  })

  it('checks the request, the versions and the people, moving nobody when one of them fails', async () => {
    signInAs('u-anh')
    const fields = async (promise: Promise<unknown>) => (await fail(promise))?.fieldErrors.map((error) => error.field)
    expect(await fields(transfer('d-photo', 'm-guitar-vy'))).toEqual(['toDepartmentId'])
    expect(await fields(transfer('d-music'))).toEqual(['members'])
    const tooMany = Array.from({ length: 51 }, (_, index) => ({ membershipId: `m-${index}`, version: 1 }))
    expect(await fields(memberRepository.transferDepartment('c-guitar', { toDepartmentId: 'd-music', members: tooMany }))).toEqual(['members'])
    const malformed = [null, { membershipId: 'm-guitar-vy' }] as unknown as DepartmentTransferRequest['members']
    expect(await fields(memberRepository.transferDepartment('c-guitar', { toDepartmentId: 'd-music', members: malformed }))).toEqual(['members[0]', 'members[1]'])
    expect(await fields(memberRepository.transferDepartment('c-guitar', { toDepartmentId: 'd-music', members: [row('m-guitar-vy'), row('m-guitar-vy')] }))).toEqual(['members'])
    expect((await fail(memberRepository.transferDepartment('c-guitar', { toDepartmentId: 'd-music', members: [{ membershipId: 'm-nope', version: 1 }] })))?.status).toBe(404)

    const stale = await fail(memberRepository.transferDepartment('c-guitar', { toDepartmentId: 'd-music', members: [row('m-guitar-ha'), { membershipId: 'm-guitar-vy', version: 0 }] }))
    expect(stale).toMatchObject({ status: 409, fieldErrors: [{ field: 'members[1]' }] })
    expect((await fail(transfer('d-music', 'm-guitar-dat')))).toMatchObject({ status: 422, code: 'INVALID_TRANSITION' })
    expect(await fields(transfer('d-media', 'm-guitar-ha', 'm-guitar-vy'))).toEqual(['members[0]', 'members[1]'])
    expect(['m-guitar-ha', 'm-guitar-vy'].map((id) => membershipOf(id).departmentId)).toEqual(['d-media', 'd-media'])
  })

  it('blocks heads and vice heads of the old department until their position is revoked (BR-ORG-01)', async () => {
    signInAs('u-anh')
    const blocked = await fail(transfer('d-music', 'm-guitar-vy', 'm-guitar-linh'))
    expect(blocked).toMatchObject({ status: 422, code: 'HOLDS_DEPARTMENT_POSITION' })
    expect(blocked?.message).toContain('Đặng Khánh Linh (Trưởng ban Truyền thông)')
    expect(membershipOf('m-guitar-vy').departmentId).toBe('d-media')

    // Chức vụ đã gán nhưng chưa tới ngày bắt đầu cũng chặn, để chức vụ không tự có hiệu lực ở ban người đó đã rời.
    grantPosition({ userId: 'u-vy', clubId: 'c-guitar', role: 'DEPARTMENT_VICE_HEAD', scopeId: 'd-media', assignedBy: 'u-anh', startOn: vnDate(5) })
    expect((await fail(transfer('d-music', 'm-guitar-vy')))?.code).toBe('HOLDS_DEPARTMENT_POSITION')
  })

  it('opens the department on approval and closes it when the member is removed', async () => {
    signInAs('u-anh')
    const quan = membershipOf('m-guitar-quan')
    await memberRepository.transition('c-guitar', 'm-guitar-quan', { action: 'APPROVE_PROBATION', departmentId: 'd-media', version: quan.version })
    expect(quan.departmentHistory).toEqual([{ departmentId: 'd-media', fromOn: vnToday(), toOn: null, changedBy: 'u-anh' }])
    await memberRepository.transition('c-guitar', 'm-guitar-quan', { action: 'REMOVE', reason: 'Kiểm thử đưa ra khỏi CLB.', version: quan.version })
    expect(quan.departmentHistory[0]?.toOn).toBe(vnToday())
    expect(departmentOn(quan, vnToday())).toBe('d-media')
  })

  it('lets the board empty a department, then close it or drop it from the next term plan (BR-TERM-04)', async () => {
    signInAs('u-anh')
    const before = (await orgRepository.departments('c-guitar', 'ACTIVE')).find((department) => department.id === 'd-design')
    expect(before?.allowedActions).toContain('TRANSFER_MEMBERS')
    const term = await termRepository.create('c-guitar', { name: 'Nhiệm kỳ 2027–2028', startOn: vnDate(301), endOn: vnDate(665) })
    const planWith = (plan: DepartmentPlanEntry[]) =>
      plan.map((entry) => ({ id: entry.id, departmentId: entry.departmentId, name: entry.name, description: entry.description, dropped: entry.departmentId === 'd-design' }))
    const drop = () => termRepository.update('c-guitar', term.id, { departmentPlan: planWith(term.departmentPlan ?? []), version: term.version })
    expect((await fail(drop()))?.status).toBe(400)

    await transfer('d-music', 'm-guitar-hieu')
    const design = db.departments.find((department) => department.id === 'd-design')
    if (!design) throw new Error('Thiếu ban Thiết kế')
    expect((await drop()).departmentPlan?.find((entry) => entry.departmentId === 'd-design')?.dropped).toBe(true)
    const emptied = (await orgRepository.departments('c-guitar', 'ACTIVE')).find((department) => department.id === 'd-design')
    expect(emptied).toMatchObject({ memberCount: 0 })
    expect(emptied?.allowedActions).not.toContain('TRANSFER_MEMBERS')

    // Nhánh chặn đóng ban còn chức vụ: API không tạo được tình huống này nên dựng thẳng trong dữ liệu.
    const head = grantPosition({ userId: 'u-khoa', clubId: 'c-guitar', role: 'DEPARTMENT_HEAD', scopeId: 'd-design', assignedBy: 'u-anh' })
    expect((await fail(orgRepository.closeDepartment('c-guitar', 'd-design', { action: 'CLOSE', reason: 'Gộp vào ban Chuyên môn.', version: design.version })))?.code).toBe('DEPARTMENT_HAS_POSITIONS')
    Object.assign(head, { endOn: vnDate(-1), revokedAt: nowIso() })
    const closed = await orgRepository.closeDepartment('c-guitar', 'd-design', { action: 'CLOSE', reason: 'Gộp vào ban Chuyên môn.', version: design.version })
    expect(closed.status).toBe('CLOSED')
  })
})
