import { motion } from 'motion/react'
import { CircleCheck, HandCoins, Receipt } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { formatDate } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import { cn } from '@/shared/lib/cn'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Badge } from '@/shared/ui/Badge'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { MyDuesItem } from '../model/duesTypes'
import { duesCampaignStatusDisplay, duesDeadlineText, duesItemStatusDisplay } from '../viewModel/duesDisplay'
import { myExemptionText, useMyDuesViewModel } from '../viewModel/useMyDuesViewModel'

function Amount({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className={cn('font-bold tabular-nums', tone === 'danger' && 'text-status-danger')}>{value}</dd>
    </div>
  )
}

function DuesCard({ clubId, item, highlighted }: { clubId: string; item: MyDuesItem; highlighted: boolean }) {
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'center' })
  }, [highlighted])
  const status = duesItemStatusDisplay[item.status]
  return (
    <motion.li
      ref={ref}
      variants={itemVariants}
      aria-label={`Đợt ${item.campaign.name}`}
      className={cn('min-w-0 space-y-3 rounded-2xl border bg-card p-4 shadow-sm', highlighted && 'border-primary ring-2 ring-primary/30')}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold [overflow-wrap:anywhere]">{item.campaign.name}</h3>
          <p className="text-sm text-muted-foreground">
            {duesDeadlineText(item.campaign.dueOn)} · {duesCampaignStatusDisplay[item.campaign.status].label}
          </p>
        </div>
        <p className="flex flex-wrap gap-1.5">
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
          {item.overdue && <Badge tone="danger">Quá hạn</Badge>}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <Amount label="Phải đóng" value={item.exemption?.kind === 'EXEMPT' ? 'Miễn' : formatMoney(item.amountDue)} />
        <Amount label="Đã nộp" value={formatMoney(item.paidAmount)} />
        <Amount label="Còn thiếu" value={formatMoney(item.remaining)} tone={item.remaining > 0 && item.campaign.status === 'OPEN' ? 'danger' : undefined} />
      </dl>
      {item.exemption && (
        <p className="rounded-xl bg-muted/60 p-3 text-sm [overflow-wrap:anywhere]">
          <span className="font-semibold">{myExemptionText(item)}.</span> Lý do: {item.exemption.reason}
        </p>
      )}
      {item.payments.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-muted-foreground">Các lần nộp</h4>
          <ul className="space-y-1.5">
            {item.payments.map((payment) => (
              <li key={payment.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                <Receipt aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <Link
                  to={`/clubs/${encodeURIComponent(clubId)}/finance?tx=${encodeURIComponent(payment.transactionId)}`}
                  className="font-semibold text-primary hover:underline"
                >
                  {formatMoney(payment.amount)} ngày {formatDate(payment.paidOn)}
                </Link>
                <span className="text-muted-foreground">· {payment.confirmedBy.fullName} xác nhận</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.li>
  )
}

/** FR-FIN-13: khoản đóng của tôi ở CLB đang xem: các đợt, số đã nộp, số còn thiếu. */
export function MyDuesPanel({ clubId, active, highlightId }: { clubId: string; active: boolean; highlightId: string | null }) {
  const vm = useMyDuesViewModel(clubId, active, highlightId)
  if (vm.loading) return <Skeleton role="status" aria-label="Đang tải khoản đóng của tôi" className="h-48 rounded-2xl" />
  if (vm.error) return <ErrorState error={vm.error} onRetry={vm.refetch} />
  if (vm.items.length === 0) {
    return <EmptyState icon={HandCoins} title="Bạn chưa có khoản đóng nào" description="Khi ban chủ nhiệm mở đợt đóng quỹ mà bạn thuộc danh sách phải đóng, đợt đó sẽ hiện ở đây." />
  }
  return (
    <div className="space-y-4">
      <section
        aria-label="Tổng còn thiếu"
        className={cn('flex items-start gap-3 rounded-2xl border p-4', vm.summary.owed > 0 ? 'bg-status-warning-soft' : 'bg-status-success-soft')}
      >
        {vm.summary.owed > 0 ? <HandCoins aria-hidden className="mt-0.5 size-5 shrink-0 text-status-warning" /> : <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-status-success" />}
        <p className="text-sm">
          {vm.summary.owed > 0 ? (
            <>
              Bạn còn thiếu <span className="font-bold">{formatMoney(vm.summary.owed)}</span> ở {vm.summary.openCount} đợt đang mở
              {vm.summary.overdueCount > 0 && `, ${vm.summary.overdueCount} đợt đã quá hạn`}. Nộp cho Thủ quỹ để được xác nhận.
            </>
          ) : (
            'Bạn đã xong mọi đợt đóng quỹ đang mở.'
          )}
        </p>
      </section>
      <motion.ul aria-label="Các đợt đóng quỹ của tôi" variants={listVariants} initial="initial" animate="animate" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {vm.items.map((item) => (
          <DuesCard key={item.id} clubId={clubId} item={item} highlighted={item.campaign.id === vm.highlightId} />
        ))}
      </motion.ul>
    </div>
  )
}
