import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { hasPosition } from '@/api/mocks/mockPermissions'
import { vnDate } from '@/api/mocks/mockTime'
import { clubRepository } from '@/features/club/model/clubRepository'
import { memberRepository } from '@/features/member/model/memberRepository'
import { taskRepository } from '@/features/task/model/taskRepository'
import { signInAs } from '@/testUtils'
import { orgRepository } from '../model/orgRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const termOf = (clubId: string) => db.terms.find((term) => term.clubId === clubId && term.status === 'RUNNING')
const assignRequest = (overrides: Partial<Parameters<typeof orgRepository.assign>[1]> = {}) => ({
  userId: 'u-hieu',
  role: 'DEPARTMENT_HEAD' as const,
  scopeId: 'd-design',
  startOn: vnDate(0),
  endOn: termOf('c-guitar')?.endOn ?? '',
  ...overrides,
})
const positionId = (userId: string, role: string, scopeId: string) =>
  db.positions.find((position) => position.userId === userId && position.role === role && position.scopeId === scopeId)?.id ?? ''

describe('assigning positions (FR-ORG-02, BR-ORG-01, BR-ORG-03)', () => {
  it('offers only official members of that department', async () => {
    signInAs('u-anh')
    expect((await orgRepository.candidates('c-guitar', 'DEPARTMENT_HEAD', 'd-design')).map((candidate) => candidate.id)).toEqual(['u-hieu'])
    const external = await orgRepository.candidates('c-guitar', 'DEPARTMENT_VICE_HEAD', 'd-external')
    expect(external.map((candidate) => candidate.id)).not.toContain('u-ngoc')

    const probation = await fail(orgRepository.assign('c-guitar', assignRequest({ userId: 'u-ngoc', role: 'DEPARTMENT_VICE_HEAD', scopeId: 'd-external' })))
    expect(probation?.fieldErrors.map((error) => error.field)).toContain('userId')
    const otherDepartment = await fail(orgRepository.assign('c-guitar', assignRequest({ userId: 'u-vy' })))
    expect(otherDepartment?.fieldErrors.map((error) => error.field)).toContain('userId')
  })

  it('lets a new department head assign work right away (BR-TASK-01)', async () => {
    signInAs('u-anh')
    const position = await orgRepository.assign('c-guitar', assignRequest())
    expect(position).toMatchObject({ role: 'DEPARTMENT_HEAD', scope: { type: 'DEPARTMENT', name: 'Thiết kế' }, holder: { id: 'u-hieu' } })
    expect((await fail(orgRepository.assign('c-guitar', assignRequest())))?.status).toBe(409)

    signInAs('u-hieu')
    expect((await clubRepository.getClub('c-guitar')).allowedActions).toContain('ASSIGN_TASK')
    expect((await taskRepository.assignableScopes('c-guitar')).map((scope) => scope.id)).toEqual(['d-design'])
  })

  it('keeps dates inside the running term', async () => {
    signInAs('u-anh')
    const late = await fail(orgRepository.assign('c-guitar', assignRequest({ endOn: '2099-01-01' })))
    expect(late?.fieldErrors.map((error) => error.field)).toEqual(['endOn'])
    const early = await fail(orgRepository.assign('c-guitar', assignRequest({ startOn: '2000-01-01' })))
    expect(early?.fieldErrors.map((error) => error.field)).toEqual(['startOn'])
  })

  it('lets only the president and vice president assign those two roles mid-term (SRS 3.2, NFR-SEC-03)', async () => {
    const vicePresident = assignRequest({ role: 'VICE_PRESIDENT', scopeId: 'c-guitar' })
    signInAs('u-mai')
    expect((await clubRepository.getClub('c-guitar')).allowedActions).not.toContain('ASSIGN_PRESIDENCY')
    expect((await fail(orgRepository.candidates('c-guitar', 'PRESIDENT', 'c-guitar')))?.status).toBe(403)
    expect((await fail(orgRepository.candidates('c-guitar', 'VICE_PRESIDENT', 'c-guitar')))?.status).toBe(403)
    const before = db.positions.length
    const refused = await fail(orgRepository.assign('c-guitar', vicePresident))
    expect(refused?.status).toBe(403)
    expect(refused?.detail).toContain('Chỉ Chủ nhiệm, Phó chủ nhiệm')
    expect(db.positions.length).toBe(before)
    expect((await orgRepository.assign('c-guitar', assignRequest())).role).toBe('DEPARTMENT_HEAD')
    expect((await orgRepository.assign('c-guitar', assignRequest({ userId: 'u-long', role: 'TREASURER', scopeId: 'c-guitar' }))).role).toBe('TREASURER')

    signInAs('u-huy')
    expect((await clubRepository.getClub('c-guitar')).allowedActions).toContain('ASSIGN_PRESIDENCY')
    expect(await orgRepository.assign('c-guitar', vicePresident)).toMatchObject({ role: 'VICE_PRESIDENT', holder: { id: 'u-hieu' } })
  })

  it('gives no presidency rights to a vice president who has not started yet', async () => {
    signInAs('u-anh')
    await orgRepository.assign('c-guitar', assignRequest({ role: 'VICE_PRESIDENT', scopeId: 'c-guitar', startOn: vnDate(3) }))
    signInAs('u-hieu')
    expect((await clubRepository.getClub('c-guitar')).allowedActions).not.toContain('ASSIGN_PRESIDENCY')
  })

  it('refuses members outside the board, with the reason', async () => {
    signInAs('u-ha')
    const error = await fail(orgRepository.assign('c-guitar', assignRequest()))
    expect(error?.status).toBe(403)
    expect(error?.detail).toContain('ban chủ nhiệm')
  })
})

