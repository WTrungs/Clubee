import { ChevronDown, ScrollText } from 'lucide-react'
import { formatDateTime } from '@/shared/format/formatDate'
import { cn } from '@/shared/lib/cn'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, NativeSelect } from '@/shared/ui/Input'
import { Pagination } from '@/shared/ui/ListControls'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { AuditLogEntry } from '../model/auditLogTypes'
import { AUDIT_OBJECT_TYPES, auditActionLabel, auditChanges, auditObjectTypeLabel } from '../viewModel/auditDisplay'
import { useAuditLogViewModel, type AuditLogViewModel } from '../viewModel/useAuditLogViewModel'
import { ExportMenu } from '@/shared/ui/ExportMenu'

function Filters({ vm }: { vm: AuditLogViewModel }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-start">
      <FormField label="Người làm" className="sm:w-56" error={vm.actorsError ? 'Không tải được danh sách người làm.' : undefined}>
        <NativeSelect value={vm.actorId} onChange={(event) => vm.setActorId(event.target.value)} disabled={vm.actorsLoading && vm.actorId !== ''}>
          <option value="">{vm.actorsLoading && vm.actorId !== '' ? 'Đang tải…' : 'Tất cả'}</option>
          {vm.actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.fullName}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="Loại đối tượng" className="sm:w-56">
        <NativeSelect value={vm.objectType} onChange={(event) => vm.setObjectType(event.target.value)}>
          <option value="">Tất cả</option>
          {AUDIT_OBJECT_TYPES.map((type) => (
            <option key={type} value={type}>
              {auditObjectTypeLabel[type]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="Từ ngày" className="sm:w-36" error={vm.rangeError?.field === 'from' ? vm.rangeError.message : undefined}>
        <Input inputMode="numeric" placeholder="dd/mm/yyyy" value={vm.fromText} onChange={(event) => vm.setFromText(event.target.value)} />
      </FormField>
      <FormField label="Đến ngày" className="sm:w-36" error={vm.rangeError?.field === 'to' ? vm.rangeError.message : undefined}>
        <Input inputMode="numeric" placeholder="dd/mm/yyyy" value={vm.toText} onChange={(event) => vm.setToText(event.target.value)} />
      </FormField>
      <div className="flex flex-wrap gap-2 sm:mt-7">
        <Button onClick={vm.applyRange}>Lọc theo ngày</Button>
        {vm.filtered && (
          <Button variant="ghost" onClick={vm.clearFilters}>
            Bỏ lọc
          </Button>
        )}
        <ExportMenu onExport={vm.exportLog} pending={vm.exporting} label="Xuất nhật ký" />
      </div>
    </div>
  )
}

function Entry({ entry, open, onToggle }: { entry: AuditLogEntry; open: boolean; onToggle: () => void }) {
  const changes = auditChanges(entry)
  const panelId = `audit-${entry.id}`
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="flex w-full items-start gap-3 p-4 text-left hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{auditActionLabel(entry.action)}</span>
            <Badge tone="neutral">{auditObjectTypeLabel[entry.objectType]}</Badge>
          </span>
          <span className="block text-sm [overflow-wrap:anywhere]">{entry.objectLabel}</span>
          <span className="block text-xs text-muted-foreground">
            {entry.actor.fullName} · {formatDateTime(entry.at)}
          </span>
        </span>
        <ChevronDown aria-hidden className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div id={panelId} className="space-y-3 border-t bg-muted/30 px-4 py-3 text-sm">
          {changes.length === 0 ? (
            <p className="text-muted-foreground">Thao tác này không đổi trường dữ liệu nào.</p>
          ) : (
            <dl className="space-y-2">
              {changes.map((change) => (
                <div key={change.field} className="grid gap-1 sm:grid-cols-[10rem_1fr]">
                  <dt className="text-muted-foreground">{change.label}</dt>
                  <dd className="[overflow-wrap:anywhere]">
                    <span className="text-muted-foreground">{change.before}</span>
                    <span aria-hidden> → </span>
                    <span className="sr-only"> đổi thành </span>
                    <span className="font-semibold">{change.after}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="[overflow-wrap:anywhere]">
            <span className="text-muted-foreground">Lý do: </span>
            {entry.reason ?? 'Không ghi lý do'}
          </p>
        </div>
      )}
    </li>
  )
}

/** FR-RPT-06: chỉ xem; mỗi dòng mở ra từng trường trước → sau và lý do. */
export function AuditLogPanel({ clubId }: { clubId: string }) {
  const vm = useAuditLogViewModel(clubId)
  return (
    <div className="space-y-5">
      <Filters vm={vm} />
      {vm.invalidReasons ? (
        <FormAlert message={vm.invalidReasons.join(' ')} />
      ) : vm.loading ? (
        <div role="status" aria-label="Đang tải nhật ký">
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : vm.error ? (
        <ErrorState error={vm.error} onRetry={vm.refetch} />
      ) : vm.rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="Không có dòng nhật ký nào" description={vm.filtered ? 'Thử bỏ bớt điều kiện lọc.' : 'Thao tác quan trọng trong CLB sẽ được ghi ở đây.'} />
      ) : (
        <div aria-busy={vm.refreshing} className={cn('space-y-4 transition-opacity', vm.refreshing && 'opacity-70')}>
          <p className="text-sm text-muted-foreground">
            {vm.totalElements} dòng, mới nhất trước. Nhật ký chỉ ghi thêm, không sửa hay xóa được.
          </p>
          <ul aria-label="Nhật ký thao tác" className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
            {vm.rows.map((entry) => (
              <Entry key={entry.id} entry={entry} open={vm.expanded === entry.id} onToggle={() => vm.toggle(entry.id)} />
            ))}
          </ul>
          <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />
        </div>
      )}
    </div>
  )
}
