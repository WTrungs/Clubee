import { useEffect, useState, type RefObject } from 'react'

/** Bật, tắt toàn màn hình cho một phần tử; trình duyệt không hỗ trợ thì `supported` là false. */
export function useFullscreen(target: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const sync = () => setActive(document.fullscreenElement !== null && document.fullscreenElement === target.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [target])

  return {
    supported: typeof document !== 'undefined' && document.fullscreenEnabled === true,
    active,
    toggle: () => {
      // Trình duyệt có thể từ chối (ví dụ không do người dùng bấm); khi đó giữ nguyên chế độ hiện tại.
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
      else void target.current?.requestFullscreen().catch(() => undefined)
    },
  }
}
