import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { monthPeriods, semesterPeriods } from '@/api/mocks/mockFinanceReport'
import { vnDate } from '@/api/mocks/mockTime'
import { eventFundId, generalFundId } from '@/api/mocks/seed/financeSeed'
import { server } from '@/api/mocks/server'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { advanceRepository } from '../model/advanceRepository'
import { financeReportRepository } from '../model/financeReportRepository'
import type { FinanceReportQuery } from '../model/financeReportTypes'
import { financeRepository } from '../model/financeRepository'
import { FinanceReportPanel } from '../view/FinanceReportPanel'
import { netText, reportMonthLabel, reportShare } from './financeReportDisplay'
import { useFinanceReportViewModel } from './useFinanceReportViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const thisMonth = () => monthPeriods()[0]?.key ?? ''
const monthReport = (patch: Partial<FinanceReportQuery> = {}) => financeReportRepository.get('c-guitar', { period: 'MONTH', key: thisMonth(), ...patch })

/** Tổng thu, chi tính thẳng từ db cho tháng này, để đối chiếu với báo cáo. */
function expectedTotals(month: string) {
  const rows = db.transactions.filter((row) => row.clubId === 'c-guitar' && row.status === 'POSTED' && row.type !== 'TRANSFER' && row.occurredOn?.startsWith(month))
  const sum = (direction: 'IN' | 'OUT') => rows.filter((row) => row.direction === direction).reduce((total, row) => total + row.amount, 0)
  return { income: sum('IN'), expense: sum('OUT') }
}

async function clubWrapper(path = '/clubs/c-guitar/finance?view=report') {
  const club = await clubRepository.getClub('c-guitar')
  const { wrapper: Base } = createTestWrapper(path)
  return ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
    </Base>
  )
}

describe('who sees the finance report (FR-FIN-12, SRS 3.5)', () => {
  it('refuses ordinary members and shows the board', async () => {
    signInAs('u-ha')
    expect(await fail(monthReport())).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    expect(await fail(financeReportRepository.periods('c-guitar'))).toMatchObject({ status: 403 })
    expect((await clubRepository.getClub('c-guitar')).allowedActions).not.toContain('VIEW_FINANCE_REPORT')
    signInAs('u-anh')
    expect((await clubRepository.getClub('c-guitar')).allowedActions).toContain('VIEW_FINANCE_REPORT')
    expect((await monthReport()).label).toMatch(/^Tháng /)
  })
})

describe('report periods (FR-FIN-12)', () => {
  it('lists twelve months, the semesters from the club marks and every term', async () => {
    signInAs('u-anh')
    const periods = await financeReportRepository.periods('c-guitar')
    expect(periods.months).toHaveLength(12)
    expect(periods.months[0]).toMatchObject({ key: thisMonth(), from: `${thisMonth()}-01` })
    expect((periods.semesters[0]?.from ?? '') <= vnDate(0)).toBe(true)
    expect(periods.terms.map((term) => term.key)).toEqual(db.terms.filter((term) => term.clubId === 'c-guitar').toSorted((a, b) => b.startOn.localeCompare(a.startOn)).map((term) => term.id))
  })

  it('cuts semesters at the declared marks, across the new year, and follows a change of marks', () => {
    const marks = { semester1Start: '09-01', semester2Start: '02-01', summerStart: null, foundedOn: '2024-10-01' }
    const periods = semesterPeriods(marks, '2026-03-10')
    expect(periods.map((period) => [period.key, period.from, period.to])).toEqual([
      ['2025-S2', '2026-02-01', '2026-08-31'],
      ['2025-S1', '2025-09-01', '2026-01-31'],
      ['2024-S2', '2025-02-01', '2025-08-31'],
      ['2024-S1', '2024-09-01', '2025-01-31'],
    ])
    expect(periods[1]?.label).toBe('Học kỳ 1 2025–2026')
    const withSummer = semesterPeriods({ ...marks, semester2Start: '01-15', summerStart: '06-15' }, '2026-07-01')
    expect(withSummer.slice(0, 3).map((period) => [period.key, period.from, period.to])).toEqual([
      ['2025-SUMMER', '2026-06-15', '2026-08-31'],
      ['2025-S2', '2026-01-15', '2026-06-14'],
      ['2025-S1', '2025-09-01', '2026-01-14'],
    ])
  })
})

