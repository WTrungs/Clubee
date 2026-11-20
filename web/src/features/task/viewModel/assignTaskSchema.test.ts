import { describe, expect, it } from 'vitest'
import { formatDate } from '@/shared/format/formatDate'
import { assignTaskSchema } from './assignTaskSchema'

const tomorrow = formatDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
const base = {
  title: 'Thiết kế poster',
  description: '',
  scopeKey: 'DEPARTMENT:d-media',
  ownerId: 'u-ha',
  collaboratorIds: ['u-vy'],
  dueDate: tomorrow,
  dueTime: '21:00',
  priority: 'HIGH' as const,
}

const firstIssue = (values: typeof base) => {
  const result = assignTaskSchema.safeParse(values)
  return result.success ? null : result.error.issues[0]
}

describe('assignTaskSchema', () => {
  it('accepts a valid assignment', () => {
    expect(assignTaskSchema.safeParse(base).success).toBe(true)
  })

  it('requires a due date in the future, in dd/mm/yyyy', () => {
    expect(firstIssue({ ...base, dueDate: '2026-11-02' })?.message).toBe('Nhập ngày dạng dd/mm/yyyy.')
    expect(firstIssue({ ...base, dueDate: '31/02/2030' })?.message).toBe('Ngày không tồn tại.')
    expect(firstIssue({ ...base, dueDate: '01/01/2020' })?.message).toBe('Hạn phải sau thời điểm hiện tại.')
  })

  it('rejects the owner also listed as collaborator', () => {
    const issue = firstIssue({ ...base, collaboratorIds: ['u-ha'] })
    expect(issue?.path).toEqual(['collaboratorIds'])
  })

  it('requires an owner and a scope', () => {
    expect(firstIssue({ ...base, ownerId: '' })?.message).toBe('Chọn người chính.')
    expect(firstIssue({ ...base, scopeKey: '' })?.message).toBe('Chọn ban hoặc tiểu ban.')
  })
})
