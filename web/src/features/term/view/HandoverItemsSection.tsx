import { CheckCheck, CircleCheck, Info, ListChecks, TriangleAlert, UserRoundCheck, UserRoundCog } from 'lucide-react'
import { formatEventTime, eventStatusDisplay } from '@/features/event/viewModel/eventDisplay'
import { advanceStatusDisplay } from '@/features/finance/viewModel/advanceDisplay'
import { taskStatusDisplay } from '@/features/task/viewModel/taskDisplay'
import { formatDate, formatDateTime } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import { cn } from '@/shared/lib/cn'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { FilterChip, Pagination } from '@/shared/ui/ListControls'
import { ProgressBar } from '@/shared/ui/ProgressBar'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { Tabs, TabsBar } from '@/shared/ui/Tabs'
import type { Handover, HandoverItem } from '../model/handoverTypes'
import { canConfirmItem, canSubstituteItem, eventLeadText, handoverItemStatusDisplay, needsDecisionDialog, progressText, substituteText } from '../viewModel/handoverDisplay'
import { useHandoverItemsViewModel, type HandoverItemsViewModel } from '../viewModel/useHandoverItemsViewModel'
import { EventLeadDecisionDialog } from './EventLeadDecisionDialog'

function ItemFacts({ item }: { item: HandoverItem }) {
  if (item.fund) {
    return (
      <p className="text-sm text-muted-foreground">
        Số dư <span className="font-semibold text-foreground tabular-nums">{formatMoney(item.fund.balance)}</span>
        {' · '}
        {item.fund.pendingCount > 0 ? (
          <span className="font-medium text-status-warning">{item.fund.pendingCount} khoản chờ duyệt hoặc chờ ghi sổ</span>
        ) : (
          'Không có khoản chờ'
        )}
      </p>
    )
  }
  if (item.advance) {
    const advance = item.advance
    return (
      <div className="space-y-0.5 text-sm text-muted-foreground">
        <p>
          {advance.fundName} · {advanceStatusDisplay[advance.status].label} · Người ứng <span className="font-medium text-foreground">{advance.requester.fullName}</span>
        </p>
        <p>
          Tạm ứng <span className="tabular-nums">{formatMoney(advance.amount)}</span>
          {' · '}
          {advance.status === 'APPROVED' ? (
            'Chưa ứng tiền'
          ) : (
            <>
              Còn phải quyết toán <span className="font-semibold text-foreground tabular-nums">{formatMoney(advance.outstanding)}</span>
            </>
          )}
        </p>
        <p>
          Hạn quyết toán {formatDate(advance.settleBy)}
          {advance.overdue && <span className="font-medium text-status-danger"> · Quá hạn</span>}
        </p>
      </div>
    )
  }
  if (item.documents) {
    return (
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{item.documents.count} tài liệu</span> gắn {item.documents.termName}, xem ở trang Tài liệu.
      </p>
    )
  }
  if (item.event) {
    return (
      <div className="space-y-0.5 text-sm text-muted-foreground">
        <p>
          {eventStatusDisplay[item.event.status].label} · {formatEventTime(item.event)}
        </p>
        <p>
          Trưởng BTC: <span className="font-medium text-foreground">{item.event.lead?.fullName ?? 'chưa có'}</span>
          {item.event.openTaskCount > 0 && ` · ${item.event.openTaskCount} việc của tiểu ban chưa xong`}
        </p>
      </div>
    )
  }
  if (item.task) {
    return (
      <div className="space-y-0.5 text-sm text-muted-foreground">
        <p>
          Ban {item.task.departmentName} · {taskStatusDisplay[item.task.status].label}
        </p>
        <p>
          Người làm <span className="font-medium text-foreground">{item.task.owner.fullName}</span> · Người giao {item.task.assigner.fullName}
        </p>
        <p>
          Hạn {formatDateTime(item.task.dueAt)}
          {item.task.overdue && <span className="font-medium text-status-danger"> · Quá hạn</span>}
        </p>
      </div>
    )
  }
  return null
}

function ItemAction({ item, vm }: { item: HandoverItem; vm: HandoverItemsViewModel }) {
  if (!canConfirmItem(item)) return null
  const decision = needsDecisionDialog(item)
  const label = !decision ? 'Xác nhận' : item.status === 'CONFIRMED' ? 'Đổi quyết định' : 'Giữ hoặc thay Trưởng BTC'
  return (
    <Button
      variant={item.status === 'CONFIRMED' ? 'outline' : 'primary'}
      className="w-full sm:w-auto"
      loading={vm.isConfirming(item.id)}
      disabled={vm.locked}
      onClick={() => vm.confirmItem(item)}
      aria-label={`${label}: ${item.title}`}
    >
      {decision ? <UserRoundCog aria-hidden /> : <CircleCheck aria-hidden />}
      {label}
    </Button>
  )
}

