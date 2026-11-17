import { useEffect, useState } from 'react'

/** Giá trị chỉ cập nhật sau khi ngừng thay đổi một khoảng, để ô tìm kiếm không gọi API mỗi lần gõ. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
