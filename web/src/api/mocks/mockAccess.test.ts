import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { clubRepository } from '@/features/club/model/clubRepository'
import { memberRepository } from '@/features/member/model/memberRepository'
import { PERMISSION_KEYS, type PermissionKey } from '@/features/org/model/permissionTypes'
import { signInAs } from '@/testUtils'
import { db, type PositionRole } from './db'
import { can, canAnywhere, forbidden, holdersOf, MATRIX_ROLES, roleAllows } from './mockAccess'
import { assignableScopes } from './mockScopes'
import { nowIso, vnDate } from './mockTime'

const guitar = 'c-guitar'

function override(role: PositionRole, permission: PermissionKey, enabled: boolean, clubId = guitar) {
  db.permissionOverrides.push({ clubId, role, permission, enabled, updatedBy: 'u-anh', updatedAt: nowIso() })
}

function membershipOf(userId: string) {
  const membership = db.memberships.find((candidate) => candidate.userId === userId && candidate.clubId === guitar)
  if (!membership) throw new Error(`Thiếu tư cách của ${userId}`)
  return membership
}

const expectedDefaults: Record<PositionRole, PermissionKey[]> = {
  PRESIDENT: PERMISSION_KEYS.filter((key) => key !== 'RECORD_LEDGER'),
  VICE_PRESIDENT: PERMISSION_KEYS.filter((key) => key !== 'RECORD_LEDGER'),
  TREASURER: PERMISSION_KEYS.filter((key) => key !== 'EDIT_PERMISSIONS'),
  DEPARTMENT_HEAD: ['ASSIGN_TASK', 'MANAGE_SESSIONS', 'SEND_ANNOUNCEMENT', 'MANAGE_DOCUMENTS', 'PROPOSE_EXPENSE'],
  DEPARTMENT_VICE_HEAD: ['ASSIGN_TASK', 'MANAGE_SESSIONS', 'SEND_ANNOUNCEMENT', 'MANAGE_DOCUMENTS', 'PROPOSE_EXPENSE'],
  EVENT_LEAD: ['RUN_EVENT', 'MANAGE_EVENT_STAFF', 'ASSIGN_TASK', 'SEND_ANNOUNCEMENT', 'MANAGE_DOCUMENTS', 'PROPOSE_EXPENSE'],
  SUBCOMMITTEE_LEAD: ['MANAGE_EVENT_STAFF', 'ASSIGN_TASK'],
}

describe('default permission matrix (SRS 3.2)', () => {
  it.each(MATRIX_ROLES)('grants %s exactly its default permissions', (role) => {
    expect(PERMISSION_KEYS.filter((permission) => roleAllows(guitar, role, permission))).toEqual(expectedDefaults[role])
  })
})

