import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { httpClient } from '@/api/httpClient'
import { db } from '@/api/mocks/db'
import { fundBalance } from '@/api/mocks/mockFinance'
import { vnDate } from '@/api/mocks/mockTime'
import { eventFundId, generalFundId } from '@/api/mocks/seed/financeSeed'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { eventRepository } from '@/features/event/model/eventRepository'
import { formatDate } from '@/shared/format/formatDate'
import { createTestWrapper, signInAs } from '@/testUtils'
import { financeRepository } from '../model/financeRepository'
import type { CreateTransactionRequest } from '../model/financeTypes'
import { useFundPanelViewModel } from './useFundPanelViewModel'
import { uploadVouchers } from './uploadVouchers'
import { useRecordIncomeViewModel } from './useRecordIncomeViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const guitar = generalFundId('c-guitar')
const income = (fields: Partial<CreateTransactionRequest> = {}): CreateTransactionRequest => ({
  fundId: guitar,
  type: 'INCOME',
  amount: 500_000,
  category: 'MEMBER_DUES',
  description: 'Thu quỹ bổ sung',
  occurredOn: vnDate(0),
  attachmentIds: [],
  ...fields,
})

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

describe('ledger and fund visibility (FR-FIN-06, SRS 3.5)', () => {
  it('shows every member the posted entries of the general fund, newest first, but no pending expenses', async () => {
    signInAs('u-hieu')
    const fund = await financeRepository.fund('c-guitar', guitar)
    // Thành viên thường không được biết có bao nhiêu khoản đang chờ duyệt.
    expect(fund).toMatchObject({ name: 'Quỹ chung', balance: 5_470_000, allowedActions: [], pendingCount: null })
    const all = await financeRepository.transactions('c-guitar', { fundId: guitar })
    expect(all.content.every((entry) => entry.status === 'POSTED')).toBe(true)
    expect(all.content[0]?.id).toBe('tx-poster-recruit')
    const pending = await financeRepository.transactions('c-guitar', { fundId: guitar, status: ['PROPOSED', 'APPROVED'] })
    expect(pending.totalElements).toBe(0)
    expect((await fail(financeRepository.transaction('c-guitar', 'tx-standee')))?.status).toBe(403)
  })

  it('lets the board see pending expenses and the treasurer record income', async () => {
    signInAs('u-mai')
    const fund = await financeRepository.fund('c-guitar', guitar)
    expect(fund.allowedActions).toContain('RECORD_INCOME')
    expect(fund.pendingCount).toBe(2)
    const pending = await financeRepository.transactions('c-guitar', { fundId: guitar, status: ['PROPOSED', 'APPROVED'] })
    expect(pending.content.map((entry) => entry.id).sort()).toEqual(['tx-capo', 'tx-standee'])
  })

  it('filters by period, category and keyword', async () => {
    signInAs('u-hieu')
    const recent = await financeRepository.transactions('c-guitar', { fundId: guitar, from: vnDate(-25), to: vnDate(0) })
    expect(recent.content.map((entry) => entry.id)).toEqual(['tx-poster-recruit', 'tx-shirts'])
    const venue = await financeRepository.transactions('c-guitar', { fundId: guitar, category: 'VENUE' })
    expect(venue.content.map((entry) => entry.id)).toEqual(['tx-room-oct'])
    const keyword = await financeRepository.transactions('c-guitar', { fundId: guitar, q: 'thay day' })
    expect(keyword.content.map((entry) => entry.id)).toEqual(['tx-strings'])
  })

  it('keeps event funds to the board and the organising committee', async () => {
    signInAs('u-hieu')
    const funds = await financeRepository.funds('c-guitar', {})
    expect(funds.content.map((fund) => fund.id)).toEqual([guitar])
    expect(await fail(financeRepository.fund('c-guitar', eventFundId('e-winter')))).toMatchObject({
      status: 403,
      detail: 'Chỉ ban chủ nhiệm và ban tổ chức sự kiện xem được quỹ sự kiện.',
    })
    expect((await eventRepository.get('c-guitar', 'e-winter')).allowedActions).not.toContain('VIEW_FUND')

    signInAs('u-kiet')
    expect((await financeRepository.fund('c-guitar', eventFundId('e-winter'))).balance).toBe(1_500_000)
    expect((await eventRepository.get('c-guitar', 'e-winter')).allowedActions).toContain('VIEW_FUND')

    signInAs('u-anh')
    const boardFunds = await financeRepository.funds('c-guitar', {})
    expect(boardFunds.content[0]?.kind).toBe('GENERAL')
    expect(boardFunds.content.map((fund) => fund.id)).toContain(eventFundId('e-acoustic-sep'))
  })

  it('refuses members of another club (NFR-SEC-02)', async () => {
    signInAs('u-tu')
    expect((await fail(financeRepository.funds('c-guitar', {})))?.status).toBe(403)
    expect((await fail(financeRepository.fund('c-guitar', guitar)))?.status).toBe(403)
    expect((await fail(financeRepository.transactions('c-guitar', {})))?.status).toBe(403)
    expect((await fail(financeRepository.transaction('c-guitar', 'tx-strings')))?.status).toBe(403)
    expect((await fail(financeRepository.create('c-guitar', income())))?.status).toBe(403)
    expect((await fail(httpClient.post('/clubs/c-guitar/transaction-attachments')))?.status).toBe(403)
    // Mã quỹ của CLB khác không dùng được qua đường dẫn của CLB mình.
    expect((await fail(financeRepository.fund('c-english', guitar)))?.status).toBe(404)
  })
})

