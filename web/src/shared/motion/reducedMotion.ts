import { MotionGlobalConfig } from 'motion/react'

interface MotionPreference {
  matches: boolean
  addEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void
}

/** Tắt cả hiệu ứng mờ dần mà `MotionConfig reducedMotion="user"` còn giữ khi người dùng chọn giảm chuyển động. */
export function syncReducedMotion(preference: MotionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')): void {
  MotionGlobalConfig.skipAnimations = preference.matches
  preference.addEventListener('change', (event) => {
    MotionGlobalConfig.skipAnimations = event.matches
  })
}
