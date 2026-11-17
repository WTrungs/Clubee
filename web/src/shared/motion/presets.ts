import type { Transition, Variants } from 'motion/react'

/** Một nhịp chung cho mọi hiệu ứng: dưới 300 ms, vào chậm hơn ra, vào và ra đều ease-out; chuyển động vị trí dùng spring. */
export const duration = {
  fast: 0.15,
  base: 0.22,
  slow: 0.28,
} as const

export const easeOut = [0.16, 1, 0.3, 1] as const

export const spring: Transition = { type: 'spring', stiffness: 380, damping: 32, mass: 0.8 }
export const softSpring: Transition = { type: 'spring', stiffness: 220, damping: 28 }

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: easeOut } },
  exit: { opacity: 0, y: -6, transition: { duration: duration.fast, ease: easeOut } },
}

export const listVariants: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
}

export const itemVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.base, ease: easeOut } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: duration.fast, ease: easeOut } },
}

export const fadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: duration.base, ease: easeOut } },
  exit: { opacity: 0, transition: { duration: duration.fast, ease: easeOut } },
}
