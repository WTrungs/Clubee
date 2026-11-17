import { describe, expect, it } from 'vitest'
import { formatMoney, formatMoneyInput, formatNumber, parseMoney } from './formatMoney'

describe('formatMoney', () => {
  it('uses dots as thousand separators and the đ suffix', () => {
    expect(formatMoney(1500000)).toBe('1.500.000 đ')
    expect(formatMoney(200000)).toBe('200.000 đ')
    expect(formatMoney(0)).toBe('0 đ')
  })

  it('formats plain numbers', () => {
    expect(formatNumber(12345)).toBe('12.345')
  })
})

describe('money input', () => {
  it('keeps digits only and groups thousands while typing', () => {
    expect(formatMoneyInput('1500000')).toBe('1.500.000')
    expect(formatMoneyInput('1.500.0001')).toBe('15.000.001')
    expect(formatMoneyInput('abc 25k')).toBe('25')
    expect(formatMoneyInput('0007')).toBe('7')
    expect(formatMoneyInput('')).toBe('')
  })

  it('drops the fraction of pasted decimals instead of multiplying the amount', () => {
    expect(formatMoneyInput('1.500.000,00')).toBe('1.500.000')
    expect(formatMoneyInput('1500000.00')).toBe('1.500.000')
    expect(formatMoneyInput('250000,5')).toBe('250.000')
  })

  it('keeps regrouping while typing or deleting digits', () => {
    expect(formatMoneyInput('1.5000')).toBe('15.000')
    expect(formatMoneyInput('1.50')).toBe('150')
    expect(formatMoneyInput('1.500.00')).toBe('150.000')
  })

  it('parses grouped or plain amounts and rejects anything else', () => {
    expect(parseMoney('1.500.000')).toBe(1500000)
    expect(parseMoney(' 200000 ')).toBe(200000)
    expect(parseMoney('0')).toBe(0)
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('12,5')).toBeNull()
    expect(parseMoney('1.5')).toBeNull()
    expect(parseMoney('1.50.000')).toBeNull()
    expect(parseMoney('-300')).toBeNull()
    expect(parseMoney('99999999999999999999')).toBeNull()
  })
})
