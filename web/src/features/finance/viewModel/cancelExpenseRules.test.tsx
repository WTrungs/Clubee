import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { fundBalance } from '@/api/mocks/mockFinance'
import { eventFundId, generalFundId } from '@/api/mocks/seed/financeSeed'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { createTestWrapper, signInAs } from '@/testUtils'
import { financeRepository } from '../model/financeRepository'
import { requestFilterDisplay, transactionStatusDisplay } from './financeDisplay'
import { useTransactionActionsViewModel } from './useTransactionActionsViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const guitar = generalFundId('c-guitar')
const stored = (id: string) => db.transactions.find((transaction) => transaction.id === id)
const cancelCapo = async (reason = 'Thành viên đã tự mua capo, không cần chi nữa.') => {
  const capo = await financeRepository.transaction('c-guitar', 'tx-capo')
  return financeRepository.transition('c-guitar', 'tx-capo', { action: 'CANCEL', version: capo.version, reason })
}
const financeTitles = async (userId: string) => {
  signInAs(userId)
  return (await notificationRepository.list({ category: 'FINANCE', size: 50 })).content.map((item) => item.title)
}

/** Khoản chi đã duyệt ở quỹ `fundId`: ban chủ nhiệm `u-anh` đề xuất, `u-huy` duyệt. */
async function approvedExpense(fundId: string) {
  signInAs('u-anh')
  const proposed = await financeRepository.create('c-guitar', { fundId, type: 'EXPENSE', amount: 100_000, category: 'FOOD', description: 'Nước uống cho BTC', attachmentIds: [] })
  signInAs('u-huy')
  return financeRepository.transition('c-guitar', proposed.id, { action: 'APPROVE', version: proposed.version })
}