describe('recording income (FR-FIN-01)', () => {
  it('only lets the treasurer record income and leaves data unchanged otherwise (NFR-SEC-03)', async () => {
    const before = db.transactions.length
    signInAs('u-anh')
    const denied = await fail(financeRepository.create('c-guitar', income()))
    expect(denied).toMatchObject({ status: 403, detail: 'Chỉ Thủ quỹ được ghi khoản thu.' })
    expect(db.transactions).toHaveLength(before)

    signInAs('u-mai')
    const created = await financeRepository.create('c-guitar', income())
    expect(created).toMatchObject({ status: 'POSTED', flow: 'IN', amount: 500_000, poster: { id: 'u-mai' }, occurredOn: vnDate(0) })
    expect(fundBalance(guitar)).toBe(5_970_000)
  })

  it('rejects amounts that are not positive whole numbers, future dates and expense categories', async () => {
    signInAs('u-mai')
    for (const amount of [0, -5, 1.5, 1_000_000_001]) {
      const error = await fail(financeRepository.create('c-guitar', income({ amount })))
      expect(error?.fieldErrors.map((fieldError) => fieldError.field)).toEqual(['amount'])
    }
    const future = await fail(financeRepository.create('c-guitar', income({ occurredOn: vnDate(1) })))
    expect(future?.fieldErrors.map((fieldError) => fieldError.field)).toEqual(['occurredOn'])
    const expenseCategory = await fail(financeRepository.create('c-guitar', income({ category: 'VENUE' })))
    expect(expenseCategory?.fieldErrors.map((fieldError) => fieldError.field)).toEqual(['category'])
  })

  it('only accepts vouchers the caller uploaded for this club and that no other transaction uses', async () => {
    const voucher = (id: string, voucherClubId?: string) => ({ id, name: `${id}.pdf`, size: 1000, contentType: 'application/pdf', uploadedBy: 'u-mai', uploadedAt: vnDate(0), voucherClubId })
    db.attachments.push(voucher('f-own', 'c-guitar'), voucher('f-other-club', 'c-english'), voucher('f-task'))
    signInAs('u-mai')
    for (const id of ['f-fin-sponsor', 'f-cover-a', 'f-other-club', 'f-task']) {
      const error = await fail(financeRepository.create('c-guitar', income({ attachmentIds: [id] })))
      expect(error?.fieldErrors.map((fieldError) => fieldError.field), id).toEqual(['attachmentIds'])
    }
    const created = await financeRepository.create('c-guitar', income({ attachmentIds: ['f-own'] }))
    expect(created.attachments).toEqual([{ id: 'f-own', name: 'f-own.pdf', size: 1000, contentType: 'application/pdf' }])
  })

  it('reuses vouchers already uploaded when the form is sent again after an error', async () => {
    const upload = vi
      .spyOn(financeRepository, 'uploadAttachment')
      .mockImplementation((_clubId, file) => Promise.resolve({ id: `f-${file.name}`, name: file.name, size: file.size, contentType: file.type }))
    const uploaded = new Map<File, string>()
    const first = new File(['a'], 'a.pdf', { type: 'application/pdf' })
    const second = new File(['b'], 'b.pdf', { type: 'application/pdf' })
    expect(await uploadVouchers('c-guitar', [first, second], uploaded)).toEqual(['f-a.pdf', 'f-b.pdf'])
    expect(await uploadVouchers('c-guitar', [first, second], uploaded)).toEqual(['f-a.pdf', 'f-b.pdf'])
    expect(upload).toHaveBeenCalledTimes(2)
    upload.mockRestore()
  })

  it('refuses voucher uploads from people who cannot record or propose anything, before reading the file', async () => {
    signInAs('u-hieu')
    const error = await fail(httpClient.post('/clubs/c-guitar/transaction-attachments'))
    expect(error?.status).toBe(403)
  })

  it('refuses income on a settled fund', async () => {
    const fund = db.funds.find((candidate) => candidate.id === eventFundId('e-exchange'))
    if (fund) fund.status = 'SETTLED'
    signInAs('u-mai')
    const error = await fail(financeRepository.create('c-guitar', income({ fundId: eventFundId('e-exchange'), category: 'EVENT_REVENUE' })))
    expect(error).toMatchObject({ status: 422, code: 'FUND_SETTLED' })
  })
})

