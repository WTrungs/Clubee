import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/apiError'
import { applyServerFieldErrors } from './applyServerFieldErrors'

const fieldError = (...errors: Array<{ field: string; message: string }>) => new ApiError(400, { status: 400, detail: 'Sai.', errors })

describe('applyServerFieldErrors', () => {
  it('attaches matching fields and renames API fields to form fields', () => {
    const setError = vi.fn()
    const applied = applyServerFieldErrors(
      fieldError({ field: 'reason', message: 'Thiếu lý do.' }, { field: 'startOn', message: 'Ngoài nhiệm kỳ.' }, { field: 'other', message: 'Bỏ qua.' }),
      setError,
      ['reason'],
      { startOn: 'startDate' },
    )
    expect(applied).toBe(true)
    expect(setError).toHaveBeenCalledWith('reason', { type: 'server', message: 'Thiếu lý do.' })
    expect(setError).toHaveBeenCalledWith('startDate', { type: 'server', message: 'Ngoài nhiệm kỳ.' })
    expect(setError).toHaveBeenCalledTimes(2)
  })

  it('does nothing for errors without field details', () => {
    const setError = vi.fn()
    expect(applyServerFieldErrors(new Error('network'), setError, ['reason'])).toBe(false)
    expect(setError).not.toHaveBeenCalled()
  })
})