describe('revoking positions (FR-ORG-03, BR-ORG-02)', () => {
  it('ends a position from the handover day and keeps the record', async () => {
    signInAs('u-anh')
    const id = positionId('u-linh', 'DEPARTMENT_HEAD', 'd-media')
    const noReason = await fail(orgRepository.revoke('c-guitar', id, { reason: '', handoverOn: vnDate(0), version: 1 }))
    expect(noReason?.fieldErrors.map((error) => error.field)).toContain('reason')
    const past = await fail(orgRepository.revoke('c-guitar', id, { reason: 'Bàn giao cho người mới.', handoverOn: vnDate(-1), version: 1 }))
    expect(past?.fieldErrors.map((error) => error.field)).toContain('handoverOn')

    await orgRepository.revoke('c-guitar', id, { reason: 'Bàn giao cho người mới.', handoverOn: vnDate(0), version: 1 })
    expect(hasPosition('u-linh', 'DEPARTMENT_HEAD', 'd-media')).toBe(false)
    expect(db.positions.find((position) => position.id === id)).toMatchObject({ endOn: vnDate(-1), revokeReason: 'Bàn giao cho người mới.' })
  })

  it('keeps at least one president, then allows the handover once a successor starts', async () => {
    signInAs('u-huy')
    const anh = positionId('u-anh', 'PRESIDENT', 'c-guitar')
    const blocked = await fail(orgRepository.revoke('c-guitar', anh, { reason: 'Hết nhiệm vụ.', handoverOn: vnDate(0), version: 1 }))
    expect(blocked?.code).toBe('LAST_PRESIDENT')

    await orgRepository.assign('c-guitar', assignRequest({ userId: 'u-bao', role: 'PRESIDENT', scopeId: 'c-guitar', startOn: vnDate(3) }))
    const tooEarly = await fail(orgRepository.revoke('c-guitar', anh, { reason: 'Hết nhiệm vụ.', handoverOn: vnDate(1), version: 1 }))
    expect(tooEarly?.code).toBe('LAST_PRESIDENT')
    const handedOver = await orgRepository.revoke('c-guitar', anh, { reason: 'Bàn giao chức Chủ nhiệm.', handoverOn: vnDate(3), version: 1 })
    expect(handedOver.endOn).toBe(vnDate(2))
  })
})

