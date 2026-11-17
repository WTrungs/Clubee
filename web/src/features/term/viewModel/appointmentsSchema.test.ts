import { describe, expect, it } from 'vitest'
import type { Appointment } from '../model/handoverTypes'
import { appointmentFieldPath, appointmentsSchema, toAppointmentRequests, toAppointmentValues, type AppointmentRow } from './appointmentsSchema'
import { appointmentTitle, groupAppointments } from './termDisplay'

const issues = (result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[] }> } }) =>
  result.success ? [] : (result.error?.issues ?? []).map((issue) => issue.path.join('.'))

const row = (overrides: Partial<AppointmentRow>): AppointmentRow => ({ role: 'PRESIDENT', departmentId: '', userId: 'u-linh', ...overrides })

const appointment = (overrides: Partial<Appointment>): Appointment => ({
  id: 'ap',
  role: 'PRESIDENT',
  department: null,
  person: { id: 'u-linh', fullName: 'Đặng Khánh Linh' },
  eligible: true,
  ineligibleReason: null,
  ...overrides,
})

describe('election result form (FR-TERM-03)', () => {
  it('needs a department for department roles and a person on every row', () => {
    const result = appointmentsSchema.safeParse({ rows: [row({ role: 'DEPARTMENT_HEAD' }), row({ userId: '' })] })
    expect(issues(result).toSorted()).toEqual(['rows.0.departmentId', 'rows.1.userId'])
  })

  it('refuses the same person twice in the same role, but allows two roles', () => {
    expect(issues(appointmentsSchema.safeParse({ rows: [row({}), row({})] }))).toEqual(['rows.1.userId'])
    expect(appointmentsSchema.safeParse({ rows: [row({}), row({ role: 'DEPARTMENT_HEAD', departmentId: 'd-media' })] }).success).toBe(true)
  })

  it('sends no department for board roles even if one was picked before switching role', () => {
    expect(toAppointmentRequests({ rows: [row({ departmentId: 'd-media' }), row({ role: 'DEPARTMENT_VICE_HEAD', departmentId: 'd-media', userId: 'u-vy' })] })).toEqual([
      { role: 'PRESIDENT', departmentId: null, userId: 'u-linh' },
      { role: 'DEPARTMENT_VICE_HEAD', departmentId: 'd-media', userId: 'u-vy' },
    ])
  })

  it('fills the form from saved results and maps server field names', () => {
    expect(toAppointmentValues([appointment({ role: 'DEPARTMENT_HEAD', department: { id: 'd-media', name: 'Truyền thông' } })])).toEqual({
      rows: [{ role: 'DEPARTMENT_HEAD', departmentId: 'd-media', userId: 'u-linh' }],
    })
    expect(appointmentFieldPath('appointments[2].userId')).toBe('rows.2.userId')
    expect(appointmentFieldPath('appointments')).toBeNull()
  })
})

describe('election result display', () => {
  it('names the role with its department', () => {
    expect(appointmentTitle({ role: 'TREASURER', department: null })).toBe('Thủ quỹ')
    expect(appointmentTitle({ role: 'DEPARTMENT_VICE_HEAD', department: { id: 'd-media', name: 'Truyền thông' } })).toBe('Phó ban Truyền thông')
  })

  it('lists the new board by rank, then department leads by department', () => {
    const groups = groupAppointments([
      appointment({ id: 'a', role: 'TREASURER', person: { id: 'u-mai', fullName: 'Võ Ngọc Mai' } }),
      appointment({ id: 'b', role: 'DEPARTMENT_HEAD', department: { id: 'd-media', name: 'Truyền thông' } }),
      appointment({ id: 'c', role: 'PRESIDENT' }),
      appointment({ id: 'd', role: 'DEPARTMENT_HEAD', department: { id: 'd-logistics', name: 'Hậu cần' } }),
    ])
    expect(groups.board.map((item) => item.id)).toEqual(['c', 'a'])
    expect(groups.departments.map((item) => item.id)).toEqual(['d', 'b'])
  })
})
