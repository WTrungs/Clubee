import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { vnDate } from '@/api/mocks/mockTime'
import { generalFundId } from '@/api/mocks/seed/financeSeed'
import { clubRepository } from '@/features/club/model/clubRepository'
import { financeRepository } from '@/features/finance/model/financeRepository'
import { memberRepository } from '@/features/member/model/memberRepository'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { taskRepository } from '@/features/task/model/taskRepository'
import { signInAs } from '@/testUtils'
import { orgRepository } from '../model/orgRepository'
import type { PermissionChange } from '../model/permissionTypes'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
/** Nhật ký sửa bảng phân quyền; seed có sẵn nhật ký loại khác (gán chức vụ, giao dịch). */
const permissionLogs = () => db.auditLogs.filter((log) => log.objectType === 'PERMISSION')
const cell = (matrix: Awaited<ReturnType<typeof orgRepository.permissionMatrix>>, role: string, permission: string) =>
  matrix.cells.find((candidate) => candidate.role === role && candidate.permission === permission)
const save = async (userId: string, changes: PermissionChange[]) => {
  signInAs(userId)
  const matrix = await orgRepository.permissionMatrix('c-guitar')
  return orgRepository.updatePermissionMatrix('c-guitar', { changes, version: matrix.version })
}
const income = () =>
  financeRepository.create('c-guitar', { fundId: generalFundId('c-guitar'), type: 'INCOME', amount: 100_000, category: 'MEMBER_DUES', description: 'Thu quỹ tháng', occurredOn: vnDate(0), attachmentIds: [] })

describe('viewing the permission matrix (FR-ORG-05)', () => {
  it('shows each cell state to the viewer and lets only those who may edit change it', async () => {
    signInAs('u-anh')
    const matrix = await orgRepository.permissionMatrix('c-guitar')
    expect(matrix).toMatchObject({ version: 1, changedFromDefault: 0, allowedActions: ['EDIT', 'RESET'] })
    expect(matrix.cells).toHaveLength(16 * 7)
    expect(cell(matrix, 'PRESIDENT', 'MANAGE_MEMBERS')).toMatchObject({ state: 'OWN_ROLE', enabled: true })
    expect(cell(matrix, 'PRESIDENT', 'EDIT_PERMISSIONS')).toMatchObject({ state: 'LOCKED', lockReason: expect.stringContaining('Chủ nhiệm luôn giữ') })
    expect(cell(matrix, 'EVENT_LEAD', 'APPROVE_EXPENSE')).toMatchObject({ state: 'LOCKED', enabled: false })
    expect(cell(matrix, 'DEPARTMENT_HEAD', 'CONFIGURE_CLUB')).toMatchObject({ state: 'NOT_APPLICABLE' })
    expect(cell(matrix, 'TREASURER', 'MANAGE_MEMBERS')).toMatchObject({ state: 'EDITABLE', enabled: true })
    expect((await clubRepository.getClub('c-guitar')).allowedActions).toContain('VIEW_PERMISSIONS')

    // Thủ quỹ xem được nhưng không có quyền chỉnh bảng phân quyền; thành viên thường không xem được.
    signInAs('u-mai')
    expect((await orgRepository.permissionMatrix('c-guitar')).allowedActions).toEqual([])
    expect(await fail(orgRepository.updatePermissionMatrix('c-guitar', { changes: [{ role: 'DEPARTMENT_HEAD', permission: 'ASSIGN_TASK', enabled: false }], version: 1 }))).toMatchObject({ status: 403 })
    expect(await fail(orgRepository.resetPermissionMatrix('c-guitar', 1))).toMatchObject({ status: 403 })
    // NFR-SEC-03: bị từ chối thì dữ liệu không đổi.
    expect(db.permissionOverrides).toEqual([])
    expect(permissionLogs()).toEqual([])
    expect((await orgRepository.permissionMatrix('c-guitar')).version).toBe(1)
    signInAs('u-ha')
    expect(await fail(orgRepository.permissionMatrix('c-guitar'))).toMatchObject({ status: 403, detail: 'Chỉ ban chủ nhiệm xem được bảng phân quyền.' })
    expect((await clubRepository.getClub('c-guitar')).allowedActions).not.toContain('VIEW_PERMISSIONS')
  })
})