describe('report figures (FR-FIN-12, BR-FIN-02)', () => {
  it('adds up the posted transactions of the month by category, fund and month', async () => {
    signInAs('u-anh')
    const report = await monthReport()
    const expected = expectedTotals(thisMonth())
    expect(report).toMatchObject({ totalIncome: expected.income, totalExpense: expected.expense, net: expected.income - expected.expense })
    expect(report.byMonth).toEqual([{ month: thisMonth(), income: expected.income, expense: expected.expense }])
    expect(report.byCategory.reduce((sum, row) => sum + row.income, 0)).toBe(expected.income)
    expect(report.byFund.reduce((sum, row) => sum + row.expense, 0)).toBe(expected.expense)
  })

  it('leaves transfers out and puts an adjustment under the category of its original', async () => {
    signInAs('u-mai')
    const before = await monthReport()
    const fund = await financeRepository.fund('c-guitar', eventFundId('e-exchange'))
    await financeRepository.settle('c-guitar', fund.id, fund.version)
    const afterSettle = await monthReport()
    expect(afterSettle.totalIncome).toBe(before.totalIncome)
    expect(afterSettle.totalExpense).toBe(before.totalExpense)

    const original = db.transactions.find((row) => row.clubId === 'c-guitar' && row.status === 'POSTED' && row.type === 'EXPENSE' && row.fundId === generalFundId('c-guitar'))
    if (!original) throw new Error('Thiếu khoản chi seed')
    await financeRepository.create('c-guitar', { fundId: original.fundId, type: 'ADJUSTMENT', direction: 'IN', amount: 10_000, description: 'Hoàn tiền thừa từ nhà cung cấp', originalTransactionId: original.id, attachmentIds: [] })
    const afterAdjust = await monthReport({ category: original.category })
    expect(afterAdjust.byCategory.map((row) => row.category)).toEqual([original.category])
    expect(afterAdjust.totalIncome).toBe((before.byCategory.find((row) => row.category === original.category)?.income ?? 0) + 10_000)
  })

  it('flags an expense approved and posted by the same person, including one from an advance', async () => {
    db.permissionOverrides.push({ clubId: 'c-guitar', role: 'TREASURER', permission: 'APPROVE_EXPENSE', enabled: true, updatedBy: 'u-anh', updatedAt: new Date().toISOString() })
    signInAs('u-linh')
    const advance = await advanceRepository.propose('c-guitar', { fundId: generalFundId('c-guitar'), amount: 120_000, purpose: 'In standee cho buổi tuyển thành viên', category: 'PRINTING', settleBy: vnDate(10) })
    signInAs('u-mai')
    const approved = await advanceRepository.transition('c-guitar', advance.id, { action: 'APPROVE', version: advance.version })
    const disbursed = await advanceRepository.transition('c-guitar', advance.id, { action: 'DISBURSE', version: approved.version })
    signInAs('u-anh')
    const report = await monthReport()
    expect(report.flagged.map((row) => row.transactionId)).toContain(disbursed.disbursementTxId)
    expect(report.flagged.find((row) => row.transactionId === disbursed.disbursementTxId)).toMatchObject({ amount: 120_000, person: { id: 'u-mai' } })
    // Khoản thu do Thủ quỹ ghi thẳng không bị đánh dấu.
    expect(report.flagged.every((row) => db.transactions.find((candidate) => candidate.id === row.transactionId)?.type === 'EXPENSE')).toBe(true)
  })

  it('counts unpaid dues and overdue advances as they are now', async () => {
    const strings = db.advances.find((advance) => advance.id === 'adv-strings')
    if (strings) Object.assign(strings, { status: 'DISBURSED', settleBy: vnDate(-1) })
    signInAs('u-anh')
    const report = await monthReport()
    expect(report.unpaidDuesCount).toBe(16)
    expect(report.overdueAdvanceCount).toBe(1)
    const unpaid = await financeReportRepository.unpaidDues('c-guitar', { size: 50 })
    expect(unpaid.totalElements).toBe(16)
    expect(unpaid.content[0]).toMatchObject({ campaignName: 'Quỹ học kỳ 1', owed: 100_000, overdue: false })
    expect((await advanceRepository.list('c-guitar', { overdue: true })).content.map((advance) => advance.id)).toEqual(['adv-strings'])
    expect(await fail(financeReportRepository.unpaidDues('c-guitar', { campaignId: 'dues-khac' }))).toMatchObject({ status: 400 })
  })
})

