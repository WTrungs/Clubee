import { AlertTriangle, ListChecks } from 'lucide-react'
import { Badge } from '@/shared/ui/Badge'
import { ProgressBar } from '@/shared/ui/ProgressBar'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { TaskProgressCounts } from '../model/eventTypes'
import { donePercent, progressSummary, useEventProgressViewModel } from '../viewModel/useEventProgressViewModel'

function CountRow({ counts }: { counts: TaskProgressCounts }) {
  const items = [
    { label: 'Đã giao', value: counts.assigned },
    { label: 'Đang làm', value: counts.inProgress },
    { label: 'Chờ nghiệm thu', value: counts.pendingReview },
    { label: 'Hoàn thành', value: counts.done },
  ]
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl bg-muted/50 px-3 py-2">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="font-bold tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** FR-EVT-09: thanh tỉ lệ hoàn thành từng tiểu ban, số quá hạn; chỉ số đếm, không hiện nội dung việc. */
export function EventProgressTab({ clubId, eventId }: { clubId: string; eventId: string }) {
  const vm = useEventProgressViewModel(clubId, eventId)
  if (vm.loading) {
    return (
      <div className="space-y-4" role="status" aria-label="Đang tải tiến độ">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    )
  }
  if (vm.error || !vm.progress) return <ErrorState error={vm.error} onRetry={vm.refetch} />
  const { total, subcommittees } = vm.progress
  if (subcommittees.length === 0) return <EmptyState icon={ListChecks} title="Chưa có tiểu ban" description="Tiến độ tính theo việc của từng tiểu ban." />
  const overall = donePercent(total)
  return (
    <div className="space-y-4">
      <section aria-label="Tiến độ chung" className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-bold">Toàn sự kiện</h3>
          <p className="text-sm text-muted-foreground">{progressSummary(total)}</p>
        </div>
        {overall !== null && <ProgressBar value={total.done} max={total.total} label={`Hoàn thành ${overall}% việc của sự kiện`} tone="success" />}
        <CountRow counts={total} />
      </section>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {subcommittees.map((subcommittee) => {
          const percent = donePercent(subcommittee.counts)
          return (
            <li key={subcommittee.id} className="min-w-0 space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold">Tiểu ban {subcommittee.name}</h3>
                {subcommittee.counts.overdue > 0 && (
                  <Badge tone="danger">
                    <AlertTriangle aria-hidden className="mr-1 inline size-3" />
                    {subcommittee.counts.overdue} quá hạn
                  </Badge>
                )}
              </div>
              {percent !== null && (
                <ProgressBar value={subcommittee.counts.done} max={subcommittee.counts.total} label={`Tiểu ban ${subcommittee.name} hoàn thành ${percent}%`} tone="success" />
              )}
              <p className="text-sm text-muted-foreground">{progressSummary(subcommittee.counts)}</p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
