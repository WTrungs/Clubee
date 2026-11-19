import { describe, expect, it } from 'vitest'
import { adminRepository } from '@/features/account/model/adminRepository'
import { advanceRepository } from '@/features/finance/model/advanceRepository'
import { duesRepository } from '@/features/finance/model/duesRepository'
import { financeRepository } from '@/features/finance/model/financeRepository'
import { memberRepository } from '@/features/member/model/memberRepository'
import { orgRepository } from '@/features/org/model/orgRepository'
import { signInAs } from '@/testUtils'
import { db, type DbAuditLog } from './db'
import { vnDate } from './mockTime'
import { generalFundId } from './seed/financeSeed'

const general = generalFundId('c-guitar')
/** Các dòng ghi sau mốc đếm `from`. */
const logsSince = (from: number) => db.auditLogs.slice(from)
const onlyLog = (logs: DbAuditLog[], action: string) => {
  const matched = logs.filter((log) => log.action === action)
  expect(matched).toHaveLength(1)
  return matched[0] as DbAuditLog
}
const versionOf = (membershipId: string) => db.memberships.find((membership) => membership.id === membershipId)?.version ?? 0

describe('seeded audit log (BR-DATA-03, NFR-SEC-05)', () => {
  it('starts with a time-ordered trail of positions, membership changes and fund transactions, with no secrets', () => {
    expect(db.auditLogs.length).toBeGreaterThan(50)
    const times = db.auditLogs.map((log) => log.at)
    expect(times).toEqual(times.toSorted())
    expect(db.auditLogs.find((log) => log.action === 'GRANT_POSITION' && log.objectLabel === 'Thủ quỹ: Võ Ngọc Mai')).toBeDefined()
    expect(db.auditLogs.some((log) => log.objectType === 'MEMBERSHIP' && log.after?.status === 'ACTIVE')).toBe(true)
    expect(db.auditLogs.some((log) => log.objectType === 'TRANSACTION' && log.action === 'CREATE_TRANSACTION')).toBe(true)
    expect(JSON.stringify(db.auditLogs).toLowerCase()).not.toContain('password')
  })
})

describe('positions (BR-DATA-03: gán, thu hồi chức vụ)', () => {
  it('logs a grant and a revocation with who did it, the position at that time and the reason', async () => {
    signInAs('u-anh')
    const from = db.auditLogs.length
    const endOn = db.terms.find((term) => term.id === 't-guitar-2026')?.endOn ?? vnDate(300)
    const granted = await orgRepository.assign('c-guitar', { userId: 'u-hieu', role: 'DEPARTMENT_HEAD', scopeId: 'd-design', startOn: vnDate(0), endOn })
    const grant = onlyLog(logsSince(from), 'GRANT_POSITION')
    expect(grant).toMatchObject({ actorId: 'u-anh', actorName: 'Nguyễn Minh Anh', clubId: 'c-guitar', objectType: 'POSITION', objectId: granted.id, before: null })
    expect(grant.objectLabel).toMatch(/^Trưởng ban .+: /)

    const position = db.positions.find((candidate) => candidate.id === granted.id)
    await orgRepository.revoke('c-guitar', granted.id, { reason: 'Đổi người phụ trách ban.', handoverOn: vnDate(0), version: position?.version ?? 1 })
    const ended = onlyLog(logsSince(from), 'END_POSITION')
    expect(ended).toMatchObject({ actorId: 'u-anh', objectId: granted.id, reason: 'Đổi người phụ trách ban.', before: { endOn } })
    expect(ended.after?.endOn).toBe(position?.endOn)
  })
})