describe('scope of a permission (SRS 3.1, BR-ACL-02)', () => {
  it('lets the board act anywhere in its own club only (BR-SEC-01)', () => {
    expect(can('u-anh', guitar, 'ASSIGN_TASK', { type: 'DEPARTMENT', id: 'd-logistics' })).toBe(true)
    expect(can('u-mai', guitar, 'MANAGE_EVENT_STAFF', { type: 'SUBCOMMITTEE', id: 'sc-winter-media' })).toBe(true)
    expect(can('u-anh', 'c-english', 'CONFIGURE_CLUB')).toBe(false)
    expect(can('u-anh', guitar, 'ASSIGN_TASK', { type: 'DEPARTMENT', id: 'd-en-content' })).toBe(false)
    expect(can('u-anh', guitar, 'RUN_EVENT', { type: 'EVENT', id: 'e-speaking' })).toBe(false)
    expect(holdersOf(guitar, 'RUN_EVENT', { type: 'EVENT', id: 'e-speaking' })).toEqual([])
  })

  it('keeps an event lead inside the own event and its subcommittees', () => {
    expect(can('u-bao', guitar, 'RUN_EVENT', { type: 'EVENT', id: 'e-winter' })).toBe(true)
    expect(can('u-bao', guitar, 'MANAGE_EVENT_STAFF', { type: 'SUBCOMMITTEE', id: 'sc-winter-media' })).toBe(true)
    expect(can('u-bao', guitar, 'RUN_EVENT', { type: 'EVENT', id: 'e-workshop' })).toBe(false)
    expect(can('u-bao', guitar, 'ASSIGN_TASK', { type: 'DEPARTMENT', id: 'd-music' })).toBe(false)
    expect(can('u-bao', guitar, 'RUN_EVENT')).toBe(false)
  })

  it('keeps department and subcommittee leads inside their own unit, without reaching the parent', () => {
    expect(can('u-linh', guitar, 'ASSIGN_TASK', { type: 'DEPARTMENT', id: 'd-media' })).toBe(true)
    expect(can('u-linh', guitar, 'ASSIGN_TASK', { type: 'DEPARTMENT', id: 'd-logistics' })).toBe(false)
    expect(can('u-linh', guitar, 'ASSIGN_TASK')).toBe(false)
    expect(can('u-long', guitar, 'MANAGE_EVENT_STAFF', { type: 'SUBCOMMITTEE', id: 'sc-winter-logistics' })).toBe(true)
    expect(can('u-long', guitar, 'MANAGE_EVENT_STAFF', { type: 'SUBCOMMITTEE', id: 'sc-winter-media' })).toBe(false)
    expect(can('u-long', guitar, 'MANAGE_EVENT_STAFF', { type: 'EVENT', id: 'e-winter' })).toBe(false)
  })

  it('finds a permission held at any scope when asked for one', () => {
    expect(canAnywhere('u-linh', guitar, 'PROPOSE_EXPENSE')).toBe(true)
    expect(canAnywhere('u-bao', guitar, 'PROPOSE_EXPENSE', ['DEPARTMENT_HEAD', 'DEPARTMENT_VICE_HEAD'])).toBe(false)
    expect(canAnywhere('u-tram', guitar, 'PROPOSE_EXPENSE')).toBe(false)
  })
})

describe('permissions follow the holder and the position (BR-MEM-04, 05, BR-ORG-03)', () => {
  it('drops permissions when the holder leaves, goes on leave or the position expires', () => {
    membershipOf('u-huy').status = 'LEFT'
    expect(can('u-huy', guitar, 'CREATE_EVENT')).toBe(false)
    membershipOf('u-linh').status = 'ON_LEAVE'
    expect(can('u-linh', guitar, 'ASSIGN_TASK', { type: 'DEPARTMENT', id: 'd-media' })).toBe(false)
    const treasurer = db.positions.find((position) => position.userId === 'u-mai' && position.role === 'TREASURER')
    if (treasurer) Object.assign(treasurer, { endOn: vnDate(-1) })
    expect(can('u-mai', guitar, 'RECORD_LEDGER')).toBe(false)
  })

  it('drops event permissions once the event is closed', () => {
    expect(canAnywhere('u-bao', guitar, 'PROPOSE_EXPENSE')).toBe(true)
    const winter = db.events.find((event) => event.id === 'e-winter')
    if (winter) winter.status = 'CLOSED'
    expect(can('u-bao', guitar, 'RUN_EVENT', { type: 'EVENT', id: 'e-winter' })).toBe(false)
    expect(canAnywhere('u-bao', guitar, 'PROPOSE_EXPENSE')).toBe(false)
    expect(can('u-long', guitar, 'ASSIGN_TASK', { type: 'SUBCOMMITTEE', id: 'sc-winter-logistics' })).toBe(false)
  })
})

