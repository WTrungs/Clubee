import { motion } from 'motion/react'
import { Building2, CircleCheck, Clock, Lock, MailQuestion, ServerCrash, Shuffle, type LucideIcon } from 'lucide-react'
import { formatDateTime } from '@/shared/format/formatDate'
import { cn } from '@/shared/lib/cn'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { AnimatedNumber } from '@/shared/ui/AnimatedNumber'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import type { Tone } from '@/shared/ui/tone'
import { toneVariants } from '@/shared/ui/tone'
import { useAdminMetricsViewModel } from '../viewModel/useAdminMetricsViewModel'

function MetricCard({ icon: Icon, label, value, tone, note }: { icon: LucideIcon; label: string; value: number; tone: Tone; note?: string }) {
  return (
    <motion.li variants={itemVariants} className="flex items-start gap-4 rounded-2xl border bg-card p-5 shadow-sm">
      <span className={cn('inline-flex size-12 shrink-0 items-center justify-center rounded-2xl', toneVariants({ tone }))}>
        <Icon aria-hidden className="size-6" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-muted-foreground">{label}</span>
        <AnimatedNumber value={value} className="block text-2xl font-extrabold tabular-nums" />
        {note && <span className="block text-xs text-muted-foreground">{note}</span>}
      </span>
    </motion.li>
  )
}

/** FR-ACC-09: số liệu vận hành của hệ thống; không có dữ liệu nội bộ CLB (SRS 3.4). */
export function AdminMetricsPage() {
  const vm = useAdminMetricsViewModel()
  const metrics = vm.metrics
  return (
    <div>
      <PageHeader
        eyebrow="Quản trị hệ thống"
        title="Số liệu vận hành"
        description={metrics ? `Cập nhật lúc ${formatDateTime(metrics.generatedAt)}.` : 'Tình hình tài khoản, CLB và yêu cầu cần xử lý.'}
      />
      {vm.loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Đang tải số liệu">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-24 rounded-2xl" />
          ))}
        </div>
      )}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {metrics && (
        <motion.ul variants={listVariants} initial="initial" animate="animate" aria-label="Số liệu" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Building2} label="CLB" value={metrics.clubCount} tone="info" />
          <MetricCard icon={CircleCheck} label="Tài khoản hoạt động" value={metrics.accounts.ACTIVE} tone="success" />
          <MetricCard icon={Clock} label="Đăng nhập trong 30 ngày" value={metrics.activeLast30Days} tone="progress" />
          <MetricCard icon={Lock} label="Tài khoản bị khóa" value={metrics.accounts.LOCKED} tone={metrics.accounts.LOCKED > 0 ? 'danger' : 'neutral'} />
          <MetricCard icon={MailQuestion} label="Chờ xác thực email" value={metrics.accounts.PENDING_VERIFICATION} tone="warning" />
          <MetricCard icon={Shuffle} label="Yêu cầu chuyển quyền chờ xử lý" value={metrics.pendingTransferRequests} tone={metrics.pendingTransferRequests > 0 ? 'warning' : 'neutral'} />
          <MetricCard icon={ServerCrash} label="Lỗi hệ thống 24 giờ qua" value={metrics.systemErrorsLast24h} tone={metrics.systemErrorsLast24h > 0 ? 'danger' : 'success'} note="Lấy từ nhật ký lỗi của máy chủ." />
        </motion.ul>
      )}
    </div>
  )
}
