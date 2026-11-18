import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db, type DbAdvance } from '@/api/mocks/db'
import { runAdvanceDeadlines } from '@/api/mocks/mockAdvances'
import { fundBalance } from '@/api/mocks/mockFinance'
import { vnDate } from '@/api/mocks/mockTime'
import { eventFundId, generalFundId } from '@/api/mocks/seed/financeSeed'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { signInAs } from '@/testUtils'
import { advanceRepository } from '../model/advanceRepository'
import type { ProposeAdvanceRequest } from '../model/advanceTypes'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const general = generalFundId('c-guitar')
const winter = eventFundId('e-winter')
const seeded = () => {
  const found = db.advances.find((advance) => advance.id === 'adv-strings')
  if (!found) throw new Error('Thiếu tạm ứng seed')
  return found
}
const proposal = (patch: Partial<ProposeAdvanceRequest> = {}): ProposeAdvanceRequest => ({
  fundId: general,
  amount: 300_000,
  purpose: 'In băng rôn cho buổi biểu diễn',
  category: 'PRINTING',
  settleBy: vnDate(14),
  ...patch,
})
const transition = (actorId: string, action: 'APPROVE' | 'REJECT' | 'DISBURSE', extra: { reason?: string; version?: number } = {}) => {
  signInAs(actorId)
  return advanceRepository.transition('c-guitar', 'adv-strings', { action, version: extra.version ?? seeded().version, reason: extra.reason })
}
const recipientsOf = (title: string) => {
  const ids = db.notifications.filter((notification) => notification.title === title).map((notification) => notification.id)
  return db.notificationRecipients.filter((recipient) => ids.includes(recipient.notificationId)).map((recipient) => recipient.userId)
}
/** Một tạm ứng đã ứng của u-linh, hạn quyết toán theo `settleBy`. */
function heldAdvance(settleBy: string): DbAdvance {
  const advance: DbAdvance = {
    ...seeded(),
    id: 'adv-held',
    requesterId: 'u-linh',
    purpose: 'Thuê loa cho buổi diễn thử',
    status: 'DISBURSED',
    approverId: 'u-anh',
    disbursedBy: 'u-mai',
    disbursedOn: vnDate(-10),
    settleBy,
    lines: [],
  }
  db.advances.push(advance)
  return advance
}

describe('proposing an advance (FR-FIN-07, BR-FIN-04, BR-FIN-05)', () => {
  it('lets a department head propose from the general fund and tells the approvers', async () => {
    signInAs('u-linh')
    const created = await advanceRepository.propose('c-guitar', proposal())
    expect(created).toMatchObject({ status: 'PROPOSED', requester: { id: 'u-linh' }, overdue: false, allowedActions: [] })
    expect(recipientsOf('Tạm ứng chờ duyệt: In băng rôn cho buổi biểu diễn')).toEqual(expect.arrayContaining(['u-anh', 'u-huy']))
  })

  it('refuses an ordinary member, and an event lead outside their event fund', async () => {
    signInAs('u-hieu')
    expect((await fail(advanceRepository.propose('c-guitar', proposal())))?.status).toBe(403)
    signInAs('u-bao')
    expect((await fail(advanceRepository.propose('c-guitar', proposal())))?.status).toBe(403)
    expect((await advanceRepository.propose('c-guitar', proposal({ fundId: winter }))).fundName).toBe('Quỹ Đêm nhạc Mùa đông')
  })

  it('checks every field', async () => {
    signInAs('u-linh')
    const error = await fail(advanceRepository.propose('c-guitar', proposal({ amount: 0, purpose: 'abc', category: 'MEMBER_DUES' as never, settleBy: vnDate(91) })))
    expect(error?.status).toBe(400)
    expect(error?.fieldErrors.map((fieldError) => fieldError.field).toSorted()).toEqual(['amount', 'category', 'purpose', 'settleBy'])
    expect((await fail(advanceRepository.propose('c-guitar', proposal({ settleBy: vnDate(-1) }))))?.fieldErrors[0]?.field).toBe('settleBy')
  })

  it('refuses someone who still holds an overdue advance and names it (BR-FIN-05)', async () => {
    heldAdvance(vnDate(-1))
    signInAs('u-linh')
    const error = await fail(advanceRepository.propose('c-guitar', proposal()))
    expect(error).toMatchObject({ status: 422, code: 'ADVANCE_OVERDUE' })
    expect(error?.detail).toContain('Thuê loa cho buổi diễn thử')
  })
})