describe('cancelling an approved expense (báo cáo 17/11, FR-FIN-03, FR-FIN-04)', () => {
  it('lets the proposer cancel with a reason; the expense never reaches the ledger', async () => {
    signInAs('u-long')
    const capo = await financeRepository.transaction('c-guitar', 'tx-capo')
    expect(capo.allowedActions).toContain('CANCEL')
    const cancelled = await cancelCapo()
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: { id: 'u-long' },
      cancellationReason: 'Thành viên đã tự mua capo, không cần chi nữa.',
      allowedActions: [],
      version: capo.version + 1,
    })
    expect(cancelled.cancelledAt).not.toBeNull()
    expect(fundBalance(guitar)).toBe(5_470_000)
    signInAs('u-mai')
    expect((await financeRepository.transaction('c-guitar', 'tx-capo')).allowedActions).not.toContain('POST')
  })

  it('lets any board member cancel, and the treasurer sees both post and cancel before that', async () => {
    signInAs('u-mai')
    expect((await financeRepository.transaction('c-guitar', 'tx-capo')).allowedActions).toEqual(['POST', 'CANCEL'])
    signInAs('u-huy')
    expect((await cancelCapo()).status).toBe('CANCELLED')
  })

  it('refuses an event lead who is neither the proposer nor on the board, before looking at the version', async () => {
    const approved = await approvedExpense(eventFundId('e-livestream'))
    signInAs('u-kiet')
    const seen = await financeRepository.transaction('c-guitar', approved.id)
    expect(seen.allowedActions).not.toContain('CANCEL')
    const error = await fail(financeRepository.transition('c-guitar', approved.id, { action: 'CANCEL', version: seen.version - 1, reason: 'Không cần chi nữa.' }))
    expect(error).toMatchObject({ status: 403, code: 'FORBIDDEN', detail: 'Chỉ người đề xuất hoặc ban chủ nhiệm được hủy khoản chi đã duyệt.' })
    expect(stored(approved.id)).toMatchObject({ status: 'APPROVED', version: seen.version })
  })

  it('checks the version before the status, and only cancels an approved expense that is not posted yet', async () => {
    signInAs('u-long')
    const capo = await financeRepository.transaction('c-guitar', 'tx-capo')
    expect((await fail(financeRepository.transition('c-guitar', 'tx-capo', { action: 'CANCEL', version: capo.version - 1, reason: 'Không cần chi nữa.' })))?.status).toBe(409)

    signInAs('u-mai')
    const posted = await financeRepository.transition('c-guitar', 'tx-capo', { action: 'POST', version: capo.version })
    signInAs('u-long')
    expect(await fail(financeRepository.transition('c-guitar', 'tx-capo', { action: 'CANCEL', version: posted.version, reason: 'Không cần chi nữa.' }))).toMatchObject({ status: 422, code: 'INVALID_TRANSITION' })

    signInAs('u-linh')
    const standee = await financeRepository.transaction('c-guitar', 'tx-standee')
    expect(standee.allowedActions).not.toContain('CANCEL')
    expect(await fail(financeRepository.transition('c-guitar', 'tx-standee', { action: 'CANCEL', version: standee.version, reason: 'Không cần chi nữa.' }))).toMatchObject({ status: 422, code: 'INVALID_TRANSITION' })
    expect(stored('tx-standee')?.status).toBe('PROPOSED')
  })

  it('needs a reason of 5 to 500 characters', async () => {
    signInAs('u-long')
    const short = await fail(cancelCapo('Bỏ'))
    expect(short).toMatchObject({ status: 400, code: 'VALIDATION', fieldErrors: [{ field: 'reason', message: 'Lý do cần từ 5 đến 500 ký tự.' }] })
    expect((await fail(cancelCapo('x'.repeat(501))))?.status).toBe(400)
    expect(stored('tx-capo')?.status).toBe('APPROVED')
  })

  it('tells the proposer, the approver and the treasurer, but not the one who cancelled', async () => {
    signInAs('u-huy')
    await cancelCapo()
    const title = 'Khoản chi đã bị hủy: Mua capo và pick dự phòng'
    expect(await financeTitles('u-long')).toContain(title)
    expect(await financeTitles('u-anh')).toContain(title)
    expect(await financeTitles('u-mai')).toContain(title)
    expect(await financeTitles('u-huy')).not.toContain(title)
    signInAs('u-mai')
    const [latest] = (await notificationRepository.list({ category: 'FINANCE' })).content
    expect((await notificationRepository.get(latest?.id ?? '')).body).toBe('Lý do: Thành viên đã tự mua capo, không cần chi nữa.')
  })

  it('no longer blocks settling the event fund once cancelled (FR-FIN-11)', async () => {
    const exchange = eventFundId('e-exchange')
    const approved = await approvedExpense(exchange)
    signInAs('u-mai')
    const blocked = await financeRepository.fund('c-guitar', exchange)
    expect(blocked.allowedActions).not.toContain('SETTLE')
    signInAs('u-anh')
    await financeRepository.transition('c-guitar', approved.id, { action: 'CANCEL', version: approved.version, reason: 'Sự kiện đã xong, không mua thêm.' })
    signInAs('u-mai')
    const fund = await financeRepository.fund('c-guitar', exchange)
    expect(fund).toMatchObject({ pendingCount: 0, allowedActions: expect.arrayContaining(['SETTLE']) })
  })

  it('lists a cancelled expense as handled', () => {
    expect(requestFilterDisplay.CLOSED.statuses).toContain('CANCELLED')
    expect(requestFilterDisplay.PENDING.statuses).not.toContain('CANCELLED')
    expect(transactionStatusDisplay.CANCELLED.label).toBe('Đã hủy')
  })
})

describe('cancel action in the transaction sheet', () => {
  it('asks for a reason first, then reports success only after the server saved it', async () => {
    signInAs('u-long')
    const club = await clubRepository.getClub('c-guitar')
    const { wrapper: Base } = createTestWrapper('/clubs/c-guitar/finance')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Base>
        <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
      </Base>
    )
    const capo = await financeRepository.transaction('c-guitar', 'tx-capo')
    const { result } = renderHook(() => useTransactionActionsViewModel('c-guitar', capo), { wrapper })
    expect(result.current.actions).toEqual(['CANCEL'])
    act(() => result.current.request('CANCEL'))
    expect(result.current.dialog).toBe('CANCEL')
    expect(stored('tx-capo')?.status).toBe('APPROVED')
    act(() => result.current.confirm('Thành viên đã tự mua capo, không cần chi nữa.'))
    await waitFor(() => expect(result.current.dialog).toBeNull())
    expect(stored('tx-capo')).toMatchObject({ status: 'CANCELLED', cancelledBy: 'u-long' })
  })
})
