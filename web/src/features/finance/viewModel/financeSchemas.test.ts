import { describe, expect, it } from 'vitest'
import { adjustmentSchema, missingReceipt, proposeExpenseSchema, recordIncomeSchema } from './financeSchemas'

const schema = recordIncomeSchema('2026-11-05')
const valid = { amount: '1.500.000', occurredDate: '05/11/2026', category: 'SPONSORSHIP', description: 'Tài trợ của cửa hàng' }
const errorsOf = (values: Record<string, unknown>) => {
  const result = schema.safeParse(values)
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
}

describe('record income form (FR-FIN-01)', () => {
  it('accepts a positive whole amount in VND, a past or today date and an income category', () => {
    expect(errorsOf(valid)).toEqual([])
    expect(errorsOf({ ...valid, occurredDate: '01/10/2026' })).toEqual([])
  })

  it('rejects zero, empty and over-limit amounts (BR-FIN-04)', () => {
    expect(errorsOf({ ...valid, amount: '0' })).toEqual(['amount'])
    expect(errorsOf({ ...valid, amount: '' })).toEqual(['amount'])
    expect(errorsOf({ ...valid, amount: '1.000.000.001' })).toEqual(['amount'])
  })

  it('rejects a future or impossible date', () => {
    expect(errorsOf({ ...valid, occurredDate: '06/11/2026' })).toEqual(['occurredDate'])
    expect(errorsOf({ ...valid, occurredDate: '31/02/2026' })).toEqual(['occurredDate'])
    expect(errorsOf({ ...valid, occurredDate: '2026-11-05' })).toEqual(['occurredDate'])
  })

  it('only takes income categories and a 3–200 character description', () => {
    expect(errorsOf({ ...valid, category: 'VENUE' })).toEqual(['category'])
    expect(errorsOf({ ...valid, category: '' })).toEqual(['category'])
    expect(errorsOf({ ...valid, description: 'ab' })).toEqual(['description'])
    expect(errorsOf({ ...valid, description: 'x'.repeat(201) })).toEqual(['description'])
  })
})

describe('propose expense form (FR-FIN-02, BR-FIN-03)', () => {
  const expense = { amount: '350.000', category: 'PRINTING', description: 'In standee mới' }
  const expenseErrors = (values: Record<string, unknown>) => {
    const result = proposeExpenseSchema.safeParse(values)
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
  }

  it('takes expense categories only', () => {
    expect(expenseErrors(expense)).toEqual([])
    expect(expenseErrors({ ...expense, category: 'SPONSORSHIP' })).toEqual(['category'])
    expect(expenseErrors({ ...expense, amount: '0' })).toEqual(['amount'])
  })

  it('asks for a voucher only above the threshold and only when no file is attached', () => {
    expect(missingReceipt('200.001', 200_000, 0)).toBe(true)
    expect(missingReceipt('200.000', 200_000, 0)).toBe(false)
    expect(missingReceipt('900.000', 200_000, 1)).toBe(false)
    expect(missingReceipt('', 200_000, 0)).toBe(false)
  })
})

describe('adjustment form (FR-FIN-05)', () => {
  const values = { direction: 'OUT', amount: '50.000', reason: 'Ghi thiếu theo hóa đơn' }
  const adjustmentErrors = (input: Record<string, unknown>) => {
    const result = adjustmentSchema.safeParse(input)
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
  }

  it('needs a direction, a positive amount and a reason of 5 to 200 characters', () => {
    expect(adjustmentErrors(values)).toEqual([])
    expect(adjustmentErrors({ ...values, direction: undefined })).toEqual(['direction'])
    expect(adjustmentErrors({ ...values, amount: '0' })).toEqual(['amount'])
    expect(adjustmentErrors({ ...values, reason: 'Sai' })).toEqual(['reason'])
    expect(adjustmentErrors({ ...values, reason: 'x'.repeat(201) })).toEqual(['reason'])
  })
})
