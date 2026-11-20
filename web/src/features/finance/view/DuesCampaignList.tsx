import { motion } from 'motion/react'
import { Plus, WalletCards } from 'lucide-react'
import { useId } from 'react'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { FilterChip, Pagination } from '@/shared/ui/ListControls'
import { ProgressBar } from '@/shared/ui/ProgressBar'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { DuesCampaignSummary } from '../model/duesTypes'
import { duesCampaignStatusDisplay, duesDeadlineText, duesProgressText } from '../viewModel/duesDisplay'
import type { DuesCampaignsViewModel } from '../viewModel/useDuesCampaignsViewModel'

function CampaignRow({ campaign, onOpen }: { campaign: DuesCampaignSummary; onOpen: (id: string) => void }) {
  const status = duesCampaignStatusDisplay[campaign.status]
  return (
    <button
      type="button"
      onClick={() => onOpen(campaign.id)}
      className="w-full space-y-2 rounded-xl p-3 text-left transition-colors hover:bg-muted"
      aria-label={`Đợt ${campaign.name}, ${status.label}, ${duesProgressText(campaign)}`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 space-y-1">
          <span className="block truncate text-sm font-semibold">{campaign.name}</span>
          <span className="block text-xs text-muted-foreground">{duesDeadlineText(campaign.dueOn)}</span>
        </span>
        <Badge tone={status.tone}>{status.label}</Badge>
      </span>
      <ProgressBar value={campaign.settledCount} max={campaign.memberCount} label={`Tiến độ thu ${campaign.name}`} tone="success" />
      <span className="block text-xs text-muted-foreground tabular-nums">{duesProgressText(campaign)}</span>
    </button>
  )
}

/** Tab Đóng quỹ (FR-FIN-09): các đợt, tiến độ thu; Thủ quỹ mở đợt mới. */
export function DuesCampaignList({ vm }: { vm: DuesCampaignsViewModel }) {
  const titleId = useId()
  return (
    <>
      <section aria-labelledby={titleId} className="rounded-2xl border bg-card shadow-sm">
        <header className="space-y-3 border-b p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id={titleId} className="flex items-center gap-2 font-bold">
              <WalletCards aria-hidden className="size-5 text-muted-foreground" />
              Đợt đóng quỹ
            </h2>
            {vm.canOpen && (
              <Button size="sm" onClick={() => vm.setOpenSheet(true)}>
                <Plus aria-hidden />
                Mở đợt đóng quỹ
              </Button>
            )}
          </div>
          <div role="group" aria-label="Lọc đợt đóng quỹ" className="flex flex-wrap gap-2">
            {vm.filters.map((item) => (
              <FilterChip key={item.key} label={item.label} selected={vm.filter === item.key} onToggle={() => vm.setFilter(item.key)} />
            ))}
          </div>
        </header>
        <div className="p-2">
          {vm.loading && (
            <div className="space-y-2 p-2" role="status" aria-label="Đang tải đợt đóng quỹ">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}
          {vm.error && !vm.loading && <ErrorState error={vm.error} onRetry={vm.refetch} className="border-0" />}
          {!vm.loading && !vm.error && vm.campaigns.length === 0 && (
            <EmptyState
              icon={WalletCards}
              title={vm.filter === 'ALL' ? 'Chưa có đợt đóng quỹ' : 'Không có đợt phù hợp'}
              description={vm.canOpen ? 'Mở một đợt để thu quỹ thành viên theo kỳ.' : 'Thủ quỹ mở đợt để thu quỹ thành viên theo kỳ.'}
              className="border-0"
            />
          )}
          {!vm.error && vm.campaigns.length > 0 && (
            <motion.ul key={`${vm.filter}-${vm.page}`} variants={listVariants} initial="initial" animate="animate" className="divide-y">
              {vm.campaigns.map((campaign) => (
                <motion.li key={campaign.id} variants={itemVariants} className="py-0.5">
                  <CampaignRow campaign={campaign} onOpen={vm.openCampaign} />
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
