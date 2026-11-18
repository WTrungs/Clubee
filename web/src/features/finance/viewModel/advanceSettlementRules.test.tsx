import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { canUploadVoucher, fundBalance } from '@/api/mocks/mockFinance'
import { vnDate } from '@/api/mocks/mockTime'
import { eventFundId, generalFundId } from '@/api/mocks/seed/financeSeed'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { eventRepository } from '@/features/event/model/eventRepository'
import { memberRepository } from '@/features/member/model/memberRepository'
import { formatDate } from '@/shared/format/formatDate'
import { createTestWrapper, signInAs } from '@/testUtils'
import { advanceRepository } from '../model/advanceRepository'
import type { AdvanceDetail } from '../model/advanceTypes'
import { financeRepository } from '../model/financeRepository'
import { AdvanceDetailSheet } from '../view/AdvanceDetailSheet'
import { closurePreview, closureText, settlementProgress } from './advanceDisplay'
import { closeAdvanceSchema, settlementLineSchema } from './advanceSchemas'
import { useAdvanceSettlementViewModel } from './useAdvanceSettlementViewModel'
import { settleOpenAdvanceCount } from './useFundPanelViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const general = generalFundId('c-guitar')
const exchange = eventFundId('e-exchange')
const seeded = () => {
  const found = db.advances.find((advance) => advance.id === 'adv-strings')
  if (!found) throw new Error('Thiếu tạm ứng seed')
  return found
}
let voucherCount = 0
/** Một chứng từ đã tải lên của người này cho CLB Guitar. */
function voucher(userId: string): string {
  voucherCount += 1
  const id = `f-settle-${voucherCount}`
  db.attachments.push({ id, name: `${id}.pdf`, size: 1000, contentType: 'application/pdf', uploadedBy: userId, uploadedAt: vnDate(0), voucherClubId: 'c-guitar' })
  return id
}

/** Tạm ứng seed 400.000 đ của u-huy: u-anh duyệt, u-mai ghi đã ứng. */
async function disbursedStrings(): Promise<AdvanceDetail> {
  signInAs('u-anh')
  await advanceRepository.transition('c-guitar', 'adv-strings', { action: 'APPROVE', version: seeded().version })
  signInAs('u-mai')
  return advanceRepository.transition('c-guitar', 'adv-strings', { action: 'DISBURSE', version: seeded().version })
}

async function submit(amount: number, description = 'Mua dây đàn') {
  signInAs('u-huy')
  return advanceRepository.submitLine('c-guitar', 'adv-strings', { amount, description, spentOn: vnDate(0), attachmentIds: [voucher('u-huy')], version: seeded().version })
}

async function decide(lineId: string, action: 'CONFIRM' | 'RETURN', note?: string) {
  signInAs('u-mai')
  return advanceRepository.decideLine('c-guitar', 'adv-strings', lineId, { action, note, version: seeded().version })
}

async function closeStrings(refundOn?: string) {
  signInAs('u-mai')
  return advanceRepository.close('c-guitar', 'adv-strings', { refundOn, version: seeded().version })
}

async function clubWrapper() {
  const club = await clubRepository.getClub('c-guitar')
  const { wrapper: Base } = createTestWrapper('/clubs/c-guitar/finance')
  return ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
    </Base>
  )
}