describe('editing the matrix (FR-ORG-05, BR-ACL-01..05)', () => {
  it('takes effect at once: the treasurer loses member management, gets told, and the change is logged', async () => {
    const saved = await save('u-anh', [{ role: 'TREASURER', permission: 'MANAGE_MEMBERS', enabled: false }])
    expect(saved).toMatchObject({ version: 2, changedFromDefault: 1, updatedBy: { id: 'u-anh' } })
    expect(db.auditLogs.at(-1)).toMatchObject({ action: 'CHANGE_PERMISSION', objectId: 'TREASURER:MANAGE_MEMBERS', before: { enabled: true }, after: { enabled: false } })

    signInAs('u-mai')
    expect((await clubRepository.getClub('c-guitar')).allowedActions).not.toContain('MANAGE_MEMBERS')
    expect(await fail(memberRepository.joinRequests('c-guitar', {}))).toMatchObject({ status: 403, detail: 'Chỉ Chủ nhiệm hoặc Phó chủ nhiệm được xem yêu cầu gia nhập.' })
    const [latest] = (await notificationRepository.list({ category: 'POSITION' })).content
    expect(latest).toMatchObject({ title: 'Quyền của Thủ quỹ ở CLB Guitar Sinh viên vừa thay đổi' })
    expect((await notificationRepository.get(latest?.id ?? '')).body).toBe('Bị bỏ: Quản lý thành viên.')
  })

  it('refuses the own row (BR-ACL-03) but lets the vice president edit the president row except locked cells (BR-ACL-04)', async () => {
    signInAs('u-anh')
    expect(await fail(orgRepository.updatePermissionMatrix('c-guitar', { changes: [{ role: 'PRESIDENT', permission: 'RECORD_LEDGER', enabled: true }], version: 1 }))).toMatchObject({
      status: 403,
      code: 'OWN_ROLE',
    })
    signInAs('u-anh')
    expect(await fail(income())).toMatchObject({ status: 403 })

    await save('u-huy', [{ role: 'PRESIDENT', permission: 'RECORD_LEDGER', enabled: true }])
    signInAs('u-anh')
    expect((await income()).status).toBe('POSTED')

    signInAs('u-huy')
    const locked = await fail(orgRepository.updatePermissionMatrix('c-guitar', { changes: [{ role: 'PRESIDENT', permission: 'EDIT_PERMISSIONS', enabled: false }], version: 2 }))
    expect(locked).toMatchObject({ status: 422, code: 'PERMISSION_LOCKED', fieldErrors: [{ field: 'changes[0]', message: expect.stringContaining('Chủ nhiệm luôn giữ') }] })
  })

  it('rejects locked and meaningless cells all or nothing (BR-ACL-02, 05) and a stale version', async () => {
    signInAs('u-anh')
    const changes: PermissionChange[] = [
      { role: 'TREASURER', permission: 'CREATE_EVENT', enabled: false },
      { role: 'EVENT_LEAD', permission: 'APPROVE_EXPENSE', enabled: true },
      { role: 'SUBCOMMITTEE_LEAD', permission: 'APPROVE_EXPENSE', enabled: true },
    ]
    const error = await fail(orgRepository.updatePermissionMatrix('c-guitar', { changes, version: 1 }))
    expect(error).toMatchObject({ status: 422 })
    expect(error?.fieldErrors.map((fieldError) => fieldError.field)).toEqual(['changes[1]', 'changes[2]'])
    expect(db.permissionOverrides).toEqual([])
    expect(await fail(orgRepository.updatePermissionMatrix('c-guitar', { changes: changes.slice(0, 1), version: 0 }))).toMatchObject({ status: 409 })
  })

  it('never lets a proposer approve their own expense, whatever the matrix says (BR-ACL-01)', async () => {
    await save('u-huy', [{ role: 'PRESIDENT', permission: 'RECORD_LEDGER', enabled: true }])
    signInAs('u-anh')
    const own = await financeRepository.create('c-guitar', { fundId: generalFundId('c-guitar'), type: 'EXPENSE', amount: 50_000, category: 'PRINTING', description: 'In thẻ', attachmentIds: [] })
    expect(await fail(financeRepository.transition('c-guitar', own.id, { action: 'APPROVE', version: own.version }))).toMatchObject({ status: 403, code: 'SELF_APPROVAL' })
  })

  it('keeps a subcommittee lead permission inside that subcommittee when switched back on (BR-ACL-02)', async () => {
    const subcommitteeScopes = async () => {
      signInAs('u-long')
      return (await taskRepository.assignableScopes('c-guitar')).filter((scope) => scope.type === 'SUBCOMMITTEE').map((scope) => scope.id)
    }
    expect(await subcommitteeScopes()).toEqual(['sc-winter-logistics'])
    await save('u-anh', [{ role: 'SUBCOMMITTEE_LEAD', permission: 'ASSIGN_TASK', enabled: false }])
    expect(await subcommitteeScopes()).toEqual([])
    await save('u-anh', [{ role: 'SUBCOMMITTEE_LEAD', permission: 'ASSIGN_TASK', enabled: true }])
    expect(await subcommitteeScopes()).toEqual(['sc-winter-logistics'])
  })

  it('rejects an empty, oversized, duplicated or malformed batch with 400', async () => {
    signInAs('u-anh')
    const put = (changes: unknown[]) => fail(orgRepository.updatePermissionMatrix('c-guitar', { changes: changes as PermissionChange[], version: 1 }))
    const one: PermissionChange = { role: 'TREASURER', permission: 'MANAGE_MEMBERS', enabled: false }
    expect(await put([])).toMatchObject({ status: 400, detail: 'Chưa có thay đổi nào để lưu.' })
    expect(await put(Array.from({ length: 113 }, () => one))).toMatchObject({ status: 400, detail: 'Mỗi lần lưu tối đa 112 ô.' })
    expect(await put([one, one])).toMatchObject({ status: 400, fieldErrors: [{ field: 'changes', message: 'Có ô bị lặp.' }] })
    expect(await put([one, { role: 'MEMBER', permission: 'MANAGE_MEMBERS', enabled: true }])).toMatchObject({ status: 400, fieldErrors: [{ field: 'changes[1]' }] })
    expect(db.permissionOverrides).toEqual([])
  })

  it('does not bump the version when nothing changes', async () => {
    const saved = await save('u-anh', [{ role: 'TREASURER', permission: 'MANAGE_MEMBERS', enabled: true }])
    expect(saved.version).toBe(1)
    expect(permissionLogs()).toEqual([])
  })
})

