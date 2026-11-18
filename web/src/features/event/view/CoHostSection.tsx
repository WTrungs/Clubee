import { Building2, Check, Handshake, Send } from 'lucide-react'
import { useId } from 'react'
import { formatDateTime } from '@/shared/format/formatDate'
import { cn } from '@/shared/lib/cn'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Textarea } from '@/shared/ui/Input'
import { SearchInput } from '@/shared/ui/ListControls'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import { coHostNote, coHostStatusDisplay } from '../viewModel/eventDisplay'
import { COHOST_MESSAGE_MAX, type CoHostsViewModel } from '../viewModel/useCoHostsViewModel'

/** FR-EVT-08: tìm CLB trong danh bạ chung rồi gửi lời mời; ban chủ nhiệm CLB đó trả lời ở tab Sự kiện chung. */
function InviteCoHostSheet({ vm, eventName }: { vm: CoHostsViewModel; eventName: string }) {
  const listLabelId = useId()
  return (
    <Sheet open={vm.inviteOpen} onOpenChange={(next) => !next && vm.closeInvite()}>
      <SheetContent
        title="Mời CLB đồng tổ chức"
        description={`Ban chủ nhiệm CLB được mời nhận thông báo và trả lời. Quỹ ${eventName} vẫn thuộc CLB của bạn.`}
        footer={
          <>
            <Button variant="ghost" onClick={vm.closeInvite} disabled={vm.inviting}>
              Hủy bỏ
            </Button>
            <Button onClick={vm.submitInvite} loading={vm.inviting} disabled={!vm.selected || vm.messageError !== null}>
              <Send aria-hidden />
              Gửi lời mời
            </Button>
          </>
        }
      >
        <div className="space-y-5 p-5">
          <div className="space-y-2">
            <p id={listLabelId} className="text-sm font-semibold">
              Chọn CLB
              <span aria-hidden className="ml-0.5 text-destructive">
                *
              </span>
            </p>
            <SearchInput label="Tìm CLB" placeholder="Tìm theo tên, lĩnh vực…" value={vm.keyword} onValueChange={vm.setKeyword} />
            {vm.optionsError ? (
              <FormAlert message={vm.optionsError} />
            ) : vm.optionsLoading ? (
              <div className="space-y-2" role="status" aria-label="Đang tải danh bạ CLB">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : (
              <ul aria-labelledby={listLabelId} className="max-h-72 space-y-1.5 overflow-y-auto">
                {vm.options.map((option) => {
                  const chosen = vm.selected?.id === option.id
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        aria-pressed={chosen}
                        disabled={option.blockedReason !== null}
                        onClick={() => vm.select({ id: option.id, name: option.name })}
                        className={cn(
                          'flex min-h-12 w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent',
                          chosen && 'border-primary bg-primary/5',
                        )}
                      >
                        <Building2 aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{option.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{option.blockedReason ?? option.field}</span>
                        </span>
                        {chosen && <Check aria-hidden className="size-4 shrink-0 text-primary" />}
                      </button>
                    </li>
                  )
                })}
                {vm.options.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Không tìm thấy CLB phù hợp.</li>}
              </ul>
            )}
          </div>
          <FormField label="Lời nhắn" error={vm.messageError ?? undefined} hint="Không bắt buộc. Ví dụ: phần việc mong CLB đó đảm nhận.">
            <Textarea rows={3} maxLength={COHOST_MESSAGE_MAX + 1} value={vm.message} onChange={(event) => vm.setMessage(event.target.value)} />
          </FormField>
          <FormAlert message={vm.inviteError} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** Khối CLB đồng tổ chức ở tab Ban tổ chức: trạng thái theo ST-COH, số nhân sự, mời và gỡ. */
export function CoHostSection({ vm, canManage, eventName }: { vm: CoHostsViewModel; canManage: boolean; eventName: string }) {
  const headingId = useId()
  // Không có lời mời nào và người xem không mời được thì khối này không có gì để nói.
  if (!vm.loading && !vm.error && vm.coHosts.length === 0 && !canManage) return null
  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={headingId} className="flex items-center gap-2 text-base font-bold">
          <Handshake aria-hidden className="size-4 text-primary" />
          CLB đồng tổ chức
        </h3>
        {canManage && (
          <Button variant="outline" size="sm" onClick={vm.openInvite}>
            <Send aria-hidden />
            Mời CLB
          </Button>
        )}
      </div>
      {vm.loading && <Skeleton className="h-14 w-full" />}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {!vm.loading && !vm.error && vm.coHosts.length === 0 && (
        <p className="text-sm text-muted-foreground">Chưa mời CLB nào. CLB đồng tổ chức góp nhân sự vào tiểu ban, quỹ vẫn thuộc CLB chủ trì.</p>
      )}
      {vm.coHosts.length > 0 && (
        <ul className="divide-y">
          {vm.coHosts.map((coHost) => {
            const status = coHostStatusDisplay[coHost.status]
            return (
              <li key={coHost.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{coHost.club.name}</span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </p>
                  <p className="text-sm text-muted-foreground">{coHostNote(coHost)}</p>
                  <p className="text-xs text-muted-foreground">
                    {coHost.invitedBy.fullName} mời lúc {formatDateTime(coHost.invitedAt)}
                  </p>
                </div>
                {coHost.allowedActions.includes('REMOVE') && (
                  <Button variant="ghost" size="sm" onClick={() => vm.openRemove(coHost)} aria-label={`Gỡ ${coHost.club.name} khỏi ban tổ chức`}>
                    Gỡ
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {canManage && <InviteCoHostSheet vm={vm} eventName={eventName} />}
      <ReasonDialog
        open={vm.removeTarget !== null}
        onOpenChange={(open) => !open && vm.closeRemove()}
        title={`Gỡ ${vm.removeTarget?.club.name ?? ''}`}
        description={`${vm.removeTarget?.staffCount ?? 0} nhân sự của CLB này rời ban tổ chức ngay, chức trưởng tiểu ban của họ kết thúc. Việc họ đã làm vẫn giữ nguyên.`}
        confirmLabel="Gỡ CLB"
        confirmVariant="destructive"
        pending={vm.removing}
        onConfirm={vm.confirmRemove}
      />
    </section>
  )
}