describe('submitting settlement vouchers (FR-FIN-08)', () => {
  it('lets only the requester submit, several times, each with at least one voucher', async () => {
    const disbursed = await disbursedStrings()
    // Thủ quỹ chốt được ngay (người ứng trả lại toàn bộ); không có lần nộp nào để xác nhận.
    expect(disbursed.allowedActions).toEqual(['CLOSE'])
    signInAs('u-mai')
    const other = await fail(
      advanceRepository.submitLine('c-guitar', 'adv-strings', { amount: 100_000, description: 'Mua dây', spentOn: vnDate(0), attachmentIds: [voucher('u-mai')], version: seeded().version }),
    )
    expect(other).toMatchObject({ status: 403, code: 'FORBIDDEN' })

    signInAs('u-huy')
    expect((await advanceRepository.get('c-guitar', 'adv-strings')).allowedActions).toEqual(['SUBMIT_SETTLEMENT'])
    const noVoucher = await fail(advanceRepository.submitLine('c-guitar', 'adv-strings', { amount: 100_000, description: 'Mua dây', spentOn: vnDate(0), attachmentIds: [], version: seeded().version }))
    expect(noVoucher?.fieldErrors.map((fieldError) => fieldError.field)).toEqual(['attachmentIds'])
    const future = await fail(
      advanceRepository.submitLine('c-guitar', 'adv-strings', { amount: 100_000, description: 'Mua dây', spentOn: vnDate(1), attachmentIds: [voucher('u-huy')], version: seeded().version }),
    )
    expect(future?.fieldErrors.map((fieldError) => fieldError.field)).toEqual(['spentOn'])

    await submit(150_000, 'Dây đàn lần 1')
    const second = await submit(100_000, 'Dây đàn lần 2')
    expect(second.lines.map((line) => [line.description, line.status])).toEqual([
      ['Dây đàn lần 2', 'SUBMITTED'],
      ['Dây đàn lần 1', 'SUBMITTED'],
    ])
    expect(db.notifications.filter((notification) => notification.title === 'Chứng từ quyết toán chờ xác nhận: Mua dây đàn dự phòng cho buổi tập tháng 12')).toHaveLength(2)
    signInAs('u-mai')
    expect((await advanceRepository.get('c-guitar', 'adv-strings')).allowedActions).toEqual(['DECIDE_LINES'])
  })

  it('lets someone holding an advance upload vouchers even without other finance rights', async () => {
    await disbursedStrings()
    for (const position of db.positions.filter((candidate) => candidate.userId === 'u-huy' && candidate.clubId === 'c-guitar')) position.endOn = vnDate(-1)
    expect(canUploadVoucher('u-huy', 'c-guitar')).toBe(true)
    // Chưa ứng tiền thì người không có quyền thu chi không tải được.
    seeded().status = 'APPROVED'
    expect(canUploadVoucher('u-huy', 'c-guitar')).toBe(false)
  })

  it('refuses a stale version and a voucher submitted before the money was handed over', async () => {
    signInAs('u-huy')
    expect((await fail(advanceRepository.submitLine('c-guitar', 'adv-strings', { amount: 1, description: 'abc', spentOn: vnDate(0), attachmentIds: [voucher('u-huy')], version: seeded().version })))?.code).toBe(
      'INVALID_TRANSITION',
    )
    await disbursedStrings()
    signInAs('u-huy')
    expect((await fail(advanceRepository.submitLine('c-guitar', 'adv-strings', { amount: 1, description: 'abc', spentOn: vnDate(0), attachmentIds: [voucher('u-huy')], version: 0 })))?.status).toBe(409)
  })
})

describe('confirming and returning vouchers (FR-FIN-08)', () => {
  it('confirms into partially settled, returns with a note, and the requester submits again', async () => {
    await disbursedStrings()
    const first = await submit(250_000, 'Dây đàn')
    const confirmed = await decide(first.lines[0]?.id ?? '', 'CONFIRM')
    expect(confirmed).toMatchObject({ status: 'PARTIALLY_SETTLED', confirmedAmount: 250_000, allowedActions: ['CLOSE'] })

    const wrong = await submit(90_000, 'Hóa đơn mờ')
    const lineId = wrong.lines[0]?.id ?? ''
    expect((await fail(decide(lineId, 'RETURN')))?.fieldErrors.map((fieldError) => fieldError.field)).toEqual(['note'])
    const returned = await decide(lineId, 'RETURN', 'Hóa đơn không đọc được, chụp lại giúp.')
    expect(returned.lines[0]).toMatchObject({ status: 'RETURNED', note: 'Hóa đơn không đọc được, chụp lại giúp.', decidedBy: { id: 'u-mai' } })
    expect(returned.confirmedAmount).toBe(250_000)
    expect((await fail(decide(lineId, 'CONFIRM')))?.code).toBe('INVALID_TRANSITION')
    const again = await submit(90_000, 'Hóa đơn chụp lại')
    expect(again.lines).toHaveLength(3)

    signInAs('u-huy')
    expect(await fail(advanceRepository.decideLine('c-guitar', 'adv-strings', again.lines[0]?.id ?? '', { action: 'CONFIRM', version: seeded().version }))).toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    })
  })
})

