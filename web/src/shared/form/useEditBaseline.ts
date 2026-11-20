import { useEffect, useRef } from 'react'
import type { FieldValues, UseFormReturn } from 'react-hook-form'

function sameValues<T extends FieldValues>(a: T, b: T): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].every((key) => Object.is(a[key], b[key]))
}

/** NFR-REL-03: gửi version lúc bắt đầu sửa; đang sửa dở mà dữ liệu trong form đổi ở nơi khác thì để máy chủ trả 409. */
export function useEditBaseline<T extends FieldValues>(form: UseFormReturn<T>, version: number, values: T) {
  const base = useRef({ version, values })
  useEffect(() => {
    const current = base.current
    if (version === current.version) return
    if (sameValues(values, current.values)) {
      base.current = { version, values }
    } else if (!form.formState.isDirty) {
      form.reset(values)
      base.current = { version, values }
    }
  }, [version, values, form])

  return {
    version: () => base.current.version,
    /** Gọi khi máy chủ vừa trả bản đã lưu hoặc bản tải lại, trước khi cập nhật cache. */
    accept: (nextVersion: number, nextValues: T) => {
      base.current = { version: nextVersion, values: nextValues }
    },
  }
}
