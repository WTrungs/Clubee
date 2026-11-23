import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { routeHandlers } from '@/api/mocks/handlers'
import { audit } from '@/api/mocks/mockAudit'
import { vnDate, vnDayAt } from '@/api/mocks/mockTime'
import { toVnDateKey } from '@/shared/format/formatDate'
import { signInAs } from '@/testUtils'
import { auditLogRepository } from '../model/auditLogRepository'
import { auditChanges, auditActionLabel, formatAuditValue } from './auditDisplay'
import { parseLogRange } from './useAuditLogViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const adminLog = (id: string, clubId: string | null, at: string) => ({
  id,
  at,
  actorId: 'u-admin',
  actorName: 'Quản trị hệ thống',
  clubId,
  action: 'APPROVE_PRESIDENCY_TRANSFER',
  objectType: 'TRANSFER_REQUEST' as const,
  objectId: 'tr-x',
  objectLabel: 'Chuyển quyền Chủ nhiệm',
  before: { presidents: ['u-anh'] },
  after: { presidents: ['u-huy'] },
  reason: 'Chủ nhiệm cũ không còn hoạt động.',
  names: { 'u-anh': 'Nguyễn Minh Anh', 'u-huy': 'Phạm Gia Huy' },
})

describe('audit log view (FR-RPT-06, NFR-SEC-05)', () => {
  it('lists only this club, newest first, 50 a page, with names captured when written', async () => {
    signInAs('u-anh')
    const page = await auditLogRepository.list('c-guitar', {})
    const guitar = db.auditLogs.filter((log) => log.clubId === 'c-guitar')
    expect(page.totalElements).toBe(guitar.length)
    expect(page.size).toBe(50)
    expect(page.content.every((entry, index, all) => index === 0 || (all[index - 1]?.at ?? '') >= entry.at)).toBe(true)
    const user = db.users.find((candidate) => candidate.id === page.content[0]?.actor.id)
    if (user) user.fullName = 'Tên mới'
    expect((await auditLogRepository.list('c-guitar', {})).content[0]?.actor.fullName).not.toBe('Tên mới')
  })

  it('filters by person, object type, object and day range (Vietnam days, both ends)', async () => {
    signInAs('u-anh')
    const byMai = await auditLogRepository.list('c-guitar', { actorId: 'u-mai', size: 200 })
    expect(byMai.content.length).toBeGreaterThan(0)
    expect(byMai.content.every((entry) => entry.actor.id === 'u-mai')).toBe(true)
    const transactions = await auditLogRepository.list('c-guitar', { objectType: 'TRANSACTION', size: 200 })
    expect(transactions.content.every((entry) => entry.objectType === 'TRANSACTION')).toBe(true)
    const one = transactions.content[0]
    const ofObject = await auditLogRepository.list('c-guitar', { objectId: one?.objectId, size: 200 })
    expect(ofObject.content.every((entry) => entry.objectId === one?.objectId)).toBe(true)
    // 00:30 giờ Việt Nam còn là hôm trước theo UTC nhưng phải tính vào ngày Việt Nam.
    db.auditLogs.push({ ...adminLog('log-late', 'c-guitar', vnDayAt(-3, 0, 30)), actorId: 'u-anh' })
    const day = await auditLogRepository.list('c-guitar', { from: vnDate(-3), to: vnDate(-3), size: 200 })
    expect(day.content.map((entry) => entry.id)).toContain('log-late')
    expect(day.content.every((entry) => toVnDateKey(entry.at) === vnDate(-3))).toBe(true)
  })

  it('shows Admin actions only where they concern this club, with the names they mention', async () => {
    db.auditLogs.push(adminLog('log-admin-guitar', 'c-guitar', vnDayAt(0, 8)), adminLog('log-admin-system', null, vnDayAt(0, 9)), adminLog('log-admin-english', 'c-english', vnDayAt(0, 9)))
    signInAs('u-anh')
    const ids = (await auditLogRepository.list('c-guitar', { size: 200 })).content.map((entry) => entry.id)
    expect(ids).toContain('log-admin-guitar')
    expect(ids).not.toContain('log-admin-system')
    expect(ids).not.toContain('log-admin-english')
    const entry = (await auditLogRepository.list('c-guitar', { actorId: 'u-admin' })).content[0]
    expect(entry?.names).toMatchObject({ 'u-anh': 'Nguyễn Minh Anh', 'u-huy': expect.any(String) })
    expect((await auditLogRepository.actors('c-guitar')).map((actor) => actor.id)).toContain('u-admin')
  })

  it('keeps the names mentioned in a change as they were when written (BR-DATA-02)', async () => {
    audit({ actorId: 'u-anh', clubId: 'c-guitar', action: 'HANDOVER_SUBSTITUTE_CONFIRM', objectType: 'HANDOVER_ITEM', objectId: 'hi-x', objectLabel: 'Mục bàn giao', before: { status: 'PENDING' }, after: { status: 'CONFIRMED', eventLead: 'u-huy' }, reason: 'Người cũ không phản hồi.' })
    const huy = db.users.find((user) => user.id === 'u-huy')
    if (huy) huy.fullName = 'Tên đã đổi'
    signInAs('u-anh')
    const entry = (await auditLogRepository.list('c-guitar', { objectId: 'hi-x' })).content[0]
    expect(entry?.names).toEqual({ 'u-huy': 'Phạm Gia Huy' })
  })

  it('is for the board only, checks filters, and has no route to change or delete', async () => {
    signInAs('u-linh')
    expect(await fail(auditLogRepository.list('c-guitar', {}))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    expect(await fail(auditLogRepository.actors('c-guitar'))).toMatchObject({ status: 403 })
    signInAs('u-tu')
    expect(await fail(auditLogRepository.list('c-guitar', {}))).toMatchObject({ status: 403, code: 'NOT_A_MEMBER' })
    signInAs('u-anh')
    expect(await fail(auditLogRepository.list('c-guitar', { from: vnDate(0), to: vnDate(-1) }))).toMatchObject({ status: 400 })
    expect(await fail(auditLogRepository.list('c-guitar', { objectType: 'NOPE' as never }))).toMatchObject({ status: 400 })
    const auditRoutes = routeHandlers.filter((handler) => 'info' in handler && String((handler.info as { path: unknown }).path).includes('audit-log'))
    expect(auditRoutes.map((handler) => (handler.info as { method: unknown }).method)).toEqual(['GET', 'GET'])
  })

  it('lists people who acted, including those who left', async () => {
    signInAs('u-anh')
    const actors = await auditLogRepository.actors('c-guitar')
    expect(actors.map((actor) => actor.fullName)).toEqual(actors.map((actor) => actor.fullName).toSorted((a, b) => a.localeCompare(b, 'vi')))
    const left = db.memberships.find((membership) => membership.clubId === 'c-guitar' && membership.status === 'LEFT' && db.auditLogs.some((log) => log.clubId === 'c-guitar' && log.actorId === membership.userId))
    if (left) expect(actors.map((actor) => actor.id)).toContain(left.userId)
    expect((await auditLogRepository.actors('c-guitar', 'mai')).every((actor) => actor.fullName.toLowerCase().includes('mai'))).toBe(true)
  })
})

describe('audit display (FR-RPT-06)', () => {
  const entry = { objectType: 'MEMBERSHIP' as const, names: { 'u-huy': 'Phạm Gia Huy' } }

  it('labels actions, values and fields in Vietnamese', () => {
    expect(auditActionLabel('CHANGE_MEMBER_STATUS')).toBe('Đổi trạng thái thành viên')
    expect(auditActionLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW')
    expect(formatAuditValue(entry, 'status', 'PROBATION')).toBe('Thử việc')
    expect(formatAuditValue({ ...entry, objectType: 'TRANSACTION' }, 'status', 'POSTED')).toBe('Đã ghi sổ')
    expect(formatAuditValue(entry, 'amount', 450_000)).toMatch(/^450\.000/)
    expect(formatAuditValue(entry, 'endOn', '9999-12-31')).toBe('Không thời hạn')
    expect(formatAuditValue(entry, 'endOn', '2026-11-20')).toBe('20/11/2026')
    expect(formatAuditValue(entry, 'presidents', ['u-huy'])).toBe('Phạm Gia Huy')
    expect(formatAuditValue(entry, 'enabled', false)).toBe('Không')
    expect(formatAuditValue(entry, 'status', null)).toBe('—')
  })

  it('pairs each field before and after, hiding technical ones', () => {
    expect(auditChanges({ ...entry, before: null, after: { status: 'PROBATION' } })).toEqual([{ field: 'status', label: 'Trạng thái', before: '—', after: 'Thử việc' }])
    const term = auditChanges({ objectType: 'TERM', names: {}, before: { endOn: '2026-12-31' }, after: { endOn: '2027-03-31', movedPositions: 2, positionIds: ['p1', 'p2'] } })
    expect(term.map((change) => change.label)).toEqual(['Đến ngày', 'Số chức vụ được dời'])
  })

  it('reads the day range typed as dd/mm/yyyy, either end may be empty', () => {
    expect(parseLogRange('', '')).toEqual({ ok: true, from: null, to: null })
    expect(parseLogRange('01/11/2026', '')).toEqual({ ok: true, from: '2026-11-01', to: null })
    expect(parseLogRange('31/02/2026', '')).toMatchObject({ ok: false, field: 'from' })
    expect(parseLogRange('10/11/2026', '01/11/2026')).toMatchObject({ ok: false, field: 'to' })
  })
})