describe('closing an advance (FR-FIN-08)', () => {
  it('records a refund adjustment when less was spent', async () => {
    await disbursedStrings()
    const line = await submit(250_000)
    await decide(line.lines[0]?.id ?? '', 'CONFIRM')
    const before = fundBalance(general)
    const closed = await closeStrings()
    expect(closed).toMatchObject({ status: 'SETTLED', closure: { kind: 'REFUND', amount: 150_000, closedBy: { id: 'u-mai' } }, allowedActions: [] })
    expect(fundBalance(general)).toBe(before + 150_000)
    const refund = await financeRepository.transaction('c-guitar', closed.closure?.transactionId ?? '')
    expect(refund).toMatchObject({ type: 'ADJUSTMENT', status: 'POSTED', amount: 150_000, advanceId: 'adv-strings' })
    expect(refund.description).toContain('Hoàn tạm ứng')
    expect(db.notifications.some((notification) => notification.title === 'Tạm ứng đã quyết toán: Mua dây đàn dự phòng cho buổi tập tháng 12')).toBe(true)
  })

  it('proposes a top-up expense in the requester name when more was spent, which they cannot approve themselves', async () => {
    await disbursedStrings()
    const line = await submit(460_000)
    await decide(line.lines[0]?.id ?? '', 'CONFIRM')
    const before = fundBalance(general)
    const closed = await closeStrings()
    expect(closed.closure).toMatchObject({ kind: 'TOP_UP', amount: 60_000 })
    expect(fundBalance(general)).toBe(before)
    const topUp = await financeRepository.transaction('c-guitar', closed.closure?.transactionId ?? '')
    expect(topUp).toMatchObject({ type: 'EXPENSE', status: 'PROPOSED', amount: 60_000, proposer: { id: 'u-huy' } })
    expect(topUp.attachments).toHaveLength(1)
    signInAs('u-huy')
    const self = await financeRepository.transaction('c-guitar', topUp.id)
    expect(await fail(financeRepository.transition('c-guitar', topUp.id, { action: 'APPROVE', version: self.version }))).toMatchObject({ status: 403, code: 'SELF_APPROVAL' })
  })

  it('records nothing when the vouchers match, and refuses while a submission is still waiting', async () => {
    await disbursedStrings()
    const line = await submit(400_000)
    expect(await fail(closeStrings())).toMatchObject({ status: 422, code: 'ADVANCE_HAS_PENDING_LINES' })
    await decide(line.lines[0]?.id ?? '', 'CONFIRM')
    expect((await fail(advanceRepository.close('c-guitar', 'adv-strings', { version: 0 })))?.status).toBe(409)
    const transactions = db.transactions.length
    const before = fundBalance(general)
    expect((await closeStrings()).closure).toMatchObject({ kind: 'EXACT', amount: 0, transactionId: null })
    expect(db.transactions).toHaveLength(transactions)
    expect(fundBalance(general)).toBe(before)
    expect((await fail(closeStrings()))?.code).toBe('INVALID_TRANSITION')
  })

  it('checks the refund date', async () => {
    await disbursedStrings()
    expect((await fail(closeStrings(vnDate(1))))?.fieldErrors.map((fieldError) => fieldError.field)).toEqual(['refundOn'])
    expect((await closeStrings(vnDate(0))).closure).toMatchObject({ kind: 'REFUND', amount: 400_000 })
  })
})

