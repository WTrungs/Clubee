import { describe, expect, it } from 'vitest'
import { departmentPlanSchema, planFieldPath, termFormSchema, toPlanRequest, toPlanValues, toTermDates, toTermFormValues, type PlanEntryValues } from './termSchemas'

const issues = (result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }) =>
  result.success ? [] : (result.error?.issues ?? []).map((issue) => issue.path.join('.'))

describe('term form (FR-TERM-01, BR-TERM-01)', () => {
  const schema = termFormSchema('2026-11-14')
  const valid = { name: 'Nhiệm kỳ 2027–2028', startDate: '01/09/2027', endDate: '31/08/2028' }

  it('accepts a valid term and converts dates for the API', () => {
    const parsed = schema.parse(valid)
    expect(toTermDates(parsed)).toEqual({ name: 'Nhiệm kỳ 2027–2028', startOn: '2027-09-01', endOn: '2028-08-31' })
  })

  it('needs a name of at least 3 characters and dates in dd/mm/yyyy', () => {
    expect(issues(schema.safeParse({ ...valid, name: ' AB ' }))).toEqual(['name'])
    expect(issues(schema.safeParse({ ...valid, startDate: '2027-09-01' }))).toEqual(['startDate'])
    expect(issues(schema.safeParse({ ...valid, startDate: '30/02/2027' }))).toEqual(['startDate'])
  })

  it('needs the end after the start and after today', () => {
    expect(issues(schema.safeParse({ ...valid, endDate: '01/09/2027' }))).toEqual(['endDate'])
    expect(issues(schema.safeParse({ ...valid, startDate: '01/01/2026', endDate: '14/11/2026' }))).toEqual(['endDate'])
    expect(issues(schema.safeParse({ ...valid, startDate: '01/01/2026', endDate: '15/11/2026' }))).toEqual([])
  })

  it('fills the form from an existing term', () => {
    expect(toTermFormValues({ name: 'Nhiệm kỳ', startOn: '2027-09-01', endOn: '2028-08-31' })).toEqual({ name: 'Nhiệm kỳ', startDate: '01/09/2027', endDate: '31/08/2028' })
    expect(toTermFormValues(null)).toEqual({ name: '', startDate: '', endDate: '' })
  })
})

describe('department plan form (FR-TERM-01)', () => {
  const row = (overrides: Partial<PlanEntryValues>): PlanEntryValues => ({ entryId: 'pe-1', departmentId: 'd-1', name: 'Hậu cần', description: '', dropped: false, ...overrides })

  it('refuses short and duplicate names among departments that stay', () => {
    const result = departmentPlanSchema.safeParse({ entries: [row({}), row({ entryId: null, departmentId: null, name: 'hậu cần' }), row({ entryId: null, departmentId: null, name: 'A' })] })
    expect(issues(result)).toEqual(['entries.1.name', 'entries.2.name'])
  })

  it('ignores the name of a dropped department', () => {
    expect(departmentPlanSchema.safeParse({ entries: [row({ dropped: true, name: '' }), row({ entryId: 'pe-2', departmentId: 'd-2', name: 'Hậu cần' })] }).success).toBe(true)
  })

  it('round-trips plan entries to the request shape', () => {
    const values = toPlanValues([{ id: 'pe-d-1', departmentId: 'd-1', name: 'Hậu cần', description: 'Mô tả', dropped: false, currentName: 'Hậu cần', memberCount: 3, dropBlockedReason: 'còn người' }])
    expect(toPlanRequest(values)).toEqual([{ id: 'pe-d-1', departmentId: 'd-1', name: 'Hậu cần', description: 'Mô tả', dropped: false }])
  })

  it('maps server field names onto form paths', () => {
    expect(planFieldPath('departmentPlan[3].name')).toBe('entries.3.name')
    expect(planFieldPath('departmentPlan[0].dropped')).toBe('entries.0.dropped')
    expect(planFieldPath('departmentPlan[0].departmentId')).toBeNull()
    expect(planFieldPath('name')).toBeNull()
  })
})