describe('approving and disbursing (FR-FIN-07, ST-ADV)', () => {
  it('does not let the requester or an event lead approve', async () => {
    expect(await fail(transition('u-huy', 'APPROVE'))).toMatchObject({ status: 403, code: 'SELF_APPROVAL' })
    signInAs('u-bao')
    const own = await advanceRepository.propose('c-guitar', proposal({ fundId: winter }))
    // BR-ACL-05: Trưởng BTC không có quyền duyệt chi, kể cả ở quỹ sự kiện của mình.
    expect((await fail(advanceRepository.transition('c-guitar', own.id, { action: 'APPROVE', version: own.version })))?.status).toBe(403)
  })

  it('approves, tells the requester and the treasurer, then refuses a stale or repeated decision', async () => {
    expect((await fail(transition('u-anh', 'APPROVE', { version: 0 })))?.status).toBe(409)
    const approved = await transition('u-anh', 'APPROVE')
    expect(approved).toMatchObject({ status: 'APPROVED', approver: { id: 'u-anh' }, allowedActions: [] })
    expect(recipientsOf('Tạm ứng đã được duyệt: Mua dây đàn dự phòng cho buổi tập tháng 12')).toEqual(['u-huy'])
    expect(recipientsOf('Tạm ứng chờ ghi đã ứng: Mua dây đàn dự phòng cho buổi tập tháng 12')).toEqual(['u-mai'])
    expect((await fail(transition('u-anh', 'APPROVE')))?.code).toBe('INVALID_TRANSITION')
    expect((await fail(transition('u-anh', 'REJECT', { reason: 'Không cần nữa.' })))?.code).toBe('INVALID_TRANSITION')
  })

  it('needs a reason to reject', async () => {
    expect(await fail(transition('u-anh', 'REJECT', { reason: 'ngắn' }))).toMatchObject({ status: 400, fieldErrors: [{ field: 'reason' }] })
    expect(await transition('u-anh', 'REJECT', { reason: 'Kho còn đủ dây đàn.' })).toMatchObject({ status: 'REJECTED', rejectionReason: 'Kho còn đủ dây đàn.' })
  })

  it('lets only the ledger keeper disburse, which posts an expense linked to the advance', async () => {
    await transition('u-anh', 'APPROVE')
    expect((await fail(transition('u-anh', 'DISBURSE')))?.status).toBe(403)
    const before = fundBalance(general)
    signInAs('u-mai')
    expect((await advanceRepository.get('c-guitar', 'adv-strings')).allowedActions).toEqual(['DISBURSE'])
    const disbursed = await transition('u-mai', 'DISBURSE')
    expect(disbursed).toMatchObject({ status: 'DISBURSED', disbursedBy: { id: 'u-mai' }, disbursedOn: vnDate(0) })
    expect(fundBalance(general)).toBe(before - 400_000)
    expect(db.transactions.find((transaction) => transaction.id === disbursed.disbursementTxId)).toMatchObject({
      type: 'EXPENSE',
      status: 'POSTED',
      category: 'EQUIPMENT',
      advanceId: 'adv-strings',
      approverId: 'u-anh',
      posterId: 'u-mai',
    })
    expect((await fail(transition('u-mai', 'DISBURSE')))?.code).toBe('INVALID_TRANSITION')
  })

  it('refuses when the treasurer lost the ledger right, or the fund cannot cover it (BR-FIN-08)', async () => {
    await transition('u-anh', 'APPROVE')
    db.permissionOverrides.push({ clubId: 'c-guitar', role: 'TREASURER', permission: 'RECORD_LEDGER', enabled: false, updatedBy: 'u-anh', updatedAt: new Date().toISOString() })
    expect((await fail(transition('u-mai', 'DISBURSE')))?.status).toBe(403)
    db.permissionOverrides.length = 0
    seeded().amount = 900_000_000
    const error = await fail(transition('u-mai', 'DISBURSE'))
    expect(error).toMatchObject({ status: 422, code: 'INSUFFICIENT_BALANCE' })
    expect(seeded().status).toBe('APPROVED')
  })
})

