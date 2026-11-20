import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { fundBalance } from '@/api/mocks/mockFinance'
import { hasPosition } from '@/api/mocks/mockPermissions'
import { vnDate } from '@/api/mocks/mockTime'
import { eventFundId, generalFundId } from '@/api/mocks/seed/financeSeed'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { eventRepository } from '@/features/event/model/eventRepository'
import { createTestWrapper, signInAs } from '@/testUtils'
import { financeRepository } from '../model/financeRepository'
import { useFinancePageViewModel } from './useFinancePageViewModel'
import { settlePendingCount, settleShares, useFundPanelViewModel } from './useFundPanelViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const guitar = generalFundId('c-guitar')
const exchange = eventFundId('e-exchange')
const eventOf = (id: string) => db.events.find((event) => event.id === id)
/** Seed không tự chuyển trạng thái theo giờ, nên test đặt sự kiện sang Đã kết thúc. */
const endEvent = (id: string) => {
  const event = eventOf(id)
  if (!event) throw new Error(`Thiếu sự kiện ${id} trong seed`)
  event.status = 'ENDED'
}

async function settle(fundId: string) {
  const fund = await financeRepository.fund('c-guitar', fundId)
  return financeRepository.settle('c-guitar', fundId, fund.version)
}

async function clubWrapper(clubId: string, path = `/clubs/${clubId}/finance`) {
  const club = await clubRepository.getClub(clubId)
  const { wrapper: Base } = createTestWrapper(path)
  return ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId, club }}>{children}</ClubContext.Provider>
    </Base>
  )
}

describe('settling an event fund (FR-FIN-11)', () => {
  it('moves what is left to the general fund with a transfer and leaves the ended event as it is', async () => {
    signInAs('u-mai')
    expect((await financeRepository.fund('c-guitar', exchange)).allowedActions).toContain('SETTLE')
    const eventVersion = eventOf('e-exchange')?.version ?? 0
    const settled = await settle(exchange)
    // Hết các thao tác ghi; ban chủ nhiệm vẫn xem được lịch sử khoản chi của quỹ.
    expect(settled).toMatchObject({ status: 'SETTLED', balance: 0, settledBy: { id: 'u-mai' }, allowedActions: ['VIEW_REQUESTS', 'VIEW_ADVANCES'] })
    expect(fundBalance(guitar)).toBe(6_220_000)
    // Quyết toán là trạng thái của quỹ; sự kiện vẫn Đã kết thúc.
    expect(eventOf('e-exchange')).toMatchObject({ status: 'ENDED', version: eventVersion })

    const [transfer] = (await financeRepository.transactions('c-guitar', { fundId: guitar, type: ['TRANSFER'] })).content
    expect(transfer).toMatchObject({ flow: 'IN', amount: 750_000, category: 'FUND_TRANSFER', occurredOn: vnDate(0) })
    // Chi tiết nhìn từ Quỹ chung là tiền vào, nhìn từ quỹ sự kiện là tiền ra, như trong hai sổ.
    expect((await financeRepository.transaction('c-guitar', transfer?.id ?? '', guitar)).flow).toBe('IN')
    expect((await financeRepository.transaction('c-guitar', transfer?.id ?? '', exchange)).flow).toBe('OUT')
  })

  it('keeps a cancelled event cancelled and skips the transfer when nothing is left', async () => {
    signInAs('u-mai')
    await settle(eventFundId('e-acoustic-sep'))
    expect(eventOf('e-acoustic-sep')?.status).toBe('CANCELLED')
    expect(fundBalance(guitar)).toBe(5_670_000)

    const before = db.transactions.length
    endEvent('e-livestream')
    await settle(eventFundId('e-livestream'))
    expect(db.transactions).toHaveLength(before)
  })

  it('refuses while the fund still has pending expenses and says how many', async () => {
    signInAs('u-anh')
    await financeRepository.create('c-guitar', { fundId: exchange, type: 'EXPENSE', amount: 100_000, category: 'FOOD', description: 'Bù tiền nước uống', attachmentIds: [] })
    signInAs('u-mai')
    const fund = await financeRepository.fund('c-guitar', exchange)
    expect(fund.allowedActions).not.toContain('SETTLE')
    expect(settlePendingCount(fund)).toBe(1)
    const error = await fail(financeRepository.settle('c-guitar', exchange, fund.version))
    expect(error).toMatchObject({ status: 422, code: 'FUND_HAS_PENDING', detail: expect.stringContaining('còn 1 khoản') })
    expect(db.funds.find((candidate) => candidate.id === exchange)?.status).toBe('OPEN')
  })

  it('only lets the treasurer settle, only an event fund whose event has ended or been cancelled', async () => {
    signInAs('u-anh')
    const fund = await financeRepository.fund('c-guitar', exchange)
    expect((await fail(financeRepository.settle('c-guitar', exchange, fund.version)))?.status).toBe(403)
    expect(db.funds.find((candidate) => candidate.id === exchange)).toMatchObject({ status: 'OPEN', version: fund.version })
    expect(fundBalance(exchange)).toBe(750_000)

    signInAs('u-mai')
    expect((await fail(settle(eventFundId('e-winter'))))).toMatchObject({ status: 422, code: 'INVALID_TRANSITION' })
    expect((await fail(settle(guitar)))).toMatchObject({ status: 422, code: 'INVALID_TRANSITION' })
    expect((await fail(financeRepository.settle('c-guitar', exchange, fund.version - 1)))?.status).toBe(409)
  })

  it('accepts no new transaction once settled', async () => {
    signInAs('u-mai')
    await settle(exchange)
    const income = await fail(
      financeRepository.create('c-guitar', { fundId: exchange, type: 'INCOME', amount: 10_000, category: 'EVENT_REVENUE', description: 'Bán thêm vé', occurredOn: vnDate(0), attachmentIds: [] }),
    )
    expect(income).toMatchObject({ status: 422, code: 'FUND_SETTLED' })
    expect((await fail(settle(exchange)))).toMatchObject({ status: 422, code: 'FUND_SETTLED' })
  })
})

