import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { duesItemStatus, runDuesReminders } from '@/api/mocks/mockDues'
import { fundBalance } from '@/api/mocks/mockFinance'
import { vnDate } from '@/api/mocks/mockTime'
import { generalFundId } from '@/api/mocks/seed/financeSeed'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { duesRepository } from '../model/duesRepository'
import { remainingDue } from '../model/duesRules'
import type { DuesItem } from '../model/duesTypes'
import { financeRepository } from '../model/financeRepository'
import { DuesCampaignPanel } from '../view/DuesCampaignPanel'
import { confirmPaymentSchema } from './duesSchemas'
import { useConfirmPaymentViewModel } from './useConfirmPaymentViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const CAMPAIGN = 'dues-guitar-hk1'
const general = generalFundId('c-guitar')
const campaign = () => {
  const found = db.duesCampaigns.find((candidate) => candidate.id === CAMPAIGN)
  if (!found) throw new Error('Thiếu đợt seed')
  return found
}
const dbItem = (userId: string) => {
  const found = db.duesItems.find((item) => item.campaignId === CAMPAIGN && item.userId === userId)
  if (!found) throw new Error(`Thiếu ${userId} trong đợt`)
  return found
}
async function itemOf(userId: string): Promise<DuesItem> {
  const found = (await duesRepository.items('c-guitar', CAMPAIGN, { size: 100 })).content.find((item) => item.member.id === userId)
  if (!found) throw new Error(`Thiếu ${userId}`)
  return found
}
async function pay(userId: string, amount: number, version?: number) {
  const item = await itemOf(userId)
  return duesRepository.recordPayment('c-guitar', CAMPAIGN, item.id, { amount, paidOn: vnDate(0), version: version ?? item.version })
}
const recipientsOf = (title: string) => {
  const ids = db.notifications.filter((notification) => notification.title === title).map((notification) => notification.id)
  return db.notificationRecipients.filter((recipient) => ids.includes(recipient.notificationId)).map((recipient) => recipient.userId)
}

async function clubWrapper() {
  const club = await clubRepository.getClub('c-guitar')
  const { wrapper: Base } = createTestWrapper(`/clubs/c-guitar/finance?view=dues&dues=${CAMPAIGN}`)
  return ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
    </Base>
  )
}

