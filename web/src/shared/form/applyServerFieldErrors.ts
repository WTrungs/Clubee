import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError } from '@/api/apiError'

/** Gắn lỗi theo trường từ Problem Details vào form (`rename` đổi tên trường API sang tên ô); trả về true nếu có lỗi được gắn. */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
  rename: Partial<Record<string, Path<T>>> = {},
): boolean {
  if (!(error instanceof ApiError)) return false
  let applied = false
  for (const fieldError of error.fieldErrors) {
    const field = rename[fieldError.field] ?? fields.find((candidate) => candidate === fieldError.field)
    if (field) {
      setError(field, { type: 'server', message: fieldError.message })
      applied = true
    }
  }
  return applied
}
