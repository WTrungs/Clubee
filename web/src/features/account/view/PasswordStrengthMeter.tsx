import { motion } from 'motion/react'
import { cn } from '@/shared/lib/cn'
import { spring } from '@/shared/motion/presets'

const strengthLabels = ['', 'Yếu', 'Tạm được', 'Khá', 'Mạnh'] as const
const strengthColors = ['bg-muted', 'bg-status-danger', 'bg-status-warning', 'bg-status-info', 'bg-status-success'] as const

/** Thanh gợi ý độ mạnh mật khẩu 0–4 (`passwordStrength`); chỉ để hướng dẫn, máy chủ mới quyết định. */
export function PasswordStrengthMeter({ strength }: { strength: 0 | 1 | 2 | 3 | 4 }) {
  return (
    <div aria-live="polite" className="-mt-1 flex items-center gap-2">
      <div className="grid flex-1 grid-cols-4 gap-1.5" aria-hidden>
        {[1, 2, 3, 4].map((level) => (
          <span key={level} className="h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.span
              className={cn('block h-full rounded-full', strengthColors[strength])}
              initial={false}
              animate={{ scaleX: strength >= level ? 1 : 0 }}
              style={{ originX: 0 }}
              transition={spring}
            />
          </span>
        ))}
      </div>
      <span className="w-16 text-right text-xs font-semibold text-muted-foreground">
        {strength > 0 && <span className="sr-only">Độ mạnh mật khẩu: </span>}
        {strengthLabels[strength]}
      </span>
    </div>
  )
}
