import { motion } from 'motion/react'
import { Check } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { softSpring } from '@/shared/motion/presets'
import { ProgressBar } from '@/shared/ui/ProgressBar'
import type { TermLifecycleStep } from '../viewModel/termDisplay'

/** Vòng đời ST-TERM: ngang ở màn rộng, gọn thành thanh tiến trình ở màn hẹp để không cuộn ngang. */
export function TermLifecycle({ steps }: { steps: TermLifecycleStep[] }) {
  const currentIndex = steps.findIndex((step) => step.state === 'current')
  const reached = currentIndex >= 0 ? currentIndex + 1 : steps.filter((step) => step.state === 'done').length
  const current = steps[currentIndex] ?? steps[steps.length - 1]

  return (
    <div aria-label="Tiến trình nhiệm kỳ" role="group">
      <div className="space-y-2 md:hidden">
        <p className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold">{current?.label}</span>
          <span className="text-muted-foreground tabular-nums">
            Bước {reached}/{steps.length}
          </span>
        </p>
        <ProgressBar value={reached} max={steps.length} label="Tiến trình nhiệm kỳ" />
      </div>

      <ol className="hidden items-start md:flex">
        {steps.map((step, index) => (
          <li key={step.status} className="relative flex flex-1 flex-col items-center gap-2 text-center" aria-current={step.state === 'current' ? 'step' : undefined}>
            {index > 0 && (
              <span aria-hidden className="absolute top-4 right-1/2 -left-1/2 h-0.5 bg-border">
                <motion.span
                  className="block h-full origin-left bg-primary"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: step.state === 'upcoming' ? 0 : 1 }}
                  transition={{ ...softSpring, delay: index * 0.06 }}
                />
              </span>
            )}
            <span
              className={cn(
                'relative z-10 inline-flex size-8 items-center justify-center rounded-full border-2 text-xs font-bold',
                step.state === 'done' && 'border-primary bg-primary text-primary-foreground',
                step.state === 'current' && 'border-primary bg-card text-primary ring-4 ring-primary/20',
                step.state === 'upcoming' && 'border-border bg-card text-muted-foreground',
              )}
            >
              {step.state === 'done' ? <Check aria-hidden className="size-4" /> : index + 1}
              <span className="sr-only">{step.state === 'done' ? ', đã qua' : step.state === 'current' ? ', hiện tại' : ', chưa tới'}</span>
            </span>
            <span className={cn('text-xs leading-tight font-semibold', step.state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground')}>{step.label}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
