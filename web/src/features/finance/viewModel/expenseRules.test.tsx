import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { fundBalance } from '@/api/mocks/mockFinance'
import { vnDate } from '@/api/mocks/mockTime'
import { eventFundId, generalFundId } from '@/api/mocks/seed/financeSeed'
import { server } from '@/api/mocks/server'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { createTestWrapper, signInAs } from '@/testUtils'
import { financeRepository } from '../model/financeRepository'
import type { CreateTransactionRequest } from '../model/financeTypes'
import { financeQueryKeys } from './financeQueryKeys'
import { useProposeExpenseViewModel } from './useProposeExpenseViewModel'
import { useTransactionActionsViewModel } from './useTransactionActionsViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const guitar = generalFundId('c-guitar')
const winter = eventFundId('e-winter')
const expense = (fields: Partial<CreateTransactionRequest> = {}): CreateTransactionRequest => ({
  fundId: guitar,
  type: 'EXPENSE',
  amount: 150_000,
  category: 'PRINTING',
  description: 'In tờ rơi giới thiệu CLB',
  attachmentIds: [],
  ...fields,
})
/** Chứng từ đã tải sẵn cho một người, vì Vitest không gửi được FormData. */
const voucherFor = (userId: string, id = `f-${userId}`) => {
  db.attachments.push({ id, name: `${id}.pdf`, size: 1000, contentType: 'application/pdf', uploadedBy: userId, uploadedAt: vnDate(0), voucherClubId: 'c-guitar' })
  return id
}
const titlesOf = async (userId: string) => {
  signInAs(userId)
  return (await notificationRepository.list({ category: 'FINANCE', size: 50 })).content.map((item) => item.title)
}
const latestBody = async (userId: string) => {
  signInAs(userId)
  const [latest] = (await notificationRepository.list({ category: 'FINANCE' })).content
  return (await notificationRepository.get(latest?.id ?? '')).body
}

async function clubWrapper(clubId: string) {
  const club = await clubRepository.getClub(clubId)
  const { wrapper: Base, queryClient } = createTestWrapper(`/clubs/${clubId}/finance`)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId, club }}>{children}</ClubContext.Provider>
    </Base>
  )
  return { wrapper, queryClient }
}

describe('proposing an expense (FR-FIN-02)', () => {
  it('lets a department head propose from the general fund and tells the board, not the proposer', async () => {
    signInAs('u-linh')
    expect((await financeRepository.fund('c-guitar', guitar)).allowedActions).toEqual(['PROPOSE_EXPENSE', 'VIEW_REQUESTS'])
    const created = await financeRepository.create('c-guitar', expense())
    expect(created).toMatchObject({ status: 'PROPOSED', flow: 'OUT', occurredOn: null, allowedActions: ['WITHDRAW'] })
    for (const userId of ['u-anh', 'u-huy', 'u-mai']) expect(await titlesOf(userId)).toContain('Khoản chi cần duyệt: In tờ rơi giới thiệu CLB')
    expect(await titlesOf('u-linh')).toEqual([])
    expect(await latestBody('u-anh')).toBe('150.000 đ từ Quỹ chung, đề xuất bởi Đặng Khánh Linh.')
  })

  it('keeps department heads to the general fund and event leads to their own event fund', async () => {
    signInAs('u-linh')
    const headOnEvent = await fail(financeRepository.create('c-guitar', expense({ fundId: winter })))
    expect(headOnEvent).toMatchObject({ status: 403, detail: expect.stringContaining('chỉ đề xuất chi từ Quỹ chung') })

    signInAs('u-bao')
    expect((await financeRepository.fund('c-guitar', winter)).allowedActions).toEqual(['PROPOSE_EXPENSE', 'VIEW_REQUESTS'])
    expect((await financeRepository.create('c-guitar', expense({ fundId: winter }))).status).toBe('PROPOSED')
    expect((await fail(financeRepository.create('c-guitar', expense())))?.status).toBe(403)

    signInAs('u-hieu')
    const before = db.transactions.length
    expect((await fail(financeRepository.create('c-guitar', expense())))?.status).toBe(403)
    expect(db.transactions).toHaveLength(before)
  })

  it('requires a voucher above the threshold, but not at exactly the threshold (BR-FIN-03)', async () => {
    signInAs('u-linh')
    const missing = await fail(financeRepository.create('c-guitar', expense({ amount: 200_001 })))
    expect(missing?.fieldErrors).toEqual([{ field: 'attachmentIds', message: 'Khoản chi trên 200.000 đ phải có chứng từ.' }])
    expect((await financeRepository.create('c-guitar', expense({ amount: 200_000 }))).status).toBe('PROPOSED')
    const withVoucher = await financeRepository.create('c-guitar', expense({ amount: 900_000, attachmentIds: [voucherFor('u-linh')] }))
    expect(withVoucher.attachments).toHaveLength(1)
  })

  it('only takes expense categories', async () => {
    signInAs('u-linh')
    const error = await fail(financeRepository.create('c-guitar', expense({ category: 'SPONSORSHIP' })))
    expect(error?.fieldErrors.map((fieldError) => fieldError.field)).toEqual(['category'])
  })
})

