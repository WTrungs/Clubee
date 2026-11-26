import { Megaphone, Pin, PinOff } from 'lucide-react'
import { formatDateTime } from '@/shared/format/formatDate'
import { Avatar } from '@/shared/ui/Avatar'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Pagination } from '@/shared/ui/ListControls'
import { ProgressBar } from '@/shared/ui/ProgressBar'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { Tabs, TabsBar } from '@/shared/ui/Tabs'
import { readSummary, useSentAnnouncementsViewModel } from '../viewModel/useSentAnnouncementsViewModel'

/** FR-NOT-05: thông báo tôi đã gửi; mở ra xem ai đã đọc, ai chưa, ghim hoặc bỏ ghim. */
export function SentAnnouncementsPanel() {
  const vm = useSentAnnouncementsViewModel()
  const opened = vm.opened
  return (
    <div className="mt-4">
      <section className="rounded-2xl border bg-card p-2 shadow-sm">
        {vm.loading && <Skeleton role="status" aria-label="Đang tải thông báo đã gửi" className="m-2 h-24" />}
        {vm.error && <ErrorState error={vm.error} onRetry={vm.retry} className="border-0" />}
        {!vm.loading && !vm.error && vm.items.length === 0 && <EmptyState icon={Megaphone} title="Bạn chưa gửi thông báo nào" className="border-0" />}
        {vm.items.length > 0 && (
          <ul className="divide-y" aria-label="Thông báo đã gửi">
            {vm.items.map((item) => (
              <li key={item.id} className="py-1">
                <button type="button" onClick={() => vm.open(item)} className="flex w-full flex-col gap-2 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted">
                  <span className="flex min-w-0 items-start gap-2">
                    {item.pinned && <Pin aria-label="Đã ghim" className="mt-0.5 size-4 shrink-0 text-primary" />}
                    <span className="min-w-0 text-sm font-semibold break-words">{item.title}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.clubName} · {item.audienceLabel} · {formatDateTime(item.createdAt)}
                  </span>
                  <span className="flex items-center gap-3">
                    <ProgressBar value={item.readCount} max={Math.max(item.recipientCount, 1)} label={readSummary(item)} className="flex-1" />
                    <span className="shrink-0 text-xs font-semibold tabular-nums">{readSummary(item)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Pagination className="mt-4" page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />

      <Sheet open={opened !== null} onOpenChange={(open) => !open && vm.close()}>
        <SheetContent
          title={opened?.title ?? 'Thông báo đã gửi'}
          description={opened ? `${opened.clubName} · ${opened.audienceLabel} · ${formatDateTime(opened.createdAt)}` : undefined}
          footer={
            opened && (
              <Button variant={opened.pinned ? 'outline' : 'primary'} onClick={vm.togglePin} loading={vm.pinning}>
                {opened.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
                {opened.pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}
              </Button>
            )
          }
        >
          {opened && (
            <div className="space-y-4 p-5">
              <div className="space-y-2">
                <p className="flex items-center justify-between text-sm font-semibold">
                  <span>{readSummary(opened)}</span>
                  {opened.pinned && <Badge tone="info">Đang ghim</Badge>}
                </p>
                <ProgressBar value={opened.readCount} max={Math.max(opened.recipientCount, 1)} label={readSummary(opened)} />
              </div>
              <Tabs value={vm.readTab} onValueChange={vm.setReadTab}>
                <TabsBar
                  aria-label="Người nhận"
                  active={vm.readTab}
                  items={[
                    { value: 'read', label: 'Đã đọc', count: opened.readCount },
                    { value: 'unread', label: 'Chưa đọc', count: opened.recipientCount - opened.readCount },
                  ]}
                />
              </Tabs>
              {vm.receiptsError ? (
                <ErrorState error={vm.receiptsError} />
              ) : vm.receiptsLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : vm.receipts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{vm.readTab === 'read' ? 'Chưa ai đọc.' : 'Mọi người đã đọc.'}</p>
              ) : (
                <ul className="space-y-2" aria-label={vm.readTab === 'read' ? 'Người đã đọc' : 'Người chưa đọc'}>
                  {vm.receipts.map((receipt) => (
                    <li key={receipt.person.id} className="flex items-center gap-2.5 text-sm">
                      <Avatar name={receipt.person.fullName} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{receipt.person.fullName}</span>
                      {receipt.readAt && <span className="text-xs text-muted-foreground">{formatDateTime(receipt.readAt)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
