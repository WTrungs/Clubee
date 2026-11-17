import { describe, expect, it } from 'vitest'
import { changePasswordSchema, emailChangeSchema, profileSchema, toProfileValues, toUpdateProfileRequest } from './profileSchemas'

const today = '2026-11-05'
const messages = (result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[] }> } }) =>
  result.error?.issues.map((issue) => issue.path.join('.')) ?? []

describe('profile form (FR-ACC-05)', () => {
  it('accepts an empty phone and birth date', () => {
    expect(profileSchema(today).safeParse({ fullName: 'Lê Thu Hà', phone: '', birthDate: '' }).success).toBe(true)
  })

  it('accepts a 10-digit phone written with spaces or dots', () => {
    expect(profileSchema(today).safeParse({ fullName: 'Lê Thu Hà', phone: '0900 000 103', birthDate: '' }).success).toBe(true)
    expect(profileSchema(today).safeParse({ fullName: 'Lê Thu Hà', phone: '090.123.4567', birthDate: '' }).success).toBe(true)
  })

  it('rejects a wrong phone, a short name and a birth date that is not in the past', () => {
    const result = profileSchema(today).safeParse({ fullName: 'H', phone: '12345', birthDate: '05/11/2026' })
    expect(messages(result).sort()).toEqual(['birthDate', 'fullName', 'phone'])
    expect(messages(profileSchema(today).safeParse({ fullName: 'Lê Thu Hà', phone: '', birthDate: '31/02/2004' }))).toEqual(['birthDate'])
    expect(messages(profileSchema(today).safeParse({ fullName: 'Lê Thu Hà', phone: '', birthDate: '2004-02-01' }))).toEqual(['birthDate'])
  })

  it('maps the profile to form values and back', () => {
    const profile = { fullName: 'Lê Thu Hà', email: 'ha.le@demo.test', pendingEmail: null, phone: '0900 000 103', birthDate: '2004-03-09', avatarUrl: null, version: 2 }
    const values = toProfileValues(profile)
    expect(values).toEqual({ fullName: 'Lê Thu Hà', phone: '0900 000 103', birthDate: '09/03/2004' })
    expect(toUpdateProfileRequest(values, 2)).toEqual({ fullName: 'Lê Thu Hà', phone: '0900000103', birthDate: '2004-03-09', version: 2 })
    expect(toUpdateProfileRequest({ fullName: ' Hà ', phone: ' ', birthDate: '' }, 2)).toEqual({ fullName: 'Hà', phone: null, birthDate: null, version: 2 })
  })
})

describe('email and password forms (FR-ACC-04, 05)', () => {
  it('needs a valid new email and the current password', () => {
    expect(messages(emailChangeSchema.safeParse({ newEmail: 'không phải email', currentPassword: '' })).sort()).toEqual(['currentPassword', 'newEmail'])
  })

  it('needs a new password that differs from the current one and is typed twice', () => {
    expect(changePasswordSchema.safeParse({ currentPassword: 'matkhau-cu', newPassword: 'matkhau-moi', confirmPassword: 'matkhau-moi' }).success).toBe(true)
    expect(messages(changePasswordSchema.safeParse({ currentPassword: 'matkhau-cu', newPassword: 'matkhau-moi', confirmPassword: 'khac' }))).toEqual(['confirmPassword'])
    expect(messages(changePasswordSchema.safeParse({ currentPassword: 'matkhau-cu', newPassword: 'matkhau-cu', confirmPassword: 'matkhau-cu' }))).toEqual(['newPassword'])
    expect(messages(changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'ngan', confirmPassword: 'ngan' }))).toEqual(['newPassword'])
  })
})