describe('approving, rejecting and withdrawing (FR-FIN-03, ST-EXP)', () => {
  it('never lets the proposer approve their own expense, not even the president (BR-ACL-01)', async () => {
    signInAs('u-anh')
    const own = await financeRepository.create('c-guitar', expense())
    expect(own.allowedActions).toEqual(['WITHDRAW'])
    const error = await fail(financeRepository.transition('c-guitar', own.id, { action: 'APPROVE', version: own.version }))
    expect(error).toMatchObject({ status: 403, code: 'SELF_APPROVAL' })
    expect(db.transactions.find((transaction) => transaction.id === own.id)?.status).toBe('PROPOSED')

    signInAs('u-huy')
    const seen = await financeRepository.transaction('c-guitar', own.id)
    expect(seen.allowedActions).toEqual(['APPROVE', 'REJECT'])
    const approved = await financeRepository.transition('c-guitar', own.id, { action: 'APPROVE', version: seen.version })
    expect(approved).toMatchObject({ status: 'APPROVED', approver: { id: 'u-huy' } })
    expect(await titlesOf('u-anh')).toContain('Khoản chi đã được duyệt: In tờ rơi giới thiệu CLB')
    expect(await titlesOf('u-mai')).toContain('Khoản chi chờ ghi sổ: In tờ rơi giới thiệu CLB')
    // Chỉ Thủ quỹ nhận lời nhắc ghi sổ; người duyệt và người đề xuất thì không.
    expect(await titlesOf('u-huy')).not.toContain('Khoản chi chờ ghi sổ: In tờ rơi giới thiệu CLB')
    expect(await titlesOf('u-anh')).not.toContain('Khoản chi chờ ghi sổ: In tờ rơi giới thiệu CLB')
  })

  it('does not let the proposer reject their own expense, nor the event lead approve (BR-ACL-05)', async () => {
    signInAs('u-anh')
    const own = await financeRepository.create('c-guitar', expense({ fundId: winter, category: 'VENUE' }))
    const selfReject = await fail(financeRepository.transition('c-guitar', own.id, { action: 'REJECT', reason: 'Tự hủy khoản này.', version: own.version }))
    expect(selfReject).toMatchObject({ status: 403, code: 'SELF_APPROVAL' })

    signInAs('u-bao')
    const seen = await financeRepository.transaction('c-guitar', own.id)
    expect(seen.allowedActions).toEqual([])
    const leadApprove = await fail(financeRepository.transition('c-guitar', own.id, { action: 'APPROVE', version: own.version }))
    expect(leadApprove).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    expect(db.transactions.find((transaction) => transaction.id === own.id)).toMatchObject({ status: 'PROPOSED', version: own.version })
  })

  it('rejects a reason longer than 500 characters', async () => {
    signInAs('u-anh')
    const standee = await financeRepository.transaction('c-guitar', 'tx-standee')
    const error = await fail(financeRepository.transition('c-guitar', standee.id, { action: 'REJECT', reason: 'x'.repeat(501), version: standee.version }))
    expect(error?.fieldErrors.map((fieldError) => fieldError.field)).toEqual(['reason'])
  })

  it('stops showing a finance notification once the reader can no longer see the transaction (BR-SEC-02)', async () => {
    signInAs('u-linh')
    await financeRepository.create('c-guitar', expense())
    signInAs('u-mai')
    const [notice] = (await notificationRepository.list({ category: 'FINANCE' })).content
    expect((await notificationRepository.get(notice?.id ?? '')).body).toContain('150.000 đ')
    const treasurer = db.positions.find((position) => position.userId === 'u-mai' && position.role === 'TREASURER')
    if (treasurer) treasurer.endOn = vnDate(-1)
    expect(await fail(notificationRepository.get(notice?.id ?? ''))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })

  it('needs a reason to reject and sends it to the proposer', async () => {
    signInAs('u-anh')
    const standee = await financeRepository.transaction('c-guitar', 'tx-standee')
    const empty = await fail(financeRepository.transition('c-guitar', standee.id, { action: 'REJECT', reason: 'Ko', version: standee.version }))
    expect(empty?.fieldErrors.map((fieldError) => fieldError.field)).toEqual(['reason'])
    const rejected = await financeRepository.transition('c-guitar', standee.id, { action: 'REJECT', reason: 'Dùng lại standee năm ngoái.', version: standee.version })
    expect(rejected).toMatchObject({ status: 'REJECTED', rejectionReason: 'Dùng lại standee năm ngoái.' })
    expect(await titlesOf('u-linh')).toContain('Khoản chi bị từ chối: In standee cho Đêm nhạc Mùa đông')
    expect(await latestBody('u-linh')).toBe('Lý do: Dùng lại standee năm ngoái.')
  })

  it('lets only the proposer withdraw, only while proposed', async () => {
    signInAs('u-anh')
    const standee = await financeRepository.transaction('c-guitar', 'tx-standee')
    expect((await fail(financeRepository.transition('c-guitar', standee.id, { action: 'WITHDRAW', version: standee.version })))?.status).toBe(403)
    expect(db.transactions.find((transaction) => transaction.id === standee.id)).toMatchObject({ status: 'PROPOSED', version: standee.version })
    signInAs('u-linh')
    const withdrawn = await financeRepository.transition('c-guitar', standee.id, { action: 'WITHDRAW', version: standee.version })
    expect(withdrawn).toMatchObject({ status: 'WITHDRAWN', allowedActions: [] })
    const again = await fail(financeRepository.transition('c-guitar', standee.id, { action: 'WITHDRAW', version: withdrawn.version }))
    expect(again).toMatchObject({ status: 422, code: 'INVALID_TRANSITION' })
  })

  it('refuses a stale version and a second approval (NFR-REL-01, NFR-REL-03)', async () => {
    signInAs('u-anh')
    const standee = await financeRepository.transaction('c-guitar', 'tx-standee')
    const first = await financeRepository.transition('c-guitar', standee.id, { action: 'APPROVE', version: standee.version })
    expect((await fail(financeRepository.transition('c-guitar', standee.id, { action: 'APPROVE', version: standee.version })))?.status).toBe(409)
    expect((await fail(financeRepository.transition('c-guitar', standee.id, { action: 'APPROVE', version: first.version })))?.status).toBe(422)
  })

  it('checks the voucher again at approval time', async () => {
    const standee = db.transactions.find((transaction) => transaction.id === 'tx-standee')
    if (!standee) throw new Error('Thiếu khoản chờ duyệt trong seed')
    // Dữ liệu cũ (trước khi có kiểm tra lúc đề xuất) có thể thiếu chứng từ; máy chủ vẫn chặn lúc duyệt.
    db.transactions.push({ ...structuredClone(standee), id: 'tx-no-voucher', attachmentIds: [] })
    signInAs('u-anh')
    const error = await fail(financeRepository.transition('c-guitar', 'tx-no-voucher', { action: 'APPROVE', version: 1 }))
    expect(error).toMatchObject({ status: 422, code: 'RECEIPT_REQUIRED' })
  })

  it('hides unposted expenses of others from department heads but shows their own', async () => {
    signInAs('u-long')
    const mine = await financeRepository.transactions('c-guitar', { fundId: guitar, type: ['EXPENSE'], mine: true })
    expect(mine.content.map((entry) => entry.id).sort()).toEqual(['tx-capo', 'tx-strings'])
    expect((await fail(financeRepository.transaction('c-guitar', 'tx-standee')))?.status).toBe(403)
  })
})

describe('posting an expense (FR-FIN-04, BR-FIN-08)', () => {
  it('lets only the treasurer post an approved expense, which then lowers the balance', async () => {
    signInAs('u-anh')
    const capo = await financeRepository.transaction('c-guitar', 'tx-capo')
    expect(capo.allowedActions).toEqual([])
    expect((await fail(financeRepository.transition('c-guitar', capo.id, { action: 'POST', version: capo.version })))?.status).toBe(403)
    expect(db.transactions.find((transaction) => transaction.id === capo.id)).toMatchObject({ status: 'APPROVED', version: capo.version, posterId: null })
    expect(fundBalance(guitar)).toBe(5_470_000)

    signInAs('u-mai')
    expect((await financeRepository.transaction('c-guitar', 'tx-capo')).allowedActions).toEqual(['POST'])
    const posted = await financeRepository.transition('c-guitar', capo.id, { action: 'POST', version: capo.version })
    expect(posted).toMatchObject({ status: 'POSTED', poster: { id: 'u-mai' }, occurredOn: vnDate(0) })
    expect(fundBalance(guitar)).toBe(5_290_000)
    expect(await titlesOf('u-long')).toContain('Khoản chi đã được ghi sổ: Mua capo và pick dự phòng')
  })

  it('refuses to post more than the fund holds and says how much is left', async () => {
    const acoustic = eventFundId('e-acoustic-sep')
    signInAs('u-anh')
    const big = await financeRepository.create('c-guitar', expense({ fundId: acoustic, amount: 300_000, category: 'VENUE', attachmentIds: [voucherFor('u-anh')] }))
    signInAs('u-huy')
    const approved = await financeRepository.transition('c-guitar', big.id, { action: 'APPROVE', version: big.version })
    signInAs('u-mai')
    const error = await fail(financeRepository.transition('c-guitar', big.id, { action: 'POST', version: approved.version }))
    expect(error).toMatchObject({ status: 422, code: 'INSUFFICIENT_FUNDS', detail: 'Quỹ chỉ còn 200.000 đ, không đủ ghi sổ khoản chi 300.000 đ.' })
    expect(fundBalance(acoustic)).toBe(200_000)
  })
})

describe('expense view models', () => {
  it('blocks a proposal above the threshold without a voucher before calling the server', async () => {
    signInAs('u-linh')
    const { wrapper } = await clubWrapper('c-guitar')
    const before = db.transactions.length
    const { result } = renderHook(() => useProposeExpenseViewModel({ id: guitar, receiptThreshold: 200_000 }, () => {}), { wrapper })
    act(() => {
      result.current.form.setValue('amount', '350.000')
      result.current.form.setValue('category', 'PRINTING')
      result.current.form.setValue('description', 'In standee mới')
    })
    await act(() => result.current.submit())
    expect(result.current.filesError).toBe('Khoản chi trên 200.000 đ phải có chứng từ.')
    expect(db.transactions).toHaveLength(before)
    // Hạ số tiền xuống dưới ngưỡng thì lỗi chứng từ mất ngay, không cần gửi lại.
    act(() => result.current.form.setValue('amount', '150.000'))
    expect(result.current.filesError).toBeNull()
  })

  it('shows the missing voucher together with other field errors on the first submit', async () => {
    signInAs('u-linh')
    const { wrapper } = await clubWrapper('c-guitar')
    const { result } = renderHook(() => useProposeExpenseViewModel({ id: guitar, receiptThreshold: 200_000 }, () => {}), { wrapper })
    act(() => result.current.form.setValue('amount', '350.000'))
    await act(() => result.current.submit())
    expect(result.current.form.getFieldState('category').error?.message).toBe('Chọn hạng mục chi.')
    expect(result.current.filesError).toBe('Khoản chi trên 200.000 đ phải có chứng từ.')
  })

  it('never shows a cached balance in the post dialog, only one fetched after it opens', async () => {
    signInAs('u-mai')
    const { wrapper, queryClient } = await clubWrapper('c-guitar')
    const stale = await financeRepository.fund('c-guitar', guitar)
    queryClient.setQueryData(financeQueryKeys.fund('c-guitar', guitar), { ...stale, balance: 999 })
    const capo = await financeRepository.transaction('c-guitar', 'tx-capo')
    const { result } = renderHook(() => useTransactionActionsViewModel('c-guitar', capo), { wrapper })
    act(() => result.current.request('POST'))
    expect(result.current.currentBalance).toBeNull()
    await waitFor(() => expect(result.current.currentBalance).toBe(5_470_000))
  })

  it('tells the treasurer when the current balance cannot be loaded before posting', async () => {
    server.use(http.get('*/api/v1/clubs/:clubId/funds/:fundId', () => HttpResponse.json({ detail: 'Máy chủ đang bận.' }, { status: 503, headers: { 'Content-Type': 'application/problem+json' } })))
    signInAs('u-mai')
    const { wrapper } = await clubWrapper('c-guitar')
    const capo = await financeRepository.transaction('c-guitar', 'tx-capo')
    const { result } = renderHook(() => useTransactionActionsViewModel('c-guitar', capo), { wrapper })
    act(() => result.current.request('POST'))
    await waitFor(() => expect(result.current.balanceError).toBe('Máy chủ đang bận.'))
    expect(result.current.currentBalance).toBeNull()
  })

  it('sends a proposal within the threshold and closes the form after the server saves it', async () => {
    signInAs('u-linh')
    const { wrapper } = await clubWrapper('c-guitar')
    const onDone = vi.fn()
    const { result } = renderHook(() => useProposeExpenseViewModel({ id: guitar, receiptThreshold: 200_000 }, onDone), { wrapper })
    act(() => {
      result.current.form.setValue('amount', '120.000')
      result.current.form.setValue('category', 'TRAVEL')
      result.current.form.setValue('description', 'Xe chở đàn đi diễn')
    })
    await act(() => result.current.submit())
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(db.transactions.at(-1)).toMatchObject({ amount: 120_000, status: 'PROPOSED', proposerId: 'u-linh' })
  })

  it('approves from the sheet and shows a reload banner when someone else acted first', async () => {
    signInAs('u-anh')
    const { wrapper } = await clubWrapper('c-guitar')
    const standee = await financeRepository.transaction('c-guitar', 'tx-standee')
    const { result, rerender } = renderHook(({ detail }) => useTransactionActionsViewModel('c-guitar', detail), { wrapper, initialProps: { detail: standee } })
    expect(result.current.actions).toEqual(['APPROVE', 'REJECT'])
    // Người khác vừa duyệt trước nên bản đang xem đã cũ.
    const stored = db.transactions.find((transaction) => transaction.id === 'tx-standee')
    if (stored) stored.version += 1
    act(() => result.current.request('APPROVE'))
    await waitFor(() => expect(result.current.conflict).toBe(true))

    const fresh = await financeRepository.transaction('c-guitar', 'tx-standee')
    rerender({ detail: fresh })
    act(() => result.current.request('APPROVE'))
    await waitFor(() => expect(db.transactions.find((transaction) => transaction.id === 'tx-standee')?.status).toBe('APPROVED'))
  })

  it('opens a dialog for reject, withdraw and post instead of sending right away', async () => {
    signInAs('u-mai')
    const { wrapper } = await clubWrapper('c-guitar')
    const capo = await financeRepository.transaction('c-guitar', 'tx-capo')
    const { result } = renderHook(() => useTransactionActionsViewModel('c-guitar', capo), { wrapper })
    act(() => result.current.request('POST'))
    expect(result.current.dialog).toBe('POST')
    await waitFor(() => expect(result.current.currentBalance).toBe(5_470_000))
    act(() => result.current.confirm())
    await waitFor(() => expect(db.transactions.find((transaction) => transaction.id === 'tx-capo')?.status).toBe('POSTED'))
    await waitFor(() => expect(result.current.dialog).toBeNull())
  })
})
