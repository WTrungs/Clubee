import { motion } from 'motion/react'
import { Check, Info, XCircle } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { softSpring } from '@/shared/motion/presets'
import { ProgressBar } from '@/shared/ui/ProgressBar'
import type { LifecycleStep } from '../viewModel/eventDisplay'

/** Vòng đời ST-EVT: ngang ở màn rộng, gọn thành thanh tiến trình ở màn hẹp để không cuộn ngang. */
export function EventLifecycle({ steps, cancelled, hint = null }: { steps: LifecycleStep[]; cancelled: boolean; hint?: string | null }) {
  const currentIndex = steps.findIndex((step) => step.state === 'current')
  const doneCount = steps.filter((step) => step.state === 'done').length
  const reached = currentIndex >= 0 ? currentIndex + 1 : doneCount
  const current = steps[currentIndex]

  return (
    <section aria-label="Tiến trình sự kiện" className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="space-y-2 md:hidden">
        <p className="flex items-center justify-between text-sm">
          <span className="font-semibold">{cancelled ? 'Đã hủy' : current?.label}</span>
          <span className="text-muted-foreground tabular-nums">
            Bước {reached}/{steps.length}
          </span>
        </p>
        <ProgressBar value={reached} max={steps.length} label="Tiến trình sự kiện" tone={cancelled ? 'danger' : 'primary'} />
      </div>

      <ol className="hidden items-start md:flex">
        {steps.map((step, index) => (
          <li key={step.status} className="relative flex flex-1 flex-col items-center gap-2 text-center" aria-current={step.state === 'current' ? 'step' : undefined}>
            {index > 0 && (
              <span aria-hidden className="absolute top-4 right-1/2 -left-1/2 h-0.5 bg-border">
                <motion.span
                  className={cn('block h-full origin-left', cancelled ? 'bg-status-danger' : 'bg-primary')}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: step.state === 'upcoming' ? 0 : 1 }}
                  transition={{ ...softSpring, delay: index * 0.06 }}
                />
              </span>
            )}
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...softSpring, delay: index * 0.06 }}
              className={cn(
                'relative z-10 inline-flex size-8 items-center justify-center rounded-full border-2 text-xs font-bold',
                step.state === 'done' && (cancelled ? 'border-status-danger bg-status-danger text-card' : 'border-primary bg-primary text-primary-foreground'),
                step.state === 'current' && 'border-primary bg-card text-primary ring-4 ring-primary/20',
                step.state === 'upcoming' && 'border-border bg-card text-muted-foreground',
              )}
            >
              {step.state === 'done' ? <Check aria-hidden className="size-4" /> : index + 1}
            </motion.span>
            <span className={cn('text-xs leading-tight font-semibold', step.state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground')}>
              {step.label}
            </span>
          </li>
        ))}
      </ol>

      {cancelled && (
        <p className="mt-3 hidden items-center justify-center gap-1.5 text-sm font-semibold text-status-danger md:flex">
          <XCircle aria-hidden className="size-4" />
          Sự kiện đã hủy, không khôi phục được.
        </p>
      )}
      {hint && (
        <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground md:justify-center">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {hint}
        </p>
      )}
    </section>
  )
}