describe('closing an event (FR-EVT-16, BR-EVT-05)', () => {
  it('needs the event fund to be settled first', async () => {
    signInAs('u-anh')
    const ended = await eventRepository.get('c-guitar', 'e-exchange')
    expect(ended.allowedActions).not.toContain('CLOSE')
    expect(await fail(eventRepository.transition('c-guitar', 'e-exchange', { action: 'CLOSE', version: ended.version }))).toMatchObject({ status: 422, code: 'FUND_NOT_SETTLED' })
    expect(eventOf('e-exchange')).toMatchObject({ status: 'ENDED', version: ended.version })
  })

  it('reports the fund status only to fund viewers, so committee staff who cannot close still see it settled', async () => {
    endEvent('e-winter')
    signInAs('u-long')
    expect(await eventRepository.get('c-guitar', 'e-winter')).toMatchObject({ fundStatus: 'OPEN', allowedActions: expect.arrayContaining(['VIEW_FUND']) })
    // Seed còn khoản chờ duyệt nên đặt thẳng trạng thái quỹ; luồng quyết toán đã có test riêng ở trên.
    const fund = db.funds.find((candidate) => candidate.id === eventFundId('e-winter'))
    if (!fund) throw new Error('Thiếu quỹ e-winter trong seed')
    fund.status = 'SETTLED'
    const staffView = await eventRepository.get('c-guitar', 'e-winter')
    expect(staffView.fundStatus).toBe('SETTLED')
    expect(staffView.allowedActions).not.toContain('CLOSE')
    signInAs('u-hieu')
    expect((await eventRepository.get('c-guitar', 'e-winter')).fundStatus).toBeNull()
  })

  it('only closes an ended event, even when its fund is settled', async () => {
    signInAs('u-mai')
    await settle(eventFundId('e-acoustic-sep'))
    signInAs('u-anh')
    const cancelled = await eventRepository.get('c-guitar', 'e-acoustic-sep')
    expect(cancelled.allowedActions).not.toContain('CLOSE')
    expect(await fail(eventRepository.transition('c-guitar', 'e-acoustic-sep', { action: 'CLOSE', version: cancelled.version }))).toMatchObject({ status: 422, code: 'INVALID_TRANSITION' })
  })

  it('lets the board or the event lead close an ended event once its fund is settled, which ends every event position', async () => {
    signInAs('u-mai')
    await settle(exchange)
    signInAs('u-hieu')
    const seen = await eventRepository.get('c-guitar', 'e-exchange')
    expect(seen.allowedActions).not.toContain('CLOSE')
    expect((await fail(eventRepository.transition('c-guitar', 'e-exchange', { action: 'CLOSE', version: seen.version })))?.status).toBe(403)

    signInAs('u-anh')
    const settled = await eventRepository.get('c-guitar', 'e-exchange')
    expect(settled.allowedActions).toContain('CLOSE')
    const closed = await eventRepository.transition('c-guitar', 'e-exchange', { action: 'CLOSE', version: settled.version })
    expect(closed.status).toBe('CLOSED')
    expect(closed.allowedActions).not.toContain('CLOSE')
    expect(closed.allowedActions).not.toContain('MANAGE_SUBCOMMITTEES')
    expect(hasPosition('u-huy', 'EVENT_LEAD', 'e-exchange')).toBe(false)
    expect(db.positions.find((position) => position.scopeId === 'e-exchange')?.revokeReason).toBe('Sự kiện đã đóng.')

    // Gọi thẳng API: hồ sơ sự kiện đã đóng chỉ đọc, kể cả với ban chủ nhiệm (NFR-SEC-03).
    signInAs('u-huy')
    const before = db.subcommittees.length
    const error = await fail(eventRepository.createSubcommittee('c-guitar', 'e-exchange', { name: 'Hậu cần', description: '', quota: null, leadUserId: null }))
    expect(error?.status).toBe(403)
    expect(db.subcommittees).toHaveLength(before)
  })

  it('lets an event lead who is not on the board close their own event once its fund is settled', async () => {
    endEvent('e-livestream')
    signInAs('u-mai')
    await settle(eventFundId('e-livestream'))
    signInAs('u-kiet')
    const settled = await eventRepository.get('c-guitar', 'e-livestream')
    expect(settled).toMatchObject({ status: 'ENDED', allowedActions: expect.arrayContaining(['CLOSE']) })
    expect((await eventRepository.transition('c-guitar', 'e-livestream', { action: 'CLOSE', version: settled.version })).status).toBe('CLOSED')
    expect(hasPosition('u-kiet', 'EVENT_LEAD', 'e-livestream')).toBe(false)
  })
})

