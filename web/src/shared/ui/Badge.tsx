import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/cn'
import { toneVariants, type Tone } from './tone'

interface BadgeProps extends ComponentProps<'span'> {
  tone?: Tone
  /** Chấm màu trước chữ; trạng thái luôn có chữ đi kèm nên không chỉ dựa vào màu. */
  dot?: boolean
}

export function Badge({ className, tone = 'neutral', dot = false, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 max-w-full items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap',
        toneVariants({ tone }),
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />}
      <span className="truncate">{children}</span>
    </span>
  )
}
