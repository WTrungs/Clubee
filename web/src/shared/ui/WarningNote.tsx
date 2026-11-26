import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/** Cảnh báo không chặn thao tác (ví dụ FR-TASK-09): người dùng đọc rồi vẫn làm tiếp được. */
export function WarningNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="status" className={cn('flex items-start gap-2 rounded-xl bg-status-warning-soft p-3 text-sm text-status-warning', className)}>
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  )
}