describe('report filters and periods given by the caller (FR-FIN-12)', () => {
  it('filters by category and by event fund, together with the period', async () => {
    signInAs('u-anh')
    const all = await monthReport()
    const category = all.byCategory[0]?.category
    if (!category) throw new Error('Tháng này chưa có giao dịch')
    const byCategory = await monthReport({ category })
    expect(byCategory.category).toBe(category)
    expect(byCategory.byCategory.map((row) => row.category)).toEqual([category])

    const byEvent = await financeReportRepository.get('c-guitar', { period: 'CUSTOM', from: vnDate(-365 * 3), to: vnDate(0), eventId: 'e-exchange' })
    expect(byEvent.event).toMatchObject({ id: 'e-exchange' })
    expect(byEvent.byFund.map((row) => row.eventId)).toEqual(['e-exchange'])
  })

  it('refuses a wrong period, key, range, category or event', async () => {
    signInAs('u-anh')
    const fields = async (query: FinanceReportQuery) => (await fail(financeReportRepository.get('c-guitar', query)))?.fieldErrors.map((fieldError) => fieldError.field)
    expect(await fields({ period: 'MONTH', key: '1999-01' })).toEqual(['key'])
    expect(await fields({ period: 'CUSTOM', from: '2026-11-10', to: '2026-11-01' })).toEqual(['to'])
    expect(await fields({ period: 'CUSTOM', from: '2020-01-01', to: '2026-01-02' })).toEqual(['to'])
    expect(await fields({ period: 'MONTH', key: thisMonth(), category: 'FUND_TRANSFER' })).toEqual(['category'])
    expect(await fields({ period: 'MONTH', key: thisMonth(), eventId: 'e-khong-co' })).toEqual(['eventId'])
    expect(await fields({ period: 'YEAR' as FinanceReportQuery['period'] })).toEqual(['period'])
    expect(await fields({ period: 'CUSTOM', from: '2026-02-30', to: '2026-03-01' })).toEqual(['from'])
  })

  it('reports an earlier term', async () => {
    signInAs('u-anh')
    const terms = (await financeReportRepository.periods('c-guitar')).terms
    const older = terms.at(-1)
    if (!older) throw new Error('Thiếu nhiệm kỳ')
    const report = await financeReportRepository.get('c-guitar', { period: 'TERM', key: older.key })
    expect(report).toMatchObject({ from: older.from, to: older.to, label: older.label })
  })
})

describe('finance report display (FR-FIN-12)', () => {
  it('labels months, shares and the net amount', () => {
    expect(reportMonthLabel('2026-11')).toBe('11/2026')
    expect(reportShare(25, 200)).toBe(13)
    expect(reportShare(5, 0)).toBe(0)
    const money = (amount: number) => `${amount} đ`
    expect(netText(500, money)).toBe('+500 đ')
    expect(netText(-500, money)).toBe('−500 đ')
    expect(netText(0, money)).toBe('0 đ')
  })
})

describe('useFinanceReportViewModel (FR-FIN-12)', () => {
  it('writes the period and filters to the URL', async () => {
    signInAs('u-anh')
    const wrapper = await clubWrapper()
    const { result } = renderHook(() => ({ vm: useFinanceReportViewModel(true), location: useLocation() }), { wrapper })
    await waitFor(() => expect(result.current.vm.report).not.toBeNull())
    act(() => result.current.vm.setPeriod('SEMESTER'))
    await waitFor(() => expect(result.current.location.search).toContain('period=SEMESTER'))
    await waitFor(() => expect(result.current.vm.report?.label).toMatch(/^Học kỳ/))
    act(() => result.current.vm.filterByCategory('VENUE'))
    await waitFor(() => expect(result.current.location.search).toContain('category=VENUE'))
    act(() => result.current.vm.clearFilters())
    await waitFor(() => expect(result.current.location.search).not.toContain('category'))
    expect(result.current.location.search).toContain('view=report')
  })

  it('drops the previous report when switching to a date range not chosen yet', async () => {
    signInAs('u-anh')
    const { result } = renderHook(() => useFinanceReportViewModel(true), { wrapper: await clubWrapper() })
    await waitFor(() => expect(result.current.report).not.toBeNull())
    act(() => result.current.setPeriod('CUSTOM'))
    await waitFor(() => expect(result.current.period).toBe('CUSTOM'))
    expect(result.current.report).toBeNull()
  })

  it('says why the server refused the conditions instead of offering a retry', async () => {
    signInAs('u-anh')
    const { result } = renderHook(() => useFinanceReportViewModel(true), { wrapper: await clubWrapper('/clubs/c-guitar/finance?view=report&key=1999-01') })
    await waitFor(() => expect(result.current.invalidReasons).toEqual(['Kỳ không có trong danh sách chọn được.']))
    expect(result.current.error).toBeNull()
  })

  it('keeps a bad custom range out of the URL', async () => {
    signInAs('u-anh')
    const { result } = renderHook(() => ({ vm: useFinanceReportViewModel(true), location: useLocation() }), { wrapper: await clubWrapper('/clubs/c-guitar/finance?view=report&period=CUSTOM') })
    act(() => {
      result.current.vm.setCustomFrom('10/11/2026')
      result.current.vm.setCustomTo('01/11/2026')
    })
    act(() => result.current.vm.applyCustom())
    expect(result.current.vm.customError).toEqual({ field: 'to', message: 'Ngày kết thúc không trước ngày bắt đầu.' })
    act(() => {
      result.current.vm.setCustomFrom('01/01/2020')
      result.current.vm.setCustomTo('02/01/2025')
    })
    act(() => result.current.vm.applyCustom())
    expect(result.current.vm.customError).toEqual({ field: 'to', message: 'Khoảng ngày tối đa 5 năm.' })
    expect(result.current.location.search).not.toContain('from=')
  })
})