describe('funds are created with clubs and approved events', () => {
  it('gives a new club its general fund', async () => {
    signInAs('u-hieu')
    const club = await clubRepository.create({ name: 'CLB Nhiếp ảnh', shortName: 'NA', field: 'Nghệ thuật', description: 'Chụp ảnh và triển lãm cho sinh viên.' })
    const fund = await financeRepository.fund(club.id, club.generalFundId)
    expect(fund).toMatchObject({ kind: 'GENERAL', balance: 0, status: 'OPEN' })
  })

  it('opens an event fund when the board creates an event or approves a proposal', async () => {
    signInAs('u-anh')
    const pending = await eventRepository.get('c-guitar', 'e-busking')
    expect(pending.fundId).toBeNull()
    const approved = await eventRepository.transition('c-guitar', 'e-busking', { action: 'APPROVE', version: pending.version })
    expect(approved.fundId).not.toBeNull()
    expect(approved.allowedActions).toContain('VIEW_FUND')
  })
})

describe('finance view models', () => {
  it('loads the balance and the posted ledger, and narrows it by category', async () => {
    signInAs('u-hieu')
    const { wrapper } = await clubWrapper('c-guitar')
    const { result } = renderHook(() => useFundPanelViewModel(guitar), { wrapper })
    await waitFor(() => expect(result.current.fund?.balance).toBe(5_470_000))
    await waitFor(() => expect(result.current.totalElements).toBe(6))
    expect(result.current.canRecordIncome).toBe(false)
    act(() => result.current.setCategory('SPONSORSHIP'))
    await waitFor(() => expect(result.current.entries.map((entry) => entry.id)).toEqual(['tx-sponsor-shop']))
    expect(result.current.filtered).toBe(true)
  })

  it('records income from the form and reports success only after the server saves it', async () => {
    signInAs('u-mai')
    const { wrapper } = await clubWrapper('c-guitar')
    const onDone = vi.fn()
    const { result } = renderHook(() => useRecordIncomeViewModel(guitar, onDone), { wrapper })
    act(() => {
      result.current.form.setValue('amount', '1.250.000')
      result.current.form.setValue('category', 'SPONSORSHIP')
      result.current.form.setValue('description', 'Tài trợ của quán Gác Nhỏ')
    })
    expect(result.current.form.getValues('occurredDate')).toBe(formatDate(new Date()))
    await act(() => result.current.submit())
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(db.transactions.at(-1)).toMatchObject({ amount: 1_250_000, category: 'SPONSORSHIP', status: 'POSTED', posterId: 'u-mai' })
  })

  it('shows the server reason when the fund was settled meanwhile', async () => {
    signInAs('u-mai')
    const { wrapper } = await clubWrapper('c-guitar')
    const { result } = renderHook(() => useRecordIncomeViewModel(eventFundId('e-exchange'), () => {}), { wrapper })
    const fund = db.funds.find((candidate) => candidate.id === eventFundId('e-exchange'))
    if (fund) fund.status = 'SETTLED'
    act(() => {
      result.current.form.setValue('amount', '100.000')
      result.current.form.setValue('category', 'EVENT_REVENUE')
      result.current.form.setValue('description', 'Bán thêm vé')
    })
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.errorMessage).toBe('Quỹ đã quyết toán, không ghi thêm giao dịch.'))
  })

  it('reloads the fund permissions when the server says the caller may no longer record income', async () => {
    signInAs('u-anh')
    const { wrapper, queryClient } = await clubWrapper('c-guitar')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useRecordIncomeViewModel(guitar, () => {}), { wrapper })
    act(() => {
      result.current.form.setValue('amount', '100.000')
      result.current.form.setValue('category', 'MEMBER_DUES')
      result.current.form.setValue('description', 'Thu quỹ bổ sung')
    })
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.errorMessage).toBe('Chỉ Thủ quỹ được ghi khoản thu.'))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['finance', 'fund', 'c-guitar', guitar] })
    expect(result.current.pending).toBe(false)
  })
})