describe('the club never runs out of presidents (BR-ORG-02)', () => {
  it('refuses to revoke the successor once the handover has been agreed', async () => {
    signInAs('u-anh')
    const successor = await orgRepository.assign('c-guitar', assignRequest({ userId: 'u-bao', role: 'PRESIDENT', scopeId: 'c-guitar', startOn: vnDate(3) }))
    const anh = positionId('u-anh', 'PRESIDENT', 'c-guitar')
    await orgRepository.revoke('c-guitar', anh, { reason: 'Bàn giao chức Chủ nhiệm.', handoverOn: vnDate(3), version: 1 })
    const error = await fail(orgRepository.revoke('c-guitar', successor.id, { reason: 'Đổi ý không bàn giao.', handoverOn: vnDate(0), version: successor.version }))
    expect(error?.code).toBe('LAST_PRESIDENT')
  })

  it('refuses a handover to a co-president whose term ends early', async () => {
    signInAs('u-anh')
    await orgRepository.assign('c-guitar', assignRequest({ userId: 'u-bao', role: 'PRESIDENT', scopeId: 'c-guitar', endOn: vnDate(30) }))
    const anh = positionId('u-anh', 'PRESIDENT', 'c-guitar')
    const error = await fail(orgRepository.revoke('c-guitar', anh, { reason: 'Bàn giao chức Chủ nhiệm.', handoverOn: vnDate(0), version: 1 }))
    expect(error?.code).toBe('LAST_PRESIDENT')
  })

  it('blocks leave for someone holding a standing position that has not started yet (BR-MEM-05)', async () => {
    signInAs('u-anh')
    await orgRepository.assign('c-guitar', assignRequest({ userId: 'u-bao', role: 'VICE_PRESIDENT', scopeId: 'c-guitar', startOn: vnDate(3) }))
    const bao = db.memberships.find((membership) => membership.userId === 'u-bao' && membership.clubId === 'c-guitar')
    const error = await fail(memberRepository.transition('c-guitar', bao?.id ?? '', { action: 'PUT_ON_LEAVE', reason: 'Đi thực tập.', version: bao?.version ?? 1 }))
    expect(error?.code).toBe('HOLDS_STANDING_POSITION')
    expect(error?.detail).toContain('Phó chủ nhiệm (chưa hiệu lực)')
  })
})

describe('upcoming positions (FR-ORG-02, 03)', () => {
  it('lists a position before its start date and can revoke it so it never takes effect', async () => {
    signInAs('u-anh')
    const upcoming = await orgRepository.assign('c-guitar', assignRequest({ userId: 'u-bao', role: 'PRESIDENT', scopeId: 'c-guitar', startOn: vnDate(3) }))
    expect(upcoming).toMatchObject({ status: 'UPCOMING', allowedActions: ['REVOKE'] })
    const board = await orgRepository.positions('c-guitar', { scopeId: 'c-guitar' })
    expect(board.content.find((position) => position.id === upcoming.id)?.status).toBe('UPCOMING')
    expect(hasPosition('u-bao', 'PRESIDENT', 'c-guitar')).toBe(false)

    await orgRepository.revoke('c-guitar', upcoming.id, { reason: 'Gán nhầm ngày, gán lại sau.', handoverOn: vnDate(0), version: upcoming.version })
    expect((await orgRepository.positions('c-guitar', { scopeId: 'c-guitar' })).content.map((position) => position.id)).not.toContain(upcoming.id)
    expect((await orgRepository.candidates('c-guitar', 'PRESIDENT', 'c-guitar')).map((candidate) => candidate.id)).toContain('u-bao')
  })
})

describe('cancelling an upcoming position on its start date (FR-ORG-03)', () => {
  it('drops the record so the person can be assigned again or put on leave', async () => {
    signInAs('u-anh')
    const upcoming = await orgRepository.assign('c-guitar', assignRequest({ userId: 'u-bao', role: 'VICE_PRESIDENT', scopeId: 'c-guitar', startOn: vnDate(10) }))
    await orgRepository.revoke('c-guitar', upcoming.id, { reason: 'Đổi người nhận bàn giao.', handoverOn: vnDate(10), version: upcoming.version })

    expect((await orgRepository.positions('c-guitar', { scopeId: 'c-guitar' })).content.map((position) => position.id)).not.toContain(upcoming.id)
    expect((await orgRepository.candidates('c-guitar', 'VICE_PRESIDENT', 'c-guitar')).map((candidate) => candidate.id)).toContain('u-bao')
    const again = await orgRepository.assign('c-guitar', assignRequest({ userId: 'u-bao', role: 'VICE_PRESIDENT', scopeId: 'c-guitar', startOn: vnDate(10) }))
    expect(again.status).toBe('UPCOMING')
    await orgRepository.revoke('c-guitar', again.id, { reason: 'Không cần nữa.', handoverOn: vnDate(0), version: again.version })

    const bao = db.memberships.find((membership) => membership.userId === 'u-bao' && membership.clubId === 'c-guitar')
    const onLeave = await memberRepository.transition('c-guitar', bao?.id ?? '', { action: 'PUT_ON_LEAVE', reason: 'Đi thực tập.', version: bao?.version ?? 1 })
    expect(onLeave.status).toBe('ON_LEAVE')
  })
})