describe('FinanceReportPanel (FR-FIN-12)', () => {
  it('shows the figures and filters by a category row', async () => {
    signInAs('u-anh')
    render(<FinanceReportPanel active />, { wrapper: await clubWrapper() })
    expect(await screen.findByText('Tổng thu')).toBeInTheDocument()
    const categories = screen.getByRole('region', { name: 'Theo hạng mục' })
    const first = within(categories).getAllByRole('button')[0]
    if (!first) throw new Error('Không có hạng mục')
    await userEvent.setup().click(first)
    expect(await screen.findByRole('button', { name: 'Bỏ lọc' })).toBeInTheDocument()
  })

  it('shows empty tables for a period without transactions', async () => {
    signInAs('u-anh')
    render(<FinanceReportPanel active />, { wrapper: await clubWrapper('/clubs/c-guitar/finance?view=report&period=CUSTOM&from=2016-01-01&to=2016-01-31') })
    // Theo hạng mục, theo quỹ và khoản cùng người duyệt, ghi sổ đều rỗng.
    expect(await screen.findAllByText('Không có khoản nào trong kỳ.')).toHaveLength(3)
  })

  it('shows a loading error in each side list instead of an empty one', async () => {
    server.use(
      http.get('*/api/v1/clubs/:clubId/finance-report/unpaid-dues', () => HttpResponse.json({ detail: 'Không tải được danh sách chưa nộp.' }, { status: 503, headers: { 'Content-Type': 'application/problem+json' } })),
      http.get('*/api/v1/clubs/:clubId/advances', () => HttpResponse.json({ detail: 'Không tải được tạm ứng.' }, { status: 503, headers: { 'Content-Type': 'application/problem+json' } })),
    )
    signInAs('u-anh')
    render(<FinanceReportPanel active />, { wrapper: await clubWrapper() })
    const unpaid = await screen.findByRole('region', { name: /Chưa nộp quỹ/ })
    expect(await within(unpaid).findByText(/Không tải được danh sách chưa nộp/)).toBeInTheDocument()
    expect(within(unpaid).queryByText('Không ai còn thiếu.')).toBeNull()
    const overdue = screen.getByRole('region', { name: /Tạm ứng quá hạn/ })
    expect(await within(overdue).findByText(/Không tải được tạm ứng/)).toBeInTheDocument()
  })

  it('pages through the unpaid list', async () => {
    signInAs('u-anh')
    render(<FinanceReportPanel active />, { wrapper: await clubWrapper() })
    const unpaid = await screen.findByRole('region', { name: /Chưa nộp quỹ/ })
    await waitFor(() => expect(within(unpaid).getAllByRole('link')).toHaveLength(5))
    await userEvent.setup().click(within(unpaid).getByRole('button', { name: 'Trang sau' }))
    await waitFor(() => expect(within(unpaid).getByText(/6–10/)).toBeInTheDocument())
  })

  it('shows the error with a retry', async () => {
    server.use(http.get('*/api/v1/clubs/:clubId/finance-report', () => HttpResponse.json({ detail: 'Máy chủ đang bận.' }, { status: 503, headers: { 'Content-Type': 'application/problem+json' } })))
    signInAs('u-anh')
    render(<FinanceReportPanel active />, { wrapper: await clubWrapper() })
    expect(await screen.findByText(/Máy chủ đang bận/)).toBeInTheDocument()
  })
})
