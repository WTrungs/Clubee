import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { fundBalance } from '@/api/mocks/mockFinance'
import { eventFundId, generalFundId } from '@/api/mocks/seed/financeSeed'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { createTestWrapper, signInAs } from '@/testUtils'
import { financeRepository } from '../model/financeRepository'
import type { CreateTransactionRequest } from '../model/financeTypes'
import { useAdjustmentViewModel } from './useAdjustmentViewModel'
import { useTransactionActionsViewModel } from './useTransactionActionsViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const guitar = generalFundId('c-guitar')
const adjustment = (fields: Partial<CreateTransactionRequest> = {}): CreateTransactionRequest => ({
  fundId: guitar,
  type: 'ADJUSTMENT',
  amount: 50_000,
  description: 'Ghi thiếu tiền thuê phòng theo hóa đơn',
  originalTransactionId: 'tx-room-oct',
  direction: 'OUT',
  attachmentIds: [],
  ...fields,
})
const titlesOf = async (userId: string) => {
  signInAs(userId)
  return (await notificationRepository.list({ category: 'FINANCE', size: 50 })).content.map((item) => item.title)
}
const statusOf = (id: string) => db.transactions.find((transaction) => transaction.id === id)?.status

async function clubWrapper(clubId: string) {
  const club = await clubRepository.getClub(clubId)
  const { wrapper: Base } = createTestWrapper(`/clubs/${clubId}/finance`)
  return ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId, club }}>{children}</ClubContext.Provider>
    </Base>
  )
}

describe('adjustments (FR-FIN-05, BR-FIN-01)', () => {
  it('posts an increase right away and links it to the original transaction', async () => {
    signInAs('u-mai')
    const created = await financeRepository.create('c-guitar', adjustment({ direction: 'IN', amount: 30_000, originalTransactionId: 'tx-shirts', description: 'Thu thêm tiền áo còn thiếu' }))
    expect(created).toMatchObject({ type: 'ADJUSTMENT', status: 'POSTED', flow: 'IN', category: 'OTHER_INCOME', original: { id: 'tx-shirts' }, poster: { id: 'u-mai' } })
    expect(fundBalance(guitar)).toBe(5_500_000)
    const original = await financeRepository.transaction('c-guitar', 'tx-shirts')
    expect(original.adjustments.map((item) => item.id)).toEqual([created.id])
  })

  it('holds a decrease until another board member approves it, then posts it in one step', async () => {
    signInAs('u-mai')
    const created = await financeRepository.create('c-guitar', adjustment())
    expect(created).toMatchObject({ status: 'PROPOSED', flow: 'OUT', allowedActions: ['WITHDRAW'] })
    expect(fundBalance(guitar)).toBe(5_470_000)
    expect(await titlesOf('u-anh')).toContain('Điều chỉnh giảm quỹ cần duyệt: Thuê phòng tập tháng 10')

    signInAs('u-mai')
    const self = await fail(financeRepository.transition('c-guitar', created.id, { action: 'APPROVE', version: created.version }))
    expect(self).toMatchObject({ status: 403, code: 'SELF_APPROVAL' })

    signInAs('u-anh')
    const approved = await financeRepository.transition('c-guitar', created.id, { action: 'APPROVE', version: created.version })
    expect(approved).toMatchObject({ status: 'POSTED', approver: { id: 'u-anh' }, poster: { id: 'u-mai' } })
    expect(approved.allowedActions).not.toContain('POST')
    expect(fundBalance(guitar)).toBe(5_420_000)
    expect(await titlesOf('u-mai')).toContain('Điều chỉnh giảm quỹ đã được duyệt và ghi sổ: Ghi thiếu tiền thuê phòng theo hóa đơn')
  })

  it('checks the balance when approving a decrease (BR-FIN-08)', async () => {
    const acoustic = eventFundId('e-acoustic-sep')
    signInAs('u-mai')
    const created = await financeRepository.create('c-guitar', adjustment({ fundId: acoustic, amount: 300_000, originalTransactionId: 'tx-acoustic-deposit' }))
    signInAs('u-anh')
    const error = await fail(financeRepository.transition('c-guitar', created.id, { action: 'APPROVE', version: created.version }))
    expect(error).toMatchObject({ status: 422, code: 'INSUFFICIENT_FUNDS', detail: 'Quỹ chỉ còn 200.000 đ, không đủ cho điều chỉnh giảm 300.000 đ.' })
    expect(statusOf(created.id)).toBe('PROPOSED')
  })

  it('lets a board member reject a decrease with a reason', async () => {
    signInAs('u-mai')
    const created = await financeRepository.create('c-guitar', adjustment())
    signInAs('u-huy')
    await financeRepository.transition('c-guitar', created.id, { action: 'REJECT', reason: 'Hóa đơn đúng số tiền ban đầu.', version: created.version })
    expect(statusOf(created.id)).toBe('REJECTED')
    expect(await titlesOf('u-mai')).toContain('Điều chỉnh giảm quỹ bị từ chối: Ghi thiếu tiền thuê phòng theo hóa đơn')
  })

  it('only adjusts posted transactions of the same open fund, never a transfer', async () => {
    const shirts = db.transactions.find((transaction) => transaction.id === 'tx-shirts')
    if (!shirts) throw new Error('Thiếu khoản thu bán áo trong seed')
    db.transactions.push({ ...structuredClone(shirts), id: 'tx-transfer', type: 'TRANSFER', category: 'FUND_TRANSFER' })
    signInAs('u-mai')
    for (const originalTransactionId of ['tx-standee', 'tx-winter-sponsor', 'tx-transfer', 'tx-missing']) {
      const error = await fail(financeRepository.create('c-guitar', adjustment({ originalTransactionId })))
      expect(error, originalTransactionId).toMatchObject({ status: 422, code: 'INVALID_ORIGINAL' })
    }
    expect((await financeRepository.transaction('c-guitar', 'tx-standee')).allowedActions).not.toContain('ADJUST')
  })

  it('needs the treasurer, a direction and a reason of at least 5 characters', async () => {
    const before = db.transactions.length
    signInAs('u-anh')
    expect((await fail(financeRepository.create('c-guitar', adjustment())))?.status).toBe(403)
    expect((await financeRepository.transaction('c-guitar', 'tx-room-oct')).allowedActions).not.toContain('ADJUST')
    expect(db.transactions).toHaveLength(before)

    signInAs('u-mai')
    expect((await financeRepository.transaction('c-guitar', 'tx-room-oct')).allowedActions).toEqual(['ADJUST'])
    const invalid = await fail(financeRepository.create('c-guitar', adjustment({ description: 'Sai', direction: undefined })))
    expect(invalid?.fieldErrors.map((fieldError) => fieldError.field).sort()).toEqual(['description', 'direction'])
  })

  it('stops offering adjustments once the fund is settled, and refuses to post into it', async () => {
    const exchange = eventFundId('e-exchange')
    signInAs('u-mai')
    const pending = await financeRepository.create('c-guitar', adjustment({ fundId: exchange, amount: 10_000, originalTransactionId: 'tx-exchange-tickets' }))
    const fund = db.funds.find((candidate) => candidate.id === exchange)
    if (fund) fund.status = 'SETTLED'
    expect((await financeRepository.transaction('c-guitar', 'tx-exchange-tickets')).allowedActions).not.toContain('ADJUST')
    signInAs('u-anh')
    const error = await fail(financeRepository.transition('c-guitar', pending.id, { action: 'APPROVE', version: pending.version }))
    expect(error).toMatchObject({ status: 422, code: 'FUND_SETTLED' })
  })
})

