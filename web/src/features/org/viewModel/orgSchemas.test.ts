import { describe, expect, it } from 'vitest'
import { assignPositionSchema, revokePositionSchema } from './assignPositionSchema'
import { departmentSchema } from './departmentSchema'
import { assignableRoles, departmentHealth, needsDepartment, positionTitle } from './orgDisplay'

const term = { startOn: '2026-09-01', endOn: '2027-08-31' }
const base = { role: 'DEPARTMENT_HEAD', departmentId: 'd-design', userId: 'u-hieu', startDate: '04/11/2026', endDate: '31/08/2027' }
const messages = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }) => result.error?.issues.map((issue) => issue.message) ?? []

describe('assign position form (FR-ORG-02, BR-ORG-03)', () => {
  it('accepts a department role inside the running term', () => {
    expect(assignPositionSchema(term).safeParse(base).success).toBe(true)
  })

  it('needs a department only for department roles', () => {
    expect(messages(assignPositionSchema(term).safeParse({ ...base, departmentId: '' }))).toContain('Chọn ban.')
    expect(assignPositionSchema(term).safeParse({ ...base, role: 'TREASURER', departmentId: '' }).success).toBe(true)
  })

  it('keeps both dates inside the term and the end after the start', () => {
    expect(messages(assignPositionSchema(term).safeParse({ ...base, startDate: '31/08/2026' }))).toContain('Ngày bắt đầu phải nằm trong nhiệm kỳ hiện tại.')
    expect(messages(assignPositionSchema(term).safeParse({ ...base, endDate: '01/09/2027' }))).toContain(
      'Ngày kết thúc phải sau ngày bắt đầu và không quá ngày cuối nhiệm kỳ.',
    )
    expect(messages(assignPositionSchema(term).safeParse({ ...base, endDate: '03/11/2026' }))).toContain(
      'Ngày kết thúc phải sau ngày bắt đầu và không quá ngày cuối nhiệm kỳ.',
    )
  })
})

describe('revoke position form (FR-ORG-03)', () => {
  it('requires a reason and a handover date from today to the last day', () => {
    const schema = revokePositionSchema('2026-11-04', '2027-08-31')
    expect(schema.safeParse({ reason: 'Bàn giao cho người mới.', handoverDate: '04/11/2026' }).success).toBe(true)
    expect(messages(schema.safeParse({ reason: 'Ngắn', handoverDate: '04/11/2026' }))).toContain('Nhập ít nhất 5 ký tự.')
    expect(schema.safeParse({ reason: 'Bàn giao cho người mới.', handoverDate: '03/11/2026' }).success).toBe(false)
    expect(schema.safeParse({ reason: 'Bàn giao cho người mới.', handoverDate: '01/09/2027' }).success).toBe(false)
  })
})

describe('department form and labels (FR-ORG-01)', () => {
  it('validates the department name', () => {
    expect(departmentSchema.safeParse({ name: ' A ', description: '' }).success).toBe(false)
    expect(departmentSchema.safeParse({ name: 'Hậu kỳ', description: '' }).success).toBe(true)
  })

  it('names positions with their scope', () => {
    expect(positionTitle({ role: 'PRESIDENT', scope: { type: 'CLUB', id: 'c', name: 'CLB Guitar' } })).toBe('Chủ nhiệm')
    expect(positionTitle({ role: 'DEPARTMENT_HEAD', scope: { type: 'DEPARTMENT', id: 'd', name: 'Thiết kế' } })).toBe('Trưởng ban Thiết kế')
    expect(positionTitle({ role: 'EVENT_LEAD', scope: { type: 'EVENT', id: 'e', name: 'Đêm nhạc' } })).toBe('Trưởng BTC · Đêm nhạc')
    expect(needsDepartment('DEPARTMENT_VICE_HEAD')).toBe(true)
    expect(needsDepartment('TREASURER')).toBe(false)
  })

  it('offers president and vice president only to those who may assign them', () => {
    expect(assignableRoles(true)).toEqual(['PRESIDENT', 'VICE_PRESIDENT', 'TREASURER', 'DEPARTMENT_HEAD', 'DEPARTMENT_VICE_HEAD'])
    expect(assignableRoles(false)).toEqual(['TREASURER', 'DEPARTMENT_HEAD', 'DEPARTMENT_VICE_HEAD'])
  })
})

describe('department badge (FR-ORG-07)', () => {
  const head = { role: 'DEPARTMENT_HEAD' as const, status: 'ACTIVE' as const }
  const department = (overrides: Partial<Parameters<typeof departmentHealth>[0]>) =>
    departmentHealth({ status: 'ACTIVE', leads: [head], overdueTaskCount: 0, dueSoonTaskCount: 0, ...overrides })

  it('picks one badge: overdue, then due soon, then no head, then on track', () => {
    expect(department({ overdueTaskCount: 1, dueSoonTaskCount: 2, leads: [] })).toBe('OVERDUE')
    expect(department({ dueSoonTaskCount: 1, leads: [] })).toBe('DUE_SOON')
    expect(department({ leads: [] })).toBe('NO_HEAD')
    expect(department({ leads: [{ ...head, status: 'UPCOMING' }] })).toBe('NO_HEAD')
    expect(department({})).toBe('ON_TRACK')
    expect(department({ status: 'CLOSED', overdueTaskCount: 3 })).toBe('CLOSED')
  })
})
