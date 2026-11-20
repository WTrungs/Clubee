import { motion } from 'motion/react'
import { HandCoins } from 'lucide-react'
import { useId } from 'react'
import { formatMoney } from '@/shared/format/formatMoney'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Badge } from '@/shared/ui/Badge'
import { FilterChip, Pagination, SearchInput } from '@/shared/ui/ListControls'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { AdvanceSummary } from '../model/advanceTypes'
import { advanceStatusDisplay, settleByText } from '../viewModel/advanceDisplay'
import type { AdvanceListViewModel } from '../viewModel/useAdvanceListViewModel'

function AdvanceRow({ advance, onOpen }: { advance: AdvanceSummary; onOpen: (id: string) => void }) {
  const status = advanceStatusDisplay[advance.status]
  const settle = settleByText(advance)
  return (
    <button
      type="button"
      onClick={() => onOpen(advance.id)}
      className="flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors hover:bg-muted"
      aria-label={`Tạm ứng ${advance.purpose}, ${advance.requester.fullName}, ${formatMoney(advance.amount)}, ${status.label}${advance.overdue ? ', quá hạn' : ''}`}
    >
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block truncate text-sm font-semibold">{advance.purpose}</span>
        <span className="block text-xs text-muted-foreground">
          {advance.requester.fullName}
          {settle ? ` · ${settle}` : ''}
        </span>
        <span className="flex flex-wrap gap-1.5">
          <Badge tone={status.tone}>{status.label}</Badge>
          {advance.overdue && <Badge tone="danger">Quá hạn</Badge>}
        </span>
      </span>
      <span className="shrink-0 text-sm font-bold tabular-nums">{formatMoney(advance.amount)}</span>
    </button>
  )
}

/** Tab Tạm ứng của quỹ (FR-FIN-07): lọc trạng thái, của tôi, quá hạn, tìm, phân trang. */
export function AdvanceList({ vm }: { vm: AdvanceListViewModel }) {
  const titleId = useId()
  const filtered = vm.filter !== 'OPEN' || vm.mine || vm.overdue || vm.keyword.trim() !== ''
  return (
    <>
      <section aria-labelledby={titleId} className="rounded-2xl border bg-card shadow-sm">
        <header className="space-y-3 border-b p-4 sm:p-5">
          <h2 id={titleId} className="flex items-center gap-2 font-bold">
            <HandCoins aria-hidden className="size-5 text-muted-foreground" />
            Tạm ứng
          </h2>
          <SearchInput label="Tìm tạm ứng" placeholder="Tìm theo mục đích, người ứng…" value={vm.keyword} onValueChange={vm.setKeyword} className="sm:max-w-md" />
          <div role="group" aria-label="Lọc tạm ứng" className="flex flex-wrap gap-2">
            {vm.filters.map((item) => (
              <FilterChip key={item.key} label={item.label} selected={vm.filter === item.key} onToggle={() => vm.setFilter(item.key)} />
            ))}
            <FilterChip label="Của tôi" selected={vm.mine} onToggle={() => vm.setMine(!vm.mine)} />
            <FilterChip label="Quá hạn" selected={vm.overdue} onToggle={() => vm.setOverdue(!vm.overdue)} />
          </div>
        </header>
        <div className="p-2">
          {vm.loading && (
            <div className="space-y-2 p-2" role="status" aria-label="Đang tải tạm ứng">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}
          {vm.error && !vm.loading && <ErrorState error={vm.error} onRetry={vm.refetch} className="border-0" />}
          {!vm.loading && !vm.error && vm.advances.length === 0 && (
            <EmptyState
              icon={HandCoins}
              title={filtered ? 'Không có tạm ứng phù hợp' : 'Chưa có tạm ứng đang mở'}
              description={filtered ? 'Thử đổi bộ lọc hoặc từ khóa.' : 'Tạm ứng đang chờ duyệt, chờ ghi đã ứng hoặc chưa quyết toán sẽ hiện ở đây.'}
              className="border-0"
            />
          )}
          {!vm.error && vm.advances.length > 0 && (
            <motion.ul key={`${vm.filter}-${String(vm.mine)}-${String(vm.overdue)}-${vm.page}`} variants={listVariants} initial="initial" animate="animate" className="divide-y">
              {vm.advances.map((advance) => (
                <motion.li key={advance.id} variants={itemVariants} className="py-0.5">
                  <AdvanceRow advance={advance} onOpen={vm.openAdvance} />
                </motion.li>
              ))}
            </motion.ul>
          )}
        </div>
      </section>
      <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />
    </>
  )
}
