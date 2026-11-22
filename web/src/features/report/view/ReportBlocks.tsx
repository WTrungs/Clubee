import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/** Ô số liệu của các trang báo cáo. */
export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'success' | 'danger' | 'warning' }) {
  return (
    <div className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-xl font-extrabold tabular-nums [overflow-wrap:anywhere]',
          tone === 'success' && 'text-status-success',
          tone === 'danger' && 'text-status-danger',
          tone === 'warning' && 'text-status-warning',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Một phần của trang báo cáo, có tiêu đề kèm biểu tượng. */
export function ReportSection({ title, icon, description, children }: { title: string; icon: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-base font-bold">
          {icon}
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}