describe('pending count that blocks settlement', () => {
  const base = { kind: 'EVENT' as const, status: 'OPEN' as const, event: { id: 'e', name: 'Sự kiện', status: 'ENDED' as const }, pendingCount: 2 }

  it('is only reported for an open event fund whose event has ended or been cancelled', () => {
    expect(settlePendingCount(base)).toBe(2)
    expect(settlePendingCount({ ...base, event: { ...base.event, status: 'CANCELLED' } })).toBe(2)
    expect(settlePendingCount({ ...base, event: { ...base.event, status: 'ONGOING' } })).toBe(0)
    expect(settlePendingCount({ ...base, status: 'SETTLED' })).toBe(0)
    expect(settlePendingCount({ ...base, pendingCount: null })).toBe(0)
    expect(settlePendingCount({ ...base, kind: 'GENERAL', event: null })).toBe(0)
    expect(settlePendingCount(undefined)).toBe(0)
  })
})

describe('settlement view models', () => {
  it('shows a reload banner when the fund changed between opening the dialog and confirming (NFR-REL-03)', async () => {
    signInAs('u-mai')
    const wrapper = await clubWrapper('c-guitar')
    const { result } = renderHook(() => useFundPanelViewModel(exchange), { wrapper })
    await waitFor(() => expect(result.current.canSettle).toBe(true))
    act(() => result.current.openSettle())
    await waitFor(() => expect(result.current.settleBalanceLoading).toBe(false))
    const stored = db.funds.find((candidate) => candidate.id === exchange)
    if (stored) stored.version += 1
    act(() => result.current.confirmSettle())
    await waitFor(() => expect(result.current.conflict).toBe(true))
    expect(stored?.status).toBe('OPEN')
  })

  it('settles from the fund panel and reloads the fund', async () => {
    signInAs('u-mai')
    const wrapper = await clubWrapper('c-guitar')
    const { result } = renderHook(() => useFundPanelViewModel(exchange), { wrapper })
    await waitFor(() => expect(result.current.canSettle).toBe(true))
    act(() => result.current.openSettle())
    act(() => result.current.confirmSettle())
    // Cache quỹ có thể làm mới xong trước khi hộp thoại đóng, nên chờ cả hai.
    await waitFor(() => expect({ status: result.current.fund?.status, open: result.current.settleOpen }).toEqual({ status: 'SETTLED', open: false }))
  })

  it('shows event funds only to people who can see at least one, filtered by status', async () => {
    signInAs('u-hieu')
    const memberWrapper = await clubWrapper('c-guitar')
    const member = renderHook(() => useFinancePageViewModel(), { wrapper: memberWrapper })
    await waitFor(() => expect(member.result.current.hasEventFunds).toBe(false))
    expect(member.result.current.view).toBe('general')

    signInAs('u-mai')
    await settle(exchange)
    const wrapper = await clubWrapper('c-guitar', '/clubs/c-guitar/finance?view=events')
    const { result } = renderHook(() => useFinancePageViewModel(), { wrapper })
    await waitFor(() => expect(result.current.view).toBe('events'))
    await waitFor(() => expect(result.current.funds.length).toBe(5))
    act(() => result.current.setFilter('SETTLED'))
    await waitFor(() => expect(result.current.funds.map((fund) => fund.id)).toEqual([exchange]))
  })
})