describe('adjustment view model', () => {
  it('asks for confirmation with the balance before approving a decrease, since approval posts it', async () => {
    signInAs('u-mai')
    const created = await financeRepository.create('c-guitar', adjustment())
    signInAs('u-anh')
    const wrapper = await clubWrapper('c-guitar')
    const detail = await financeRepository.transaction('c-guitar', created.id)
    const { result } = renderHook(() => useTransactionActionsViewModel('c-guitar', detail), { wrapper })
    act(() => result.current.request('APPROVE'))
    expect(result.current.dialog).toBe('APPROVE')
    expect(statusOf(created.id)).toBe('PROPOSED')
    await waitFor(() => expect(result.current.currentBalance).toBe(5_470_000))
    act(() => result.current.confirm())
    await waitFor(() => expect(statusOf(created.id)).toBe('POSTED'))
  })

  it('records an increase and closes the form after the server saves it', async () => {
    signInAs('u-mai')
    const wrapper = await clubWrapper('c-guitar')
    const onDone = vi.fn()
    const { result } = renderHook(() => useAdjustmentViewModel({ id: 'tx-shirts', fundId: guitar }, onDone), { wrapper })
    act(() => {
      result.current.form.setValue('direction', 'IN')
      result.current.form.setValue('amount', '30.000')
      result.current.form.setValue('reason', 'Thu thêm tiền áo còn thiếu')
    })
    await act(() => result.current.submit())
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(db.transactions.at(-1)).toMatchObject({ type: 'ADJUSTMENT', direction: 'IN', status: 'POSTED', originalId: 'tx-shirts' })
  })

  it('warns that a decrease needs approval and shows the server reason when the original is not adjustable', async () => {
    signInAs('u-mai')
    const wrapper = await clubWrapper('c-guitar')
    const { result } = renderHook(() => useAdjustmentViewModel({ id: 'tx-standee', fundId: guitar }, () => {}), { wrapper })
    act(() => {
      result.current.form.setValue('direction', 'OUT')
      result.current.form.setValue('amount', '10.000')
      result.current.form.setValue('reason', 'Thử điều chỉnh khoản chưa ghi sổ')
    })
    expect(result.current.decreasing).toBe(true)
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.errorMessage).toBe('Chỉ điều chỉnh được giao dịch đã ghi sổ của quỹ này, không gồm giao dịch chuyển quỹ.'))
  })
})