describe('resetting and history (FR-ORG-05)', () => {
  it('resets what the caller may edit, keeps their own row, and lists changes with before and after', async () => {
    await save('u-huy', [{ role: 'PRESIDENT', permission: 'RECORD_LEDGER', enabled: true }])
    await save('u-anh', [{ role: 'TREASURER', permission: 'MANAGE_MEMBERS', enabled: false }])

    // Chủ nhiệm khôi phục: ô của Thủ quỹ về mặc định, ô của hàng Chủ nhiệm (do Phó chủ nhiệm sửa) vẫn lệch.
    signInAs('u-anh')
    const matrix = await orgRepository.permissionMatrix('c-guitar')
    const reset = await orgRepository.resetPermissionMatrix('c-guitar', matrix.version)
    expect(reset.changedFromDefault).toBe(1)
    expect(cell(reset, 'TREASURER', 'MANAGE_MEMBERS')?.enabled).toBe(true)
    expect(cell(reset, 'PRESIDENT', 'RECORD_LEDGER')?.enabled).toBe(true)
    expect(await fail(orgRepository.resetPermissionMatrix('c-guitar', matrix.version))).toMatchObject({ status: 409 })

    const history = await orgRepository.permissionChanges('c-guitar', {})
    expect(history.content.map((change) => [change.role, change.permission, change.before, change.after, change.reset])).toEqual([
      ['TREASURER', 'MANAGE_MEMBERS', false, true, true],
      ['TREASURER', 'MANAGE_MEMBERS', true, false, false],
      ['PRESIDENT', 'RECORD_LEDGER', false, true, false],
    ])
    signInAs('u-ha')
    expect(await fail(orgRepository.permissionChanges('c-guitar', {}))).toMatchObject({ status: 403 })
  })
})
