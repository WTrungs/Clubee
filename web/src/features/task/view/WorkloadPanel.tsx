import { UsersRound } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { Badge } from '@/shared/ui/Badge'
import { NativeSelect } from '@/shared/ui/Input'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { useWorkloadViewModel, workloadScopeKey } from '../viewModel/useWorkloadViewModel'

function Total({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums', tone === 'danger' && value > 0 && 'text-status-danger')}>{value}</p>
    </div>
  )
}

/** FR-TASK-08: số việc đang làm, quá hạn của từng người trong phạm vi; bảng ở màn rộng, thẻ ở màn hẹp. */
export function WorkloadPanel({ clubId, active }: { clubId: string; active: boolean }) {
  const vm = useWorkloadViewModel(clubId, active)
  if (vm.noScope) return <EmptyState icon={UsersRound} title="Bạn không quản lý ban hay sự kiện nào" />
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Đang làm là việc người đó làm chính còn mở (Mới giao, Đang làm, Chờ nghiệm thu); quá hạn là việc đang làm đã qua hạn. Việc của sự kiện đã đóng, đã hủy không tính.
        </p>
        {vm.scopes.length > 1 && (
          <NativeSelect aria-label="Phạm vi" value={vm.scopeKey} onChange={(event) => vm.setScopeKey(event.target.value)} className="sm:w-72">
            {vm.scopes.map((scope) => (
              <option key={workloadScopeKey(scope)} value={workloadScopeKey(scope)}>
                {scope.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>

      {vm.error ? (
        <ErrorState error={vm.error} onRetry={vm.retry} />
      ) : vm.loading ? (
        <Skeleton role="status" aria-label="Đang tải khối lượng việc" className="h-64 rounded-2xl" />
      ) : (
        <section aria-label={`Khối lượng việc: ${vm.scopeName}`} className={cn('space-y-4 transition-opacity', vm.stale && 'opacity-60')}>
          <div className="grid grid-cols-3 gap-3">
            <Total label="Việc đang làm" value={vm.summary.open} />
            <Total label="Việc quá hạn" value={vm.summary.overdue} tone="danger" />
            <Total label="Người có việc quá hạn" value={vm.summary.peopleOverdue} tone="danger" />
          </div>
          {vm.rows.length === 0 ? (
            <EmptyState icon={UsersRound} title="Chưa có ai trong phạm vi này" />
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-sm md:block">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Người</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Đang làm</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Quá hạn</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Phối hợp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {vm.rows.map((row) => (
                      <tr key={row.person.id}>
                        <td className="px-4 py-3">
                          <span className="flex flex-wrap items-center gap-1.5 font-semibold">
                            {row.person.fullName}
                            {row.onLeave && <Badge tone="neutral">Tạm nghỉ</Badge>}
                          </span>
                          {row.detail && <span className="block text-xs text-muted-foreground">{row.detail}</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{row.open}</td>
                        <td className={cn('px-4 py-3 text-right tabular-nums', row.overdue > 0 && 'font-semibold text-status-danger')}>{row.overdue}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.collaborating}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul aria-label="Khối lượng theo người" className="space-y-2 md:hidden">
                {vm.rows.map((row) => (
                  <li key={row.person.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                      {row.person.fullName}
                      {row.onLeave && <Badge tone="neutral">Tạm nghỉ</Badge>}
                    </p>
                    {row.detail && <p className="text-xs text-muted-foreground">{row.detail}</p>}
                    <p className="mt-2 text-sm">
                      Đang làm <span className="font-semibold tabular-nums">{row.open}</span> · Quá hạn{' '}
                      <span className={cn('font-semibold tabular-nums', row.overdue > 0 && 'text-status-danger')}>{row.overdue}</span> · Phối hợp{' '}
                      <span className="font-semibold tabular-nums">{row.collaborating}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  )
}
