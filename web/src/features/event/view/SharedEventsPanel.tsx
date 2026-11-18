import { CalendarClock, Check, Handshake, X } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { formatDateTime, formatTimeRange } from '@/shared/format/formatDate'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { SharedEvent } from '../model/eventTypes'
import { coHostStatusDisplay } from '../viewModel/eventDisplay'
import type { CoHostInvitationsViewModel } from '../viewModel/useCoHostInvitationsViewModel'

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const headingId = useId()
  if (count === 0) return null
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="text-sm font-bold text-muted-foreground">
        {title} ({count})
      </h2>
      <ul className="grid gap-4 md:grid-cols-2">{children}</ul>
    </section>
  )
}

function SharedEventCard({ item, actions }: { item: SharedEvent; actions?: ReactNode }) {
  const status = coHostStatusDisplay[item.status]
  const note =
    item.status === 'DECLINED'
      ? `Lý do từ chối: ${item.decisionNote ?? ''}`
      : item.status === 'REMOVED'
        ? `Lý do gỡ: ${item.removeReason ?? ''}`
        : item.status === 'ACCEPTED'
          ? `${item.staffCount} thành viên CLB bạn trong ban tổ chức`
          : item.allowedActions.length > 0
            ? null
            : ['CANCELLED', 'CLOSED'].includes(item.event.status)
              ? 'Sự kiện đã hủy hoặc đã đóng nên lời mời không trả lời được nữa.'
              : 'Bạn không có quyền trả lời lời mời đồng tổ chức.'
  return (
    <li className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="space-y-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-base font-bold">{item.event.name}</span>
          <Badge tone={status.tone}>{status.invitationLabel}</Badge>
        </p>
        <p className="text-sm text-muted-foreground">Chủ trì: {item.event.clubName}</p>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarClock aria-hidden className="size-4 shrink-0" />
          {formatTimeRange(item.event.startAt, item.event.endAt)}
        </p>
      </div>
      {item.message && <p className="rounded-xl bg-muted/60 p-3 text-sm">“{item.message}”</p>}
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      <p className="text-xs text-muted-foreground">
        {item.invitedBy.fullName} mời lúc {formatDateTime(item.invitedAt)}
        {item.decidedBy && item.decidedAt ? ` · ${item.decidedBy.fullName} trả lời lúc ${formatDateTime(item.decidedAt)}` : ''}
      </p>
      {actions}
    </li>
  )
}

/** Tab Sự kiện chung (FR-EVT-08): lời mời đồng tổ chức gửi tới CLB và các sự kiện CLB đang cùng tổ chức. */
export function SharedEventsPanel({ vm }: { vm: CoHostInvitationsViewModel }) {
  if (vm.loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2" role="status" aria-label="Đang tải sự kiện chung">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    )
  }
  if (vm.error) return <ErrorState error={vm.error} onRetry={vm.refetch} />
  if (vm.total === 0) {
    return <EmptyState icon={Handshake} title="Chưa có sự kiện chung" description="Khi CLB khác mời cùng tổ chức sự kiện, lời mời hiện ở đây để ban chủ nhiệm trả lời." />
  }
  return (
    <div className="space-y-6">
      <Group title="Chờ trả lời" count={vm.pending.length}>
        {vm.pending.map((item) => (
          <SharedEventCard
            key={item.id}
            item={item}
            actions={
              item.allowedActions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => vm.accept(item)}
                    loading={vm.acceptingId === item.id}
                    disabled={vm.busy}
                    aria-label={`Chấp nhận đồng tổ chức ${item.event.name}`}
                  >
                    <Check aria-hidden />
                    Chấp nhận
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => vm.openDecline(item)} disabled={vm.busy} aria-label={`Từ chối đồng tổ chức ${item.event.name}`}>
                    <X aria-hidden />
                    Từ chối
                  </Button>
                </div>
              )
            }
          />
        ))}
      </Group>
      <Group title="Đang đồng tổ chức" count={vm.active.length}>
        {vm.active.map((item) => (
          <SharedEventCard key={item.id} item={item} />
        ))}
      </Group>
      <Group title="Lịch sử" count={vm.past.length}>
        {vm.past.map((item) => (
          <SharedEventCard key={item.id} item={item} />
        ))}
      </Group>

      <ReasonDialog
        open={vm.declineTarget !== null}
        onOpenChange={(open) => !open && vm.closeDecline()}
        title={`Từ chối đồng tổ chức ${vm.declineTarget?.event.name ?? ''}`}
        description={`${vm.declineTarget?.event.clubName ?? ''} nhận thông báo kèm lý do. Lời mời đã từ chối không nhận lại được; CLB đó phải gửi lời mời mới.`}
        confirmLabel="Từ chối lời mời"
        dismissLabel="Quay lại"
        confirmVariant="destructive"
        pending={vm.declining}
        onConfirm={vm.confirmDecline}
      />
    </div>
  )
}
