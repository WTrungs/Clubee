import { describe, expect, it } from 'vitest'
import { formatDate } from '@/shared/format/formatDate'
import { scopeKeyOf, sessionFormSchema, toCreateSessionRequest, type SessionFormValues } from './sessionFormSchema'

const DAY_MS = 24 * 60 * 60 * 1000
const nextWeek = formatDate(new Date(Date.now() + 7 * DAY_MS))
const values = (fields: Partial<SessionFormValues> = {}): SessionFormValues => ({
  scopeKey: 'd-media',
  title: 'Họp ban Truyền thông',
  description: '',
  startDate: nextWeek,
  startTime: '18:00',
  endDate: nextWeek,
  endTime: '20:00',
  location: 'Phòng A2',
  capacity: '',
  deadlineDate: '',
  deadlineTime: '',
  ...fields,
})
const issuesOf = (input: SessionFormValues) => {
  const result = sessionFormSchema.safeParse(input)
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

describe('sessionFormSchema (FR-ATT-01)', () => {
  it('accepts a single session with optional seats and deadline left empty', () => {
    expect(issuesOf(values())).toEqual({})
  })

  it('requires a place, a start in the future and an end after the start', () => {
    expect(issuesOf(values({ location: '  ' }))).toHaveProperty('location', 'Nhập địa điểm.')
    expect(issuesOf(values({ startDate: '01/01/2020', endDate: '01/01/2020' }))).toHaveProperty('startDate', 'Buổi phải bắt đầu sau thời điểm hiện tại.')
    expect(issuesOf(values({ endTime: '17:00' }))).toHaveProperty('endDate', 'Kết thúc phải sau bắt đầu.')
    expect(issuesOf(values({ startDate: '31/02/2030' }))).toHaveProperty('startDate', 'Ngày không tồn tại.')
  })

  it('takes seats as a positive whole number and a deadline no later than the start', () => {
    expect(issuesOf(values({ capacity: '0' }))).toHaveProperty('capacity')
    expect(issuesOf(values({ capacity: '2.5' }))).toHaveProperty('capacity')
    expect(issuesOf(values({ capacity: '25' }))).toEqual({})
    expect(issuesOf(values({ deadlineDate: nextWeek }))).toHaveProperty('deadlineDate', 'Nhập đủ ngày (dd/mm/yyyy) và giờ (hh:mm), hoặc để trống cả hai.')
    expect(issuesOf(values({ deadlineDate: nextWeek, deadlineTime: '19:00' }))).toHaveProperty('deadlineDate', 'Hạn đăng ký phải trước giờ bắt đầu.')
    expect(issuesOf(values({ deadlineDate: nextWeek, deadlineTime: '12:00' }))).toEqual({})
  })

  it('maps the chosen scope and the dd/mm/yyyy fields to the request', () => {
    expect(scopeKeyOf({ type: 'CLUB', departmentId: null })).toBe('CLUB')
    expect(scopeKeyOf({ type: 'DEPARTMENT', departmentId: 'd-media' })).toBe('d-media')
    const department = toCreateSessionRequest(values({ capacity: '12', deadlineDate: nextWeek, deadlineTime: '12:00' }))
    expect(department).toMatchObject({ scopeType: 'DEPARTMENT', departmentId: 'd-media', capacity: 12 })
    expect(department.startAt).toMatch(/T18:00:00\+07:00$/)
    expect(department.registrationDeadline).toMatch(/T12:00:00\+07:00$/)
    expect(toCreateSessionRequest(values({ scopeKey: 'CLUB' }))).toMatchObject({ scopeType: 'CLUB', departmentId: null, capacity: null, registrationDeadline: null })
  })
})