describe('open advances block settling, closing and resigning (FR-FIN-11, BR-EVT-05, BR-MEM-03)', () => {
  it('blocks settling the event fund and closing the event until the advance is closed', async () => {
    signInAs('u-anh')
    const proposed = await advanceRepository.propose('c-guitar', { fundId: exchange, amount: 300_000, purpose: 'Mua quà cho khách mời', category: 'OTHER_EXPENSE', settleBy: vnDate(5) })
    signInAs('u-mai')
    expect((await financeRepository.fund('c-guitar', exchange)).openAdvanceCount).toBe(1)
    const fund = await financeRepository.fund('c-guitar', exchange)
    expect(fund.allowedActions).not.toContain('SETTLE')
    expect(settleOpenAdvanceCount(fund)).toBe(1)
    expect(settleOpenAdvanceCount({ ...fund, event: fund.event && { ...fund.event, status: 'ONGOING' } })).toBe(0)
    expect(await fail(financeRepository.settle('c-guitar', exchange, fund.version))).toMatchObject({ status: 422, code: 'FUND_HAS_OPEN_ADVANCES' })

    signInAs('u-anh')
    const event = await eventRepository.get('c-guitar', 'e-exchange')
    expect(event).toMatchObject({ openAdvanceCount: 1, fundStatus: 'OPEN' })
    const blocked = await fail(eventRepository.transition('c-guitar', 'e-exchange', { action: 'CLOSE', version: event.version }))
    expect(blocked).toMatchObject({ status: 422, code: 'EVENT_HAS_OPEN_ADVANCES' })
    expect(blocked?.detail).toContain('1 tạm ứng')

    signInAs('u-huy')
    await advanceRepository.transition('c-guitar', proposed.id, { action: 'APPROVE', version: proposed.version })
    signInAs('u-mai')
    let current = await advanceRepository.get('c-guitar', proposed.id)
    current = await advanceRepository.transition('c-guitar', proposed.id, { action: 'DISBURSE', version: current.version })
    signInAs('u-anh')
    const exchangeVoucher = voucher('u-anh')
    current = await advanceRepository.submitLine('c-guitar', proposed.id, { amount: 300_000, description: 'Quà khách mời', spentOn: vnDate(0), attachmentIds: [exchangeVoucher], version: current.version })
    signInAs('u-mai')
    current = await advanceRepository.decideLine('c-guitar', proposed.id, current.lines[0]?.id ?? '', { action: 'CONFIRM', version: current.version })
    await advanceRepository.close('c-guitar', proposed.id, { version: current.version })

    const open = await financeRepository.fund('c-guitar', exchange)
    expect(open.openAdvanceCount).toBe(0)
    await financeRepository.settle('c-guitar', exchange, open.version)
    signInAs('u-anh')
    const closable = await eventRepository.get('c-guitar', 'e-exchange')
    expect(closable.allowedActions).toContain('CLOSE')
    expect((await eventRepository.transition('c-guitar', 'e-exchange', { action: 'CLOSE', version: closable.version })).status).toBe('CLOSED')
  })

  it('lists an open advance among the things to finish before resigning, with a link to it', async () => {
    signInAs('u-huy')
    const mine = await memberRepository.myMembership('c-guitar')
    expect(mine.resignBlockers.filter((blocker) => blocker.kind === 'ADVANCE')).toEqual([
      { kind: 'ADVANCE', refId: 'adv-strings', clubId: 'c-guitar', title: 'Mua dây đàn dự phòng cho buổi tập tháng 12 (400.000 đ)' },
    ])
  })

  it('hides the open advance count from members who cannot see advances', async () => {
    signInAs('u-hieu')
    expect((await financeRepository.fund('c-guitar', general)).openAdvanceCount).toBeNull()
  })
})

