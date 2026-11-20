import { describe, expect, it } from 'vitest'
import { periodRange, signedAmount, transactionActionSuccess } from './financeDisplay'

describe('ledger period (FR-FIN-06)', () => {
  const term = { startOn: '2026-06-01', endOn: '2027-05-31' }

  it('turns this month and last month into whole-month ranges', () => {
    expect(periodRange('THIS_MONTH', '2026-11-05', term)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(periodRange('LAST_MONTH', '2026-11-05', term)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })

  it('rolls January back to December of the previous year and knows leap years', () => {
    expect(periodRange('LAST_MONTH', '2027-01-10', term)).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(periodRange('THIS_MONTH', '2028-02-03', term)).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })

  it('uses the running term, and no limit for all time or when there is no term', () => {
    expect(periodRange('TERM', '2026-11-05', term)).toEqual({ from: '2026-06-01', to: '2027-05-31' })
    expect(periodRange('TERM', '2026-11-05', null)).toEqual({})
    expect(periodRange('ALL', '2026-11-05', term)).toEqual({})
  })

  it('keeps counting up to today when the term is past its end but not handed over yet (BR-TERM-02)', () => {
    expect(periodRange('TERM', '2027-06-10', term)).toEqual({ from: '2026-06-01', to: '2027-06-10' })
  })
})

describe('signed amount', () => {
  it('puts a plus on money in and a minus sign on money out', () => {
    expect(signedAmount(1_500_000, 'IN')).toBe('+1.500.000 đ')
    expect(signedAmount(450_000, 'OUT')).toBe('−450.000 đ')
  })
})

describe('transition success message', () => {
  it('says an approved decrease adjustment is already posted', () => {
    expect(transactionActionSuccess('APPROVE', 'EXPENSE')).toBe('Đã duyệt khoản chi.')
    expect(transactionActionSuccess('APPROVE', 'ADJUSTMENT')).toBe('Đã duyệt điều chỉnh, giao dịch đã được ghi sổ.')
    expect(transactionActionSuccess('REJECT', 'ADJUSTMENT')).toBe('Đã từ chối điều chỉnh.')
    expect(transactionActionSuccess('POST', 'EXPENSE')).toBe('Đã ghi sổ khoản chi.')
  })
})
