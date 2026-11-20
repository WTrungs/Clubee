import { motion } from 'motion/react'
import { cn } from '@/shared/lib/cn'
import { softSpring } from '@/shared/motion/presets'
import type { Tone } from './tone'
import { toneDotClass } from './tone'

interface ProgressBarProps {
  value: number
  max: number
  label: string
  tone?: Tone | 'primary'
  className?: string
}

export function ProgressBar({ value, max, label, tone = 'primary', className }: ProgressBarProps) {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <motion.div
        className={cn('h-full origin-left rounded-full', tone === 'primary' ? 'bg-primary' : toneDotClass[tone])}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: ratio }}
        transition={softSpring}
      />
    </div>
  )
}
