import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { formatNumber } from '@/shared/format/formatMoney'

/** Số đếm lên khi xuất hiện; bỏ hiệu ứng nếu người dùng chọn giảm chuyển động. */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (reduceMotion) {
      node.textContent = formatNumber(value)
      return
    }
    const controls = animate(0, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        node.textContent = formatNumber(Math.round(latest))
      },
    })
    return () => controls.stop()
  }, [value, reduceMotion])

  return (
    <span ref={ref} className={className} aria-label={formatNumber(value)}>
      {formatNumber(value)}
    </span>
  )
}