describe('who sees an advance (SRS 3.5)', () => {
  it('shows it to the board and the requester only', async () => {
    signInAs('u-hieu')
    expect((await fail(advanceRepository.get('c-guitar', 'adv-strings')))?.status).toBe(403)
    expect((await fail(advanceRepository.list('c-guitar', { fundId: general })))?.status).toBe(403)
    signInAs('u-huy')
    expect((await advanceRepository.list('c-guitar', { fundId: general, mine: true })).content.map((advance) => advance.id)).toEqual(['adv-strings'])
    signInAs('u-linh')
    // Trưởng ban đề xuất được ở Quỹ chung nên mở được danh sách, nhưng chỉ thấy khoản của mình.
    expect((await advanceRepository.list('c-guitar', { fundId: general })).content).toEqual([])
  })

  it('lets the event lead see advances of their own event fund, and the treasurer see them all', async () => {
    signInAs('u-bao')
    const own = await advanceRepository.propose('c-guitar', proposal({ fundId: winter }))
    expect((await advanceRepository.list('c-guitar', { fundId: winter })).content.map((advance) => advance.id)).toEqual([own.id])
    expect((await fail(advanceRepository.get('c-guitar', 'adv-strings')))?.status).toBe(403)
    signInAs('u-mai')
    expect((await advanceRepository.get('c-guitar', own.id)).id).toBe(own.id)
    expect((await advanceRepository.list('c-guitar', { fundId: general })).content.map((advance) => advance.id)).toEqual(['adv-strings'])
  })

  it('stops showing an advance notification once the reader can no longer see the advance (BR-SEC-02)', async () => {
    signInAs('u-linh')
    await advanceRepository.propose('c-guitar', proposal())
    signInAs('u-huy')
    const notice = (await notificationRepository.list({ category: 'FINANCE' })).content.find((item) => item.title === 'Tạm ứng chờ duyệt: In băng rôn cho buổi biểu diễn')
    expect((await notificationRepository.get(notice?.id ?? '')).body).toContain('300.000 đ')
    // Phó chủ nhiệm bị thu hồi chức vụ: không còn trong ban chủ nhiệm, cũng không phải người ứng.
    for (const position of db.positions.filter((candidate) => candidate.userId === 'u-huy' && candidate.clubId === 'c-guitar')) position.endOn = vnDate(-1)
    expect(await fail(notificationRepository.get(notice?.id ?? ''))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })
})

describe('advance deadlines (FR-FIN-07)', () => {
  it('reminds the requester once before the deadline', () => {
    heldAdvance(vnDate(1))
    runAdvanceDeadlines()
    runAdvanceDeadlines()
    expect(recipientsOf('Tạm ứng sắp tới hạn quyết toán: Thuê loa cho buổi diễn thử')).toEqual(['u-linh'])
  })

  it('flags an overdue advance once to the requester and the ledger keeper', async () => {
    heldAdvance(vnDate(-2))
    runAdvanceDeadlines()
    runAdvanceDeadlines()
    expect(recipientsOf('Tạm ứng quá hạn quyết toán: Thuê loa cho buổi diễn thử').toSorted()).toEqual(['u-linh', 'u-mai'])
    signInAs('u-anh')
    expect((await advanceRepository.list('c-guitar', { overdue: true })).content.map((advance) => advance.id)).toEqual(['adv-held'])
  })
})
