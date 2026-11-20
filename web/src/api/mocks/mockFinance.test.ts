import { describe, expect, it } from 'vitest'
import { db, type DbTransaction } from './db'
import { canViewFund, canViewTransaction, ensureEventFund, flowFor, fundBalance } from './mockFinance'
import { eventFundId, generalFundId } from './seed/financeSeed'

const guitar = generalFundId('c-guitar')
const exchange = eventFundId('e-exchange')

function posted(fields: Partial<DbTransaction> & Pick<DbTransaction, 'id' | 'fundId' | 'type' | 'direction' | 'amount'>): DbTransaction {
  return {
    clubId: 'c-guitar',
    category: 'OTHER_INCOME',
    description: 'Thử',
    occurredOn: '2026-11-01',
    status: 'POSTED',
    proposerId: 'u-mai',
    approverId: null,
    posterId: 'u-mai',
    attachmentIds: [],
    originalId: null,
    targetFundId: null,
    rejectionReason: null,
    createdAt: '2026-11-01T09:00:00+07:00',
    decidedAt: null,
    postedAt: '2026-11-01T09:00:00+07:00',
    cancelledBy: null,
    cancelledAt: null,
    cancellationReason: null,
    version: 1,
    ...fields,
  }
}

describe('fund balance (BR-FIN-02)', () => {
  it('sums posted income minus posted expenses and ignores anything not posted', () => {
    // Seed: thu 2.500.000 + 3.000.000 + 1.200.000, chi 480.000 + 600.000 + 150.000; khoản chờ duyệt, đã duyệt, bị từ chối không tính.
    expect(fundBalance(guitar)).toBe(5_470_000)
    expect(fundBalance(exchange)).toBe(750_000)
  })

  it('moves a transfer out of the source fund and into the target fund', () => {
    db.transactions.push(posted({ id: 'tx-t', fundId: exchange, type: 'TRANSFER', direction: 'OUT', amount: 750_000, targetFundId: guitar, category: 'FUND_TRANSFER' }))
    expect(fundBalance(exchange)).toBe(0)
    expect(fundBalance(guitar)).toBe(6_220_000)
  })

  it('applies adjustments in the direction chosen', () => {
    db.transactions.push(posted({ id: 'tx-up', fundId: guitar, type: 'ADJUSTMENT', direction: 'IN', amount: 30_000, originalId: 'tx-shirts' }))
    db.transactions.push(posted({ id: 'tx-down', fundId: guitar, type: 'ADJUSTMENT', direction: 'OUT', amount: 100_000, originalId: 'tx-strings' }))
    expect(fundBalance(guitar)).toBe(5_400_000)
  })

  it('shows a transfer as money in when seen from the receiving fund', () => {
    const transfer = posted({ id: 'tx-t', fundId: exchange, type: 'TRANSFER', direction: 'OUT', amount: 1, targetFundId: guitar })
    expect(flowFor(transfer, guitar)).toBe('IN')
    expect(flowFor(transfer, exchange)).toBe('OUT')
    expect(flowFor(transfer)).toBe('OUT')
  })
})

describe('who sees a fund (SRS 3.5)', () => {
  it('lets every member see the general fund, including members on leave, but not outsiders', () => {
    const fund = db.funds.find((candidate) => candidate.id === guitar)
    if (!fund) throw new Error('Thiếu Quỹ chung trong seed')
    expect(canViewFund('u-hieu', fund)).toBe(true)
    expect(canViewFund('u-yen', fund)).toBe(true)
    expect(canViewFund('u-tu', fund)).toBe(false)
  })

  it('keeps an event fund to the board and the organising committee', () => {
    const fund = db.funds.find((candidate) => candidate.id === eventFundId('e-winter'))
    if (!fund) throw new Error('Thiếu quỹ Đêm nhạc Mùa đông trong seed')
    expect(canViewFund('u-mai', fund)).toBe(true)
    expect(canViewFund('u-bao', fund)).toBe(true)
    expect(canViewFund('u-kiet', fund)).toBe(true)
    expect(canViewFund('u-hieu', fund)).toBe(false)
  })

  it('shows unposted expenses only to the board, the proposer and the event lead', () => {
    const standee = db.transactions.find((transaction) => transaction.id === 'tx-standee')
    const sound = db.transactions.find((transaction) => transaction.id === 'tx-winter-sound')
    if (!standee || !sound) throw new Error('Thiếu khoản chờ duyệt trong seed')
    expect(canViewTransaction('u-anh', standee)).toBe(true)
    expect(canViewTransaction('u-linh', standee)).toBe(true)
    expect(canViewTransaction('u-hieu', standee)).toBe(false)
    // Nhân sự BTC xem được sổ quỹ sự kiện nhưng không xem đề xuất chi của người khác.
    expect(canViewTransaction('u-kiet', sound)).toBe(false)
    expect(canViewTransaction('u-bao', sound)).toBe(true)
  })

  it('creates one event fund per event and reuses it', () => {
    const before = db.funds.length
    const first = ensureEventFund('e-busking', 'c-guitar')
    expect(ensureEventFund('e-busking', 'c-guitar')).toBe(first)
    expect(db.funds).toHaveLength(before + 1)
    expect(fundBalance(first.id)).toBe(0)
  })
})
