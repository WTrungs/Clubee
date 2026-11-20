import { motion } from 'motion/react'
import { RefreshCw, ShieldAlert, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ApiError, getErrorMessage } from '@/api/apiError'
import { cn } from '@/shared/lib/cn'
import { fadeVariants } from '@/shared/motion/presets'
import { Button } from './Button'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <motion.div
      variants={fadeVariants}
      initial="initial"
      animate="animate"
      className={cn('flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card/60 px-6 py-12 text-center', className)}
    >
      <span className="relative inline-flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Icon aria-hidden className="size-7" />
      </span>
      <div className="max-w-sm space-y-1">
        <p className="font-semibold">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </motion.div>
  )
}

interface ErrorStateProps {
  error: unknown
  onRetry?: () => void
  /** Lối thoát khác, ví dụ quay về danh sách khi bị từ chối quyền. */
  action?: ReactNode
  className?: string
}

/** Hiện lỗi của truy vấn; với 403 nêu đúng lý do máy chủ trả về (IF-01). */
export function ErrorState({ error, onRetry, action, className }: ErrorStateProps) {
  const forbidden = error instanceof ApiError && error.status === 403
  const Icon = forbidden ? ShieldAlert : TriangleAlert
  return (
    <motion.div
      variants={fadeVariants}
      initial="initial"
      animate="animate"
      role="alert"
      className={cn('flex flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-10 text-center', className)}
    >
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-status-danger-soft text-status-danger">
        <Icon aria-hidden className="size-6" />
      </span>
      <div className="max-w-md space-y-1">
        <p className="font-semibold">{forbidden ? 'Bạn không có quyền xem nội dung này' : 'Không tải được dữ liệu'}</p>
        <p className="text-sm text-muted-foreground">{getErrorMessage(error)}</p>
      </div>
      {(action || (onRetry && !forbidden)) && (
        <div className="flex flex-wrap justify-center gap-2">
          {onRetry && !forbidden && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw aria-hidden />
              Thử lại
            </Button>
          )}
          {action}
        </div>
      )}
    </motion.div>
  )
}