describe('membership status (BR-DATA-03: chuyển trạng thái thành viên)', () => {
  it('logs approval and removal next to the membership history', async () => {
    signInAs('u-anh')
    const from = db.auditLogs.length
    await memberRepository.transition('c-guitar', 'm-guitar-quan', { action: 'APPROVE_PROBATION', departmentId: 'd-media', version: versionOf('m-guitar-quan') })
    await memberRepository.transition('c-guitar', 'm-guitar-quan', { action: 'REMOVE', reason: 'Kiểm thử đưa ra khỏi CLB.', version: versionOf('m-guitar-quan') })
    const changes = logsSince(from).filter((log) => log.objectType === 'MEMBERSHIP')
    expect(changes.map((log) => [log.before?.status, log.after?.status])).toEqual([
      ['PENDING', 'PROBATION'],
      ['PROBATION', 'LEFT'],
    ])
    expect(changes[1]).toMatchObject({ actorId: 'u-anh', objectId: 'm-guitar-quan', reason: 'Kiểm thử đưa ra khỏi CLB.' })
    const history = db.memberships.find((membership) => membership.id === 'm-guitar-quan')?.history.slice(-2)
    expect(history?.map((change) => change.at)).toEqual(changes.map((log) => log.at))
  })
})

describe('fund transactions (BR-DATA-03: mọi giao dịch quỹ)', () => {
  it('logs creating an expense and every status change, each by the person who acted', async () => {
    const from = db.auditLogs.length
    signInAs('u-linh')
    const proposed = await financeRepository.create('c-guitar', { fundId: general, type: 'EXPENSE', amount: 150_000, category: 'EQUIPMENT', description: 'Mua dây đàn dự phòng', attachmentIds: [] })
    signInAs('u-anh')
    const approved = await financeRepository.transition('c-guitar', proposed.id, { action: 'APPROVE', version: proposed.version })
    signInAs('u-mai')
    await financeRepository.transition('c-guitar', proposed.id, { action: 'POST', version: approved.version })
    const trail = logsSince(from).filter((log) => log.objectId === proposed.id)
    expect(trail.map((log) => [log.action, log.actorId, log.before?.status ?? null, log.after?.status])).toEqual([
      ['CREATE_TRANSACTION', 'u-linh', null, 'PROPOSED'],
      ['CHANGE_TRANSACTION_STATUS', 'u-anh', 'PROPOSED', 'APPROVED'],
      ['CHANGE_TRANSACTION_STATUS', 'u-mai', 'APPROVED', 'POSTED'],
    ])
    expect(trail[0]?.objectLabel).toBe('Khoản chi 150.000 đ ở Quỹ chung: Mua dây đàn dự phòng')
  })

  it('keeps the reason of a rejection', async () => {
    signInAs('u-linh')
    const proposed = await financeRepository.create('c-guitar', { fundId: general, type: 'EXPENSE', amount: 90_000, category: 'FOOD', description: 'Nước uống buổi tập', attachmentIds: [] })
    signInAs('u-anh')
    await financeRepository.transition('c-guitar', proposed.id, { action: 'REJECT', reason: 'Đã có nhà tài trợ nước.', version: proposed.version })
    expect(db.auditLogs.at(-1)).toMatchObject({ objectId: proposed.id, after: { status: 'REJECTED' }, reason: 'Đã có nhà tài trợ nước.' })
  })

  it('logs incomes, advance disbursements and dues payments that post straight away', async () => {
    const from = db.auditLogs.length
    signInAs('u-mai')
    const income = await financeRepository.create('c-guitar', {
      fundId: general,
      type: 'INCOME',
      amount: 500_000,
      category: 'SPONSORSHIP',
      description: 'Tài trợ của cửa hàng nhạc cụ',
      occurredOn: vnDate(0),
      attachmentIds: [],
    })
    signInAs('u-anh')
    const advance = db.advances.find((candidate) => candidate.id === 'adv-strings')
    const approved = await advanceRepository.transition('c-guitar', 'adv-strings', { action: 'APPROVE', version: advance?.version ?? 1 })
    signInAs('u-mai')
    const disbursed = await advanceRepository.transition('c-guitar', 'adv-strings', { action: 'DISBURSE', version: approved.version })
    const item = (await duesRepository.items('c-guitar', 'dues-guitar-hk1', { size: 100 })).content.find((row) => row.member.id === 'u-ha')
    await duesRepository.recordPayment('c-guitar', 'dues-guitar-hk1', item?.id ?? '', { amount: 100_000, paidOn: vnDate(0), version: item?.version ?? 1 })

    const created = logsSince(from).filter((log) => log.action === 'CREATE_TRANSACTION')
    expect(created.map((log) => [log.actorId, log.after?.status])).toEqual([
      ['u-mai', 'POSTED'],
      ['u-mai', 'POSTED'],
      ['u-mai', 'POSTED'],
    ])
    expect(created[0]?.objectId).toBe(income.id)
    expect(created[1]?.objectId).toBe(db.advances.find((candidate) => candidate.id === disbursed.id)?.disbursementTxId)
    expect(created[2]?.objectLabel).toMatch(/^Khoản thu 100\.000 đ ở Quỹ chung: Đóng quỹ /)
  })
})