/** Seed chỉ có lời mời Đã gửi cho e-winter; test cho CLB Tiếng Anh đã nhận lời đồng tổ chức e-exchange. */
function englishCoHostsExchange() {
  db.eventCoHosts.push({
    id: 'ch-exchange-english',
    eventId: 'e-exchange',
    hostClubId: 'c-guitar',
    clubId: 'c-english',
    status: 'ACCEPTED',
    message: '',
    invitedBy: 'u-anh',
    invitedAt: new Date().toISOString(),
    decidedBy: 'u-tu',
    decidedAt: new Date().toISOString(),
    decisionNote: null,
    removedBy: null,
    removedAt: null,
    removeReason: null,
    version: 2,
  })
}

describe('settling with shares for co-host clubs (FR-FIN-11, BR-FIN-07, BR-FIN-08)', () => {
  const settleWith = async (shares: Array<{ clubId: string; amount: number; note: string }>) => {
    const fund = await financeRepository.fund('c-guitar', exchange)
    return financeRepository.settle('c-guitar', exchange, fund.version, shares)
  }

  it('checks each share and the total against the balance, changing nothing on error', async () => {
    englishCoHostsExchange()
    signInAs('u-mai')
    expect((await financeRepository.fund('c-guitar', exchange)).coHosts).toEqual([{ id: 'c-english', name: 'CLB Tiếng Anh Giao tiếp' }])
    expect(await fail(settleWith([{ clubId: 'c-volunteer', amount: 100_000, note: '' }]))).toMatchObject({ status: 400, fieldErrors: [{ field: 'shares[0].clubId' }] })
    expect(await fail(settleWith([{ clubId: 'c-english', amount: 0, note: '' }]))).toMatchObject({ status: 400, fieldErrors: [{ field: 'shares[0].amount' }] })
    expect(
      await fail(
        settleWith([
          { clubId: 'c-english', amount: 100_000, note: '' },
          { clubId: 'c-english', amount: 100_000, note: '' },
        ]),
      ),
    ).toMatchObject({ status: 400 })
    expect(await fail(settleWith([{ clubId: 'c-english', amount: 800_000, note: '' }]))).toMatchObject({ status: 422, code: 'SHARE_EXCEEDS_BALANCE' })
    expect(db.funds.find((fund) => fund.id === exchange)?.status).toBe('OPEN')
    expect(fundBalance(exchange)).toBe(750_000)
  })

  it('records the share as a posted expense before moving the rest to the general fund, and tells the co-host board', async () => {
    englishCoHostsExchange()
    signInAs('u-mai')
    const settled = await settleWith([{ clubId: 'c-english', amount: 300_000, note: ' Phần giao lưu song ngữ ' }])
    expect(settled).toMatchObject({ status: 'SETTLED', balance: 0 })
    const ledger = (await financeRepository.transactions('c-guitar', { fundId: exchange, status: ['POSTED'], size: 50 })).content
    expect(ledger.find((row) => row.category === 'CO_HOST_SHARE')).toMatchObject({
      type: 'EXPENSE',
      amount: 300_000,
      description: 'Chia cho CLB Tiếng Anh Giao tiếp khi quyết toán: Phần giao lưu song ngữ',
    })
    expect(ledger.find((row) => row.category === 'FUND_TRANSFER')).toMatchObject({ amount: 450_000 })
    expect(fundBalance(guitar)).toBe(5_920_000)
    const told = db.notifications.find((notification) => notification.title.startsWith('CLB Guitar Sinh viên chia 300.000'))
    expect(db.notificationRecipients.some((recipient) => recipient.notificationId === told?.id && recipient.userId === 'u-tu')).toBe(true)
  })

  it('settles from the fund panel with a share typed in the dialog', async () => {
    englishCoHostsExchange()
    signInAs('u-mai')
    const wrapper = await clubWrapper('c-guitar')
    const { result } = renderHook(() => useFundPanelViewModel(exchange), { wrapper })
    await waitFor(() => expect(result.current.shareClubs).toHaveLength(1))
    act(() => result.current.openSettle())
    await waitFor(() => expect(result.current.settleBalanceLoading).toBe(false))
    act(() => result.current.setShareDraft('c-english', { amount: '900.000' }))
    expect(result.current.sharePlan.totalError).toBe('Tổng khoản chia 900.000 đ vượt số dư 750.000 đ.')
    act(() => result.current.confirmSettle())
    expect(result.current.settling).toBe(false)
    act(() => result.current.setShareDraft('c-english', { amount: '200.000' }))
    expect(result.current.sharePlan).toMatchObject({ total: 200_000, remainder: 550_000, totalError: null })
    act(() => result.current.confirmSettle())
    await waitFor(() => expect({ status: result.current.fund?.status, open: result.current.settleOpen }).toEqual({ status: 'SETTLED', open: false }))
    expect(db.transactions.some((transaction) => transaction.category === 'CO_HOST_SHARE' && transaction.amount === 200_000)).toBe(true)
  })
})