describe('departments (FR-ORG-01, BR-TERM-04, BR-MEM-06)', () => {
  it('creates, edits and closes a department without deleting it', async () => {
    signInAs('u-anh')
    const duplicate = await fail(orgRepository.createDepartment('c-guitar', { name: 'truyền thông', description: '' }))
    expect(duplicate?.fieldErrors.map((error) => error.field)).toEqual(['name'])

    const created = await orgRepository.createDepartment('c-guitar', { name: 'Hậu kỳ', description: 'Thu âm, dựng video.' })
    const stale = await fail(orgRepository.updateDepartment('c-guitar', created.id, { name: 'Hậu kỳ âm thanh', description: '', version: created.version + 1 }))
    expect(stale?.status).toBe(409)
    const renamed = await orgRepository.updateDepartment('c-guitar', created.id, { name: 'Hậu kỳ âm thanh', description: '', version: created.version })
    expect(renamed.name).toBe('Hậu kỳ âm thanh')

    const closed = await orgRepository.closeDepartment('c-guitar', created.id, { action: 'CLOSE', reason: 'Gộp vào ban Truyền thông.', version: renamed.version })
    expect(closed).toMatchObject({ status: 'CLOSED', closeReason: 'Gộp vào ban Truyền thông.', allowedActions: [] })
    expect((await orgRepository.departments('c-guitar', 'CLOSED')).map((department) => department.id)).toEqual(expect.arrayContaining([created.id, 'd-photo']))
    expect((await taskRepository.assignableScopes('c-guitar')).map((scope) => scope.id)).not.toContain(created.id)
    expect((await fail(orgRepository.updateDepartment('c-guitar', created.id, { name: 'Mở lại', description: '', version: closed.version })))?.status).toBe(422)
  })

  it('refuses to close a department that still has members or positions', async () => {
    signInAs('u-anh')
    const design = db.departments.find((department) => department.id === 'd-design')
    const withMembers = await fail(orgRepository.closeDepartment('c-guitar', 'd-design', { action: 'CLOSE', reason: 'Thử đóng ban.', version: design?.version ?? 1 }))
    expect(withMembers?.code).toBe('DEPARTMENT_NOT_EMPTY')
    expect(withMembers?.detail).toContain('còn 1 thành viên')
  })

  it('shows department leads and member counts to every member', async () => {
    signInAs('u-ha')
    const departments = await orgRepository.departments('c-guitar', 'ACTIVE')
    const media = departments.find((department) => department.id === 'd-media')
    expect(media).toMatchObject({ memberCount: 4, allowedActions: [] })
    expect(media?.leads.map((lead) => lead.holder.fullName)).toEqual(['Đặng Khánh Linh'])
    expect(departments.find((department) => department.id === 'd-design')?.leads).toEqual([])
  })

  it('reports open, overdue and due-soon work per department for the chart (FR-ORG-07)', async () => {
    signInAs('u-ha')
    const byId = new Map((await orgRepository.departments('c-guitar', 'ACTIVE')).map((department) => [department.id, department]))
    expect(byId.get('d-media')?.overdueTaskCount).toBeGreaterThan(0)
    expect(byId.get('d-music')).toMatchObject({ overdueTaskCount: 0, dueSoonTaskCount: 1 })
    expect(byId.get('d-external')).toMatchObject({ openTaskCount: 1, overdueTaskCount: 0, dueSoonTaskCount: 0 })
    expect(byId.get('d-design')).toMatchObject({ openTaskCount: 0 })
  })
})