function ItemRow({ item, vm }: { item: HandoverItem; vm: HandoverItemsViewModel }) {
  const status = handoverItemStatusDisplay[item.status]
  const choosable = vm.substituting && canSubstituteItem(item)
  const substitute = substituteText(item)
  return (
    <li className="flex gap-3 p-4">
      {vm.substituting && (
        <label className="-mt-3 -ml-3 flex size-11 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            aria-label={`Chọn để xác nhận thay: ${item.title}`}
            className="size-5 accent-primary"
            checked={vm.isChosen(item.id)}
            disabled={!choosable || vm.locked}
            onChange={() => vm.toggleChosen(item.id)}
          />
        </label>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold break-words">{item.title}</p>
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
          </div>
          <ItemFacts item={item} />
          {item.eventLead && (
            <p className="text-sm font-medium">
              {eventLeadText(item.eventLead)}
              <span className="font-normal text-muted-foreground"> (áp dụng khi bàn giao hoàn tất)</span>
            </p>
          )}
          {item.note && (
            <p
              className={cn(
                'flex items-start gap-2 rounded-lg p-2.5 text-sm',
                item.status === 'PENDING' ? 'bg-status-warning-soft font-medium text-status-warning' : 'bg-muted text-muted-foreground',
              )}
            >
              {item.status === 'PENDING' ? <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> : <Info aria-hidden className="mt-0.5 size-4 shrink-0" />}
              {item.note}
            </p>
          )}
          {substitute ? (
            <p className="flex items-start gap-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">
              <UserRoundCheck aria-hidden className="size-4 shrink-0" />
              <span>
                {substitute}
                {item.confirmedAt && ` · ${formatDateTime(item.confirmedAt)}`}
              </span>
            </p>
          ) : (
            item.confirmedBy &&
            item.confirmedAt && (
              <p className="text-xs text-muted-foreground">
                Xác nhận bởi {item.confirmedBy.fullName} · {formatDateTime(item.confirmedAt)}
              </p>
            )
          )}
        </div>
        {!vm.substituting && <ItemAction item={item} vm={vm} />}
      </div>
    </li>
  )
}

function ItemList({ vm }: { vm: HandoverItemsViewModel }) {
  if (vm.loading) {
    return (
      <div role="status" aria-label="Đang tải danh mục bàn giao" className="space-y-2">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    )
  }
  if (vm.error) return <ErrorState error={vm.error} onRetry={vm.refetch} />
  if (vm.items.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title={vm.status === '' ? `Không có mục ${vm.kindLabel.toLowerCase()} nào` : 'Không có mục nào ở trạng thái này'}
        description={vm.status === '' ? 'Danh mục tự cập nhật theo dữ liệu hiện tại của CLB.' : 'Chọn bộ lọc khác để xem các mục còn lại.'}
      />
    )
  }
  return (
    <ul aria-label={`Mục bàn giao: ${vm.kindLabel}`} className="divide-y rounded-xl border">
      {vm.items.map((item) => (
        <ItemRow key={item.id} item={item} vm={vm} />
      ))}
    </ul>
  )
}

function BatchBar({ vm }: { vm: HandoverItemsViewModel }) {
  if (!vm.canConfirm || vm.batch.length === 0) return null
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-muted p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm">
        <span className="font-semibold">{vm.batch.length} mục</span> chờ xác nhận ở trang này
        {vm.batchSkipped > 0 && `; ${vm.batchSkipped} sự kiện cần chọn Trưởng BTC nên xác nhận riêng`}.
      </p>
      <Button variant="outline" className="w-full sm:w-auto" disabled={vm.locked} onClick={vm.openBatch}>
        <CheckCheck aria-hidden />
        Xác nhận các mục đang hiện
      </Button>
    </div>
  )
}