describe('settleShares (FR-FIN-11)', () => {
  const clubs = [
    { id: 'c-english', name: 'CLB Tiếng Anh Giao tiếp' },
    { id: 'c-volunteer', name: 'Đội Tình nguyện Xanh' },
  ]

  it('skips empty rows and reports a bad amount or a long note per club', () => {
    expect(settleShares(clubs, {}, 500_000)).toMatchObject({ shares: [], total: 0, remainder: 500_000, totalError: null, errors: {} })
    const plan = settleShares(clubs, { 'c-english': { amount: '0', note: '' }, 'c-volunteer': { amount: '100.000', note: 'x'.repeat(201) } }, 500_000)
    expect(Object.keys(plan.errors)).toEqual(['c-english', 'c-volunteer'])
    expect(plan.shares).toEqual([])
    const ok = settleShares(clubs, { 'c-english': { amount: '200.000', note: ' Phần song ngữ ' }, 'c-volunteer': { amount: '', note: '' } }, 500_000)
    expect(ok).toMatchObject({ shares: [{ clubId: 'c-english', amount: 200_000, note: 'Phần song ngữ' }], remainder: 300_000 })
  })

  it('keeps the dialog open with the server reason when a share is refused', async () => {
    englishCoHostsExchange()
    signInAs('u-mai')
    const wrapper = await clubWrapper('c-guitar')
    const { result } = renderHook(() => useFundPanelViewModel(exchange), { wrapper })
    await waitFor(() => expect(result.current.shareClubs).toHaveLength(1))
    act(() => result.current.openSettle())
    await waitFor(() => expect(result.current.settleBalanceLoading).toBe(false))
    act(() => result.current.setShareDraft('c-english', { amount: '100.000' }))
    // CLB Tiếng Anh vừa bị gỡ ở chỗ khác.
    const record = db.eventCoHosts.find((coHost) => coHost.id === 'ch-exchange-english')
    if (record) record.status = 'REMOVED'
    act(() => result.current.confirmSettle())
    await waitFor(() => expect(result.current.settleError).toContain('Chỉ chia cho CLB đang đồng tổ chức sự kiện.'))
    expect(result.current.settleOpen).toBe(true)
    expect(db.funds.find((fund) => fund.id === exchange)?.status).toBe('OPEN')
  })
})