describe('settlement display and schemas (FR-FIN-08)', () => {
  it('words the reconciliation and the closing outcome', () => {
    expect(settlementProgress(400_000, 250_000)).toEqual({ remaining: 150_000, over: 0 })
    expect(settlementProgress(400_000, 460_000)).toEqual({ remaining: 0, over: 60_000 })
    expect(closurePreview(400_000, 250_000)).toMatchObject({ kind: 'REFUND', amount: 150_000 })
    expect(closurePreview(400_000, 460_000).text).toContain('Chi vượt 60.000 đ')
    expect(closurePreview(400_000, 400_000).kind).toBe('EXACT')
    expect(closureText({ kind: 'REFUND', amount: 150_000 })).toBe('Đã nhận lại 150.000 đ tiền thừa.')
  })

  it('checks a submission and the refund date', () => {
    const line = settlementLineSchema('2026-11-18')
    expect(line.safeParse({ amount: '150.000', description: 'Dây đàn', spentDate: '18/11/2026' }).success).toBe(true)
    expect(line.safeParse({ amount: '150.000', description: 'ab', spentDate: '19/11/2026' }).error?.issues.map((issue) => issue.path.join('.'))).toEqual(['description', 'spentDate'])
    const close = closeAdvanceSchema('2026-11-10', '2026-11-18')
    expect(close.safeParse({ refundDate: '09/11/2026' }).success).toBe(false)
    expect(close.safeParse({ refundDate: '12/11/2026' }).success).toBe(true)
  })
})

describe('useAdvanceSettlementViewModel (FR-FIN-08)', () => {
  it('reloads instead of acting twice after a 409, and closes the dialog after a 422', async () => {
    await disbursedStrings()
    const submitted = await submit(400_000)
    signInAs('u-mai')
    const wrapper = await clubWrapper()
    const stale = { ...submitted, version: submitted.version - 1, allowedActions: ['DECIDE_LINES' as const] }
    const { result } = renderHook(() => useAdvanceSettlementViewModel(stale), { wrapper })
    act(() => result.current.confirmLine(submitted.lines[0]?.id ?? ''))
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(seeded().lines[0]?.status).toBe('SUBMITTED')

    const fresh = await advanceRepository.get('c-guitar', 'adv-strings')
    const closing = renderHook(() => useAdvanceSettlementViewModel({ ...fresh, allowedActions: ['CLOSE'] }), { wrapper })
    act(() => closing.result.current.openClose())
    await act(async () => {
      await closing.result.current.submitClose()
    })
    // Còn lần nộp chờ xác nhận: máy chủ trả 422, hộp đóng và trạng thái tải lại.
    await waitFor(() => expect(closing.result.current.dialog).toBeNull())
    expect(seeded().status).toBe('DISBURSED')
  })
})

describe('AdvanceDetailSheet, settlement (FR-FIN-08)', () => {
  it('shows what closing will record, then closes with a refund', async () => {
    await disbursedStrings()
    const line = await submit(250_000, 'Dây đàn')
    await decide(line.lines[0]?.id ?? '', 'CONFIRM')
    signInAs('u-mai')
    render(<AdvanceDetailSheet advanceId="adv-strings" onClose={() => undefined} />, { wrapper: await clubWrapper() })
    const user = userEvent.setup()
    expect(await screen.findByRole('progressbar', { name: 'Tiến độ quyết toán' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Chốt quyết toán' }))
    const dialog = await screen.findByRole('dialog', { name: 'Chốt quyết toán' })
    expect(within(dialog).getByRole('status')).toHaveTextContent('Người ứng hoàn lại 150.000 đ')
    const date = within(dialog).getByRole('textbox', { name: /Ngày nhận lại tiền/ })
    await user.clear(date)
    await user.type(date, '01/01/2099')
    await user.click(within(dialog).getByRole('button', { name: 'Chốt quyết toán' }))
    expect(await within(dialog).findByText('Ngày nhận lại từ ngày ứng đến hôm nay.')).toBeInTheDocument()
    await user.clear(date)
    await user.type(date, formatDate(vnDate(0)))
    await user.click(within(dialog).getByRole('button', { name: 'Chốt quyết toán' }))
    await waitFor(() => expect(seeded().status).toBe('SETTLED'))
    expect(await screen.findByText(/Đã nhận lại 150.000 đ tiền thừa/)).toBeInTheDocument()
  })
})