describe('other write paths', () => {
  it('logs a withdrawn and a cancelled expense, keeping the reason only where one is required', async () => {
    signInAs('u-linh')
    const withdrawn = await financeRepository.create('c-guitar', { fundId: general, type: 'EXPENSE', amount: 50_000, category: 'PRINTING', description: 'In tờ rơi', attachmentIds: [] })
    await financeRepository.transition('c-guitar', withdrawn.id, { action: 'WITHDRAW', reason: 'không cần ghi', version: withdrawn.version })
    expect(db.auditLogs.at(-1)).toMatchObject({ objectId: withdrawn.id, actorId: 'u-linh', before: { status: 'PROPOSED' }, after: { status: 'WITHDRAWN' }, reason: null })

    const proposed = await financeRepository.create('c-guitar', { fundId: general, type: 'EXPENSE', amount: 60_000, category: 'FOOD', description: 'Bánh cho buổi tập', attachmentIds: [] })
    signInAs('u-anh')
    const approved = await financeRepository.transition('c-guitar', proposed.id, { action: 'APPROVE', version: proposed.version })
    await financeRepository.transition('c-guitar', proposed.id, { action: 'CANCEL', reason: 'Buổi tập dời sang tuần sau.', version: approved.version })
    expect(db.auditLogs.at(-1)).toMatchObject({ objectId: proposed.id, actorId: 'u-anh', before: { status: 'APPROVED' }, after: { status: 'CANCELLED' }, reason: 'Buổi tập dời sang tuần sau.' })
  })

  it('logs a member resigning by themselves', async () => {
    signInAs('u-tram')
    const mine = await memberRepository.myMembership('c-guitar')
    await memberRepository.transitionMine('c-guitar', { action: 'RESIGN', reason: 'Bận thực tập cả học kỳ.', version: mine.version })
    expect(db.auditLogs.filter((log) => log.objectType === 'MEMBERSHIP').at(-1)).toMatchObject({
      actorId: 'u-tram',
      before: { status: 'PROBATION' },
      after: { status: 'LEFT' },
      reason: 'Bận thực tập cả học kỳ.',
    })
  })

  it('keeps secrets out of rows written at run time, including account locks', async () => {
    signInAs('u-admin')
    const ha = db.users.find((user) => user.id === 'u-ha')
    await adminRepository.transition('u-ha', { action: 'LOCK', reason: 'Gửi tin nhắn rác.', version: ha?.version ?? 1 })
    expect(db.auditLogs.at(-1)?.action).toBe('LOCK_ACCOUNT')
    expect(JSON.stringify(db.auditLogs).toLowerCase()).not.toContain('password')
  })
})

describe('append-only log (NFR-SEC-05, BR-DATA-02)', () => {
  it('never rewrites earlier rows, even when the actor later changes their name', async () => {
    signInAs('u-anh')
    const before = structuredClone(db.auditLogs)
    await memberRepository.transition('c-guitar', 'm-guitar-quan', { action: 'APPROVE_PROBATION', departmentId: 'd-media', version: versionOf('m-guitar-quan') })
    const actor = db.users.find((user) => user.id === 'u-anh')
    if (actor) actor.fullName = 'Tên Mới Của Anh'
    await memberRepository.transition('c-guitar', 'm-guitar-quan', { action: 'REMOVE', reason: 'Kiểm thử đưa ra khỏi CLB.', version: versionOf('m-guitar-quan') })
    expect(db.auditLogs.slice(0, before.length)).toEqual(before)
    const [approval, removal] = db.auditLogs.slice(before.length).filter((log) => log.objectType === 'MEMBERSHIP')
    expect(approval?.actorName).toBe('Nguyễn Minh Anh')
    expect(removal?.actorName).toBe('Tên Mới Của Anh')
  })
})