/** FR-TERM-07: ban chủ nhiệm hiện tại chọn các mục đang chờ rồi xác nhận thay, kèm lý do. */
function SubstituteBar({ vm }: { vm: HandoverItemsViewModel }) {
  if (!vm.canSubstitute || (!vm.substituting && !vm.hasPending)) return null
  if (!vm.substituting) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Người được bầu không nhận được bàn giao từ người cũ? Ban chủ nhiệm hiện tại xác nhận thay các mục đang chờ, kèm lý do.</p>
        <Button variant="outline" className="w-full shrink-0 sm:w-auto" onClick={vm.startSubstitute}>
          <UserRoundCheck aria-hidden />
          Xác nhận thay
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-3 rounded-xl bg-muted p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          <span className="font-semibold">Đã chọn {vm.chosenCount}</span>/{vm.substitutableCount} mục đang chờ ở trang này.
        </p>
        {vm.substitutableCount > 0 && (
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="size-4 accent-primary" checked={vm.allChosen} disabled={vm.locked} onChange={vm.toggleAllChosen} />
            Chọn tất cả đang hiện
          </label>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="w-full sm:w-auto" disabled={vm.chosenCount === 0 || vm.locked} onClick={vm.openSubstituteDialog}>
          <CheckCheck aria-hidden />
          {vm.chosenCount > 0 ? `Xác nhận thay ${vm.chosenCount} mục` : 'Xác nhận thay'}
        </Button>
        <Button variant="ghost" className="w-full sm:w-auto" disabled={vm.substitutePending} onClick={vm.cancelSubstitute}>
          Thôi
        </Button>
      </div>
    </div>
  )
}

/** FR-TERM-04, 05: danh mục bàn giao theo loại, người được bầu vào ban chủ nhiệm mới xác nhận từng mục. */
export function HandoverItemsSection({ handover }: { handover: Handover }) {
  const vm = useHandoverItemsViewModel(handover)
  const progress = { pending: handover.counts.pending, confirmed: handover.counts.confirmed }
  const open = handover.status === 'OPEN'

  return (
    <section aria-labelledby="handover-items-title" className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="space-y-1">
        <h2 id="handover-items-title" className="text-base font-bold">
          Danh mục bàn giao
        </h2>
        <p className="text-sm text-muted-foreground">
          {!open
            ? 'Danh mục giữ nguyên như lúc bàn giao hoàn tất.'
            : vm.canConfirm
              ? 'Xem từng mục rồi xác nhận đã nhận bàn giao. Mục đổi sau khi xác nhận sẽ quay về Chờ xác nhận.'
              : 'Người được bầu Chủ nhiệm, Phó chủ nhiệm, Thủ quỹ mới xác nhận từng mục. Mục đổi sau khi xác nhận sẽ quay về Chờ xác nhận.'}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{progressText(progress)}</p>
        <ProgressBar value={progress.confirmed} max={progress.pending + progress.confirmed} label="Tiến độ xác nhận bàn giao" tone="success" />
      </div>

      <Tabs value={vm.kind} onValueChange={vm.setKind}>
        <TabsBar items={vm.kindTabs} active={vm.kind} aria-label="Loại mục bàn giao (số mục chờ xác nhận)" />
      </Tabs>

      <div role="group" aria-label="Lọc theo trạng thái" className="flex flex-wrap gap-2">
        {vm.statusFilters.map((filter) => (
          <FilterChip key={filter.value || 'ALL'} label={filter.label} count={filter.count} selected={vm.status === filter.value} onToggle={() => vm.setStatus(filter.value)} />
        ))}
      </div>

      <div role="status" aria-atomic="true">
        {vm.notice && (
          <p
            className={cn(
              'flex items-start gap-2 rounded-xl p-3 text-sm font-medium',
              vm.notice.tone === 'warning' ? 'bg-status-warning-soft text-status-warning' : 'bg-status-danger-soft text-status-danger',
            )}
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {vm.notice.message}
          </p>
        )}
      </div>

      {open && <SubstituteBar vm={vm} />}
      {!vm.substituting && <BatchBar vm={vm} />}
      <ItemList vm={vm} />
      <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />

      <ConfirmDialog
        open={vm.batchOpen}
        onOpenChange={(next) => !next && vm.closeBatch()}
        title="Xác nhận các mục đang hiện"
        description={`Xác nhận đã nhận bàn giao ${vm.batch.length} mục ${vm.kindLabel.toLowerCase()} đang hiện ở trang này. Mục nào đổi sau khi xác nhận sẽ quay về Chờ xác nhận.`}
        confirmLabel={`Xác nhận ${vm.batch.length} mục`}
        pending={vm.batchPending}
        onConfirm={vm.confirmBatch}
      />
      <EventLeadDecisionDialog items={vm} />
      <ReasonDialog
        open={vm.substituteOpen}
        onOpenChange={(next) => !next && vm.closeSubstituteDialog()}
        title={`Xác nhận thay ${vm.chosenCount} mục`}
        description={`Mục được ghi Đã xác nhận kèm tên bạn và lý do; sự kiện giữ Trưởng BTC hiện tại.${vm.hasNewBoard ? ' Người được bầu vào ban chủ nhiệm mới được báo.' : ''}`}
        label="Lý do xác nhận thay"
        placeholder="Ví dụ: Thủ quỹ cũ đã rời CLB, không liên lạc được."
        confirmLabel="Xác nhận thay"
        pending={vm.substitutePending}
        onConfirm={vm.submitSubstitute}
      />
    </section>
  )
}