describe('club overrides (FR-ORG-05)', () => {
  it('turns a default on or off for one club only', () => {
    override('TREASURER', 'MANAGE_MEMBERS', false)
    override('PRESIDENT', 'RECORD_LEDGER', true)
    expect(can('u-mai', guitar, 'MANAGE_MEMBERS')).toBe(false)
    expect(can('u-huy', guitar, 'MANAGE_MEMBERS')).toBe(true)
    expect(can('u-anh', guitar, 'RECORD_LEDGER')).toBe(true)
    expect(can('u-tu', 'c-english', 'RECORD_LEDGER')).toBe(false)
  })

  it('ignores overrides of locked cells and of cells outside the role scope (BR-ACL-02, 04, 05)', () => {
    override('PRESIDENT', 'ASSIGN_POSITIONS', false)
    override('PRESIDENT', 'EDIT_PERMISSIONS', false)
    override('EVENT_LEAD', 'APPROVE_EXPENSE', true)
    override('DEPARTMENT_HEAD', 'APPROVE_EXPENSE', true)
    expect(can('u-anh', guitar, 'ASSIGN_POSITIONS')).toBe(true)
    expect(can('u-anh', guitar, 'EDIT_PERMISSIONS')).toBe(true)
    expect(can('u-bao', guitar, 'APPROVE_EXPENSE', { type: 'EVENT', id: 'e-winter' })).toBe(false)
    expect(canAnywhere('u-linh', guitar, 'APPROVE_EXPENSE')).toBe(false)
  })

  it('unions the remaining positions of a person holding several (SRS 3.1)', () => {
    override('DEPARTMENT_HEAD', 'ASSIGN_TASK', false)
    const scopes = assignableScopes('u-linh', guitar).map((scope) => scope.id)
    expect(scopes).not.toContain('d-media')
    expect(scopes).toContain('sc-winter-media')
  })

  it('applies at once to what the server allows and refuses', async () => {
    override('TREASURER', 'MANAGE_MEMBERS', false)
    signInAs('u-mai')
    const club = await clubRepository.getClub(guitar)
    expect(club.allowedActions).not.toContain('MANAGE_MEMBERS')
    expect(club.allowedActions).toContain('EDIT_CLUB')
    const refused = await memberRepository.joinRequests(guitar, {}).catch((error: ApiError) => error)
    expect(refused).toMatchObject({ status: 403, message: 'Chỉ Chủ nhiệm hoặc Phó chủ nhiệm được xem yêu cầu gia nhập.' })
  })
})

describe('who holds a permission', () => {
  it('lists the people to notify', () => {
    expect(holdersOf(guitar, 'APPROVE_EXPENSE').toSorted()).toEqual(['u-anh', 'u-huy', 'u-mai'])
    expect(holdersOf(guitar, 'RECORD_LEDGER')).toEqual(['u-mai'])
    expect(holdersOf(guitar, 'APPROVE_EXPENSE', { type: 'EVENT', id: 'e-winter' })).not.toContain('u-bao')
    override('TREASURER', 'APPROVE_EXPENSE', false)
    expect(holdersOf(guitar, 'APPROVE_EXPENSE').toSorted()).toEqual(['u-anh', 'u-huy'])
  })

  it('names the roles allowed in the refusal message, among those reaching the scope (IF-01)', async () => {
    const detail = async (response: Response) => ((await response.json()) as { detail: string }).detail
    const winter = { type: 'EVENT', id: 'e-winter' } as const
    expect(await detail(forbidden(guitar, 'MANAGE_MEMBERS', 'duyệt thành viên'))).toBe('Chỉ ban chủ nhiệm được duyệt thành viên.')
    expect(await detail(forbidden(guitar, 'RECORD_LEDGER', 'ghi khoản thu'))).toBe('Chỉ Thủ quỹ được ghi khoản thu.')
    expect(await detail(forbidden(guitar, 'RUN_EVENT', 'đóng sự kiện', winter))).toBe('Chỉ ban chủ nhiệm hoặc Trưởng BTC được đóng sự kiện.')
    expect(await detail(forbidden(guitar, 'MANAGE_EVENT_STAFF', 'lập tiểu ban', winter))).toBe('Chỉ ban chủ nhiệm hoặc Trưởng BTC được lập tiểu ban.')
    expect(await detail(forbidden(guitar, 'MANAGE_EVENT_STAFF', 'mời nhân sự', { type: 'SUBCOMMITTEE', id: 'sc-winter-media' }))).toBe(
      'Chỉ ban chủ nhiệm, Trưởng BTC hoặc Trưởng tiểu ban được mời nhân sự.',
    )
    override('EVENT_LEAD', 'RUN_EVENT', false)
    expect(await detail(forbidden(guitar, 'RUN_EVENT', 'mở đăng ký', winter))).toBe('Chỉ ban chủ nhiệm được mở đăng ký.')
    override('TREASURER', 'RECORD_LEDGER', false)
    expect(await detail(forbidden(guitar, 'RECORD_LEDGER', 'ghi khoản thu'))).toBe('Hiện không chức vụ nào ở CLB được ghi khoản thu.')
  })
})