describe('confirming a payment (FR-FIN-10)', () => {
  it('posts a dues income to the general fund, in full or in two parts, and tells the payer', async () => {
    signInAs('u-mai')
    const before = fundBalance(general)
    const full = await pay('u-long', 100_000)
    expect(full).toMatchObject({ status: 'PAID', paidAmount: 100_000, payments: [{ amount: 100_000, confirmedBy: { id: 'u-mai' } }] })
    const first = await pay('u-vy', 40_000)
    expect(first).toMatchObject({ status: 'PARTIAL', paidAmount: 40_000 })
    const second = await pay('u-vy', 60_000)
    expect(second).toMatchObject({ status: 'PAID', paidAmount: 100_000 })
    expect(second.payments.map((payment) => payment.amount)).toEqual([60_000, 40_000])
    expect(fundBalance(general)).toBe(before + 200_000)

    const income = await financeRepository.transaction('c-guitar', full.payments[0]?.transactionId ?? '')
    expect(income).toMatchObject({ type: 'INCOME', status: 'POSTED', category: 'MEMBER_DUES', amount: 100_000, occurredOn: vnDate(0) })
    expect(income.description).toBe('Đóng quỹ Quỹ học kỳ 1: Bùi Đức Long')
    const ledger = await financeRepository.transactions('c-guitar', { fundId: general, category: 'MEMBER_DUES', size: 50 })
    expect(ledger.content.filter((row) => row.description.startsWith('Đóng quỹ Quỹ học kỳ 1'))).toHaveLength(3)
    expect(recipientsOf('Đã ghi nhận nộp quỹ: Quỹ học kỳ 1').filter((userId) => userId === 'u-vy')).toHaveLength(2)
    expect((await duesRepository.get('c-guitar', CAMPAIGN)).allowedActions).not.toContain('EDIT_AMOUNT')
  })

  it('refuses more than what is owed, a future date, a fully paid member and a closed campaign', async () => {
    signInAs('u-mai')
    expect((await fail(pay('u-long', 100_001)))?.fieldErrors.map((fieldError) => fieldError.field)).toEqual(['amount'])
    const long = await itemOf('u-long')
    const future = await fail(duesRepository.recordPayment('c-guitar', CAMPAIGN, long.id, { amount: 1, paidOn: vnDate(1), version: long.version }))
    expect(future?.fieldErrors.map((fieldError) => fieldError.field)).toEqual(['paidOn'])
    await pay('u-long', 100_000)
    expect(await fail(pay('u-long', 1))).toMatchObject({ status: 422, code: 'ALREADY_PAID' })
    await duesRepository.close('c-guitar', CAMPAIGN, campaign().version)
    expect(await fail(pay('u-vy', 1))).toMatchObject({ status: 422, code: 'CAMPAIGN_CLOSED' })
  })

  it('records one income only when the same confirmation is sent twice (NFR-REL-01)', async () => {
    signInAs('u-mai')
    const vy = await itemOf('u-vy')
    const transactions = db.transactions.length
    await duesRepository.recordPayment('c-guitar', CAMPAIGN, vy.id, { amount: 50_000, paidOn: vnDate(0), version: vy.version })
    expect(await fail(duesRepository.recordPayment('c-guitar', CAMPAIGN, vy.id, { amount: 50_000, paidOn: vnDate(0), version: vy.version }))).toMatchObject({ status: 409 })
    expect(db.transactions).toHaveLength(transactions + 1)
  })

  it('needs the ledger right', async () => {
    signInAs('u-anh')
    expect(await fail(pay('u-long', 100_000))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })
})

describe('dues reminders (FR-FIN-10)', () => {
  it('reminds who still owes once before the deadline and once after, never the exempt or fully paid', async () => {
    signInAs('u-mai')
    await pay('u-long', 100_000)
    const vy = await itemOf('u-vy')
    await duesRepository.setExemption('c-guitar', CAMPAIGN, vy.id, { kind: 'EXEMPT', reason: 'Đi thực tập xa cả kỳ.', version: vy.version })
    await pay('u-kiet', 30_000)
    campaign().dueOn = vnDate(2)
    runDuesReminders()
    runDuesReminders()
    const soon = recipientsOf('Sắp tới hạn đóng quỹ: Quỹ học kỳ 1')
    expect(soon).toHaveLength(14)
    expect(soon).not.toContain('u-long')
    expect(soon).not.toContain('u-vy')
    expect(soon.filter((userId) => userId === 'u-kiet')).toHaveLength(1)
    expect(db.notifications.find((notification) => notification.title === 'Sắp tới hạn đóng quỹ: Quỹ học kỳ 1' && db.notificationRecipients.some((r) => r.notificationId === notification.id && r.userId === 'u-kiet'))?.body).toContain(
      'Bạn còn thiếu 70.000 đ',
    )

    campaign().dueOn = vnDate(-1)
    runDuesReminders()
    runDuesReminders()
    expect(recipientsOf('Quá hạn đóng quỹ: Quỹ học kỳ 1')).toHaveLength(14)
  })

  it('reminds again after the deadline is moved', async () => {
    campaign().dueOn = vnDate(2)
    runDuesReminders()
    signInAs('u-mai')
    await duesRepository.update('c-guitar', CAMPAIGN, { dueOn: vnDate(1), version: campaign().version })
    runDuesReminders()
    expect(recipientsOf('Sắp tới hạn đóng quỹ: Quỹ học kỳ 1').filter((userId) => userId === 'u-long')).toHaveLength(2)
  })

  it('does not remind on a closed campaign or far from the deadline', async () => {
    runDuesReminders()
    expect(recipientsOf('Sắp tới hạn đóng quỹ: Quỹ học kỳ 1')).toEqual([])
    campaign().dueOn = vnDate(-1)
    campaign().status = 'CLOSED'
    runDuesReminders()
    expect(recipientsOf('Quá hạn đóng quỹ: Quỹ học kỳ 1')).toEqual([])
  })
})

describe('dues item status and payment schema (FR-FIN-10)', () => {
  it('derives the status from what is due and what was paid', () => {
    const base = { amountDue: 100_000, exemption: null, payments: [] }
    const payment = (amount: number) => ({ id: 'p', amount, paidOn: '', confirmedBy: 'u', confirmedAt: '', transactionId: 't' })
    expect(duesItemStatus(base)).toBe('UNPAID')
    expect(duesItemStatus({ ...base, payments: [payment(40_000)] })).toBe('PARTIAL')
    expect(duesItemStatus({ ...base, payments: [payment(40_000), payment(60_000)] })).toBe('PAID')
    expect(duesItemStatus({ ...base, amountDue: 0, exemption: { kind: 'EXEMPT', reason: 'x', by: 'u', at: '' } })).toBe('EXEMPT')
    expect(remainingDue({ amountDue: 100_000, paidAmount: 30_000 })).toBe(70_000)
    expect(remainingDue({ amountDue: 0, paidAmount: 0 })).toBe(0)
  })

  it('checks the amount against what is owed and the date against today', () => {
    const schema = confirmPaymentSchema('2026-11-18', 70_000)
    expect(schema.safeParse({ amount: '70.000', paidDate: '18/11/2026' }).success).toBe(true)
    expect(schema.safeParse({ amount: '70.001', paidDate: '19/11/2026' }).error?.issues.map((issue) => issue.path.join('.'))).toEqual(['paidDate', 'amount'])
  })
})

describe('useConfirmPaymentViewModel (FR-FIN-10)', () => {
  it('closes and reloads after a 409, and keeps the dialog open on a 400', async () => {
    signInAs('u-mai')
    const wrapper = await clubWrapper()
    const { result } = renderHook(() => useConfirmPaymentViewModel(CAMPAIGN), { wrapper })
    const long = await itemOf('u-long')
    dbItem('u-long').version += 1
    act(() => result.current.open(long))
    await act(async () => {
      await result.current.submit()
    })
    await waitFor(() => expect(result.current.item).toBeNull())
    expect(dbItem('u-long').payments).toEqual([])

    const fresh = await itemOf('u-long')
    act(() => result.current.open(fresh))
    // Kịch bản dựng tay để máy chủ trả 400 ở ô số tiền: thêm thẳng một khoản nộp vào db mà không tăng phiên bản (thực tế mỗi
    // lần xác nhận đều tăng phiên bản nên sẽ ra 409). Hộp phải vẫn mở và lỗi gắn vào ô.
    dbItem('u-long').payments.push({ id: 'p-other', amount: 90_000, paidOn: vnDate(0), confirmedBy: 'u-mai', confirmedAt: vnDate(0), transactionId: 'tx-other' })
    await act(async () => {
      await result.current.submit()
    })
    await waitFor(() => expect(result.current.form.getFieldState('amount').error?.message).toContain('Số tiền từ 1 đ tới số còn thiếu 10.000 đ'))
    expect(result.current.item).not.toBeNull()
  })
})

describe('DuesCampaignPanel, confirming a payment (FR-FIN-10)', () => {
  it('prefills what is owed and records it, then shows the payment with a link to the income', async () => {
    signInAs('u-mai')
    render(<DuesCampaignPanel campaignId={CAMPAIGN} onBack={() => undefined} />, { wrapper: await clubWrapper() })
    const user = userEvent.setup()
    const buttons = await screen.findAllByRole('button', { name: 'Xác nhận đã nộp: Bùi Đức Long' })
    await user.click(buttons[0] as HTMLElement)
    const dialog = await screen.findByRole('dialog', { name: 'Xác nhận đã nộp' })
    expect(within(dialog).getByRole('textbox', { name: /Số tiền nộp/ })).toHaveValue('100.000')
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận' }))
    await waitFor(() => expect(dbItem('u-long').payments).toHaveLength(1))
    expect((await screen.findAllByRole('link', { name: /^Xem khoản thu 100.000 đ ngày/ }))[0]).toHaveAttribute('href', expect.stringContaining('/clubs/c-guitar/finance?tx='))
  })
})
