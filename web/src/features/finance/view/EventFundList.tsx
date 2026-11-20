import { motion } from 'motion/react'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { EventStatusBadge } from '@/features/event/view/EventMeta'
import { formatMoney } from '@/shared/format/formatMoney'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Badge } from '@/shared/ui/Badge'
import { FilterChip, Pagination } from '@/shared/ui/ListControls'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { fundStatusDisplay } from '../viewModel/financeDisplay'
import type { EventFundFilter, FinancePageViewModel } from '../viewModel/useFinancePageViewModel'

const FILTERS: Array<{ value: EventFundFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'OPEN', label: 'Đang mở' },
  { value: 'SETTLED', label: 'Đã quyết toán' },
]

/** Quỹ sự kiện người gọi được xem; mỗi dòng dẫn tới tab Quỹ của sự kiện để xem sổ, quyết toán (FR-FIN-11). */
export function EventFundList({ vm }: { vm: FinancePageViewModel }) {
  return (
    <div className="space-y-4">
      <div role="group" aria-label="Lọc quỹ sự kiện" className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <FilterChip key={filter.value} label={filter.label} selected={vm.filter === filter.value} onToggle={() => vm.setFilter(filter.value)} />
        ))}
      </div>
      <section aria-label="Quỹ sự kiện" className="rounded-2xl border bg-card p-2 shadow-sm">
        {vm.loading && (
          <div className="space-y-2 p-2" role="status" aria-label="Đang tải quỹ sự kiện">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {vm.error && !vm.loading && <ErrorState error={vm.error} onRetry={vm.retry} className="border-0" />}
        {!vm.loading && !vm.error && vm.funds.length === 0 && <EmptyState icon={CalendarDays} title="Không có quỹ sự kiện phù hợp" className="border-0" />}
        {!vm.error && vm.funds.length > 0 && (
          <motion.ul key={`${vm.filter}-${vm.page}`} variants={listVariants} initial="initial" animate="animate" className="divide-y">
            {vm.funds.map((fund) =>
              fund.event ? (
                <motion.li key={fund.id} variants={itemVariants} className="py-0.5">
                  <Link
                    to={`/clubs/${encodeURIComponent(vm.clubId)}/events/${encodeURIComponent(fund.event.id)}?tab=fund`}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors duration-200 hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold break-words">{fund.event.name}</span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        <EventStatusBadge status={fund.event.status} />
                        <Badge tone={fundStatusDisplay[fund.status].tone}>{fundStatusDisplay[fund.status].label}</Badge>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs text-muted-foreground">Số dư</span>
                      <span className="block text-sm font-bold tabular-nums">{formatMoney(fund.balance)}</span>
                    </span>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </motion.li>
              ) : null,
            )}
          </motion.ul>
        )}
      </section>
      <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />
    </div>
  )
}
