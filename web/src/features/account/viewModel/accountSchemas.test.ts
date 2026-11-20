import { describe, expect, it } from 'vitest'
import { loginSchema, passwordStrength, registerSchema } from './accountSchemas'

describe('passwordStrength', () => {
  it('scores from 0 (empty) to 4 (long, mixed case, digits and symbols)', () => {
    expect(passwordStrength('')).toBe(0)
    expect(passwordStrength('abc')).toBe(1)
    expect(passwordStrength('abcdefgh')).toBe(1)
    expect(passwordStrength('abcdefghijkl')).toBe(2)
    expect(passwordStrength('Abcdefghijkl')).toBe(3)
    expect(passwordStrength('Abcdefghijk1!')).toBe(4)
  })
})

describe('account schemas', () => {
  it('trims and validates the email', () => {
    expect(loginSchema.safeParse({ email: '  a@b.vn ', password: 'x' }).success).toBe(true)
    const invalid = loginSchema.safeParse({ email: 'not-an-email', password: 'x' })
    expect(invalid.success).toBe(false)
  })

  it('requires the confirmation to match the password', () => {
    const result = registerSchema.safeParse({ fullName: 'Nguyễn Văn A', email: 'a@b.vn', password: '12345678', confirmPassword: '87654321' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['confirmPassword'])
  })
})
