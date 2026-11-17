import { motion } from 'motion/react'
import { Ban, Copy, Inbox, Link2, Mail, Send } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { formatDateTime } from '@/shared/format/formatDate'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input } from '@/shared/ui/Input'
import { FilterChip, Pagination } from '@/shared/ui/ListControls'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { Invitation } from '../model/invitationTypes'
import { INVITATION_FILTERS, invitationStateLine, invitationStatusDisplay, invitationTitle, invitationUrl, useCountLabel } from '../viewModel/invitationDisplay'
import { INVITATION_EMAIL_MAX } from '../viewModel/invitationSchema'
import { useInvitationsViewModel, type InvitationsViewModel } from '../viewModel/useInvitationsViewModel'

function CreatePanel({ vm }: { vm: InvitationsViewModel }) {
  const formId = useId()
  const errors = vm.emailForm.formState.errors
  return (
    <section aria-labelledby={`${formId}-title`} className="space-y-4">
      <h3 id={`${formId}-title`} className="text-sm font-bold">
        Tạo lời mời
      </h3>
      <div className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Link2 aria-hidden className="size-4 text-muted-foreground" />
            Liên kết mời
          </p>
          <p className="text-xs text-muted-foreground">Ai có liên kết đều mở được tới khi hết hạn. Hợp với nhóm chat của lớp, khoa.</p>
        </div>
        <Button variant="outline" onClick={vm.createLink} loading={vm.creatingKind === 'LINK'} disabled={vm.creating}>
          Tạo liên kết
        </Button>
      </div>
      <form id={formId} noValidate onSubmit={vm.submitEmail} className="space-y-3 rounded-2xl border p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Mail aria-hidden className="size-4 text-muted-foreground" />
          Mời qua email
        </p>
        <FormField label="Email người được mời" error={errors.email?.message} hint="Chỉ tài khoản có đúng email này mở được, và chỉ dùng một lần.">
          <Input type="email" inputMode="email" autoComplete="off" maxLength={INVITATION_EMAIL_MAX} placeholder="ten@vidu.com" {...vm.emailForm.register('email')} />
        </FormField>
        <div className="flex justify-end">
          <Button type="submit" loading={vm.creatingKind === 'EMAIL'} disabled={vm.creating}>
            <Send aria-hidden />
            Gửi lời mời
          </Button>
        </div>
      </form>
      <FormAlert message={vm.createError} />
      {vm.created && (
        <div role="status" className="space-y-2 rounded-2xl bg-status-success-soft p-4">
          <p className="text-sm font-semibold text-status-success">
            {vm.created.kind === 'EMAIL' ? `Đã mời ${vm.created.email ?? ''}` : 'Liên kết mới'} · hết hạn {formatDateTime(vm.created.expiresAt)}
          </p>
          <p className="text-sm break-all">{invitationUrl(vm.created.token)}</p>
          <Button size="sm" variant="outline" onClick={() => void vm.copy(vm.created?.token ?? '', 'created')}>
            <Copy aria-hidden />
            Sao chép liên kết
          </Button>
          <CopyFallbackField url={vm.copyFallbackFor('created', vm.created.token)} />
        </div>
      )}
    </section>
  )
}

function InvitationItem({ invitation, vm }: { invitation: Invitation; vm: InvitationsViewModel }) {
  const display = invitationStatusDisplay[invitation.status]
  const Icon = invitation.kind === 'EMAIL' ? Mail : Link2
  const uses = useCountLabel(invitation)
  const active = invitation.status === 'ACTIVE'
  return (
    <motion.li variants={itemVariants} className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-sm font-semibold">{invitationTitle(invitation)}</p>
          <p className="text-xs text-muted-foreground">{invitationStateLine(invitation)}</p>
          <p className="text-xs text-muted-foreground">
            Tạo bởi {invitation.createdBy.fullName} lúc {formatDateTime(invitation.createdAt)}
            {uses && ` · ${uses}`}
          </p>
        </div>
        <Badge tone={display.tone}>{display.label}</Badge>
      </div>
      {(active || invitation.allowedActions.includes('REVOKE')) && (
        <div className="flex flex-wrap justify-end gap-2">
          {active && (
            <Button size="sm" variant="outline" onClick={() => void vm.copy(invitation.token, 'list')}>
              <Copy aria-hidden />
              Sao chép
            </Button>
          )}
          {invitation.allowedActions.includes('REVOKE') && (
            <Button size="sm" variant="ghost" className="text-destructive" disabled={vm.revokePending} onClick={() => vm.askRevoke(invitation)}>
              <Ban aria-hidden />
              Thu hồi
            </Button>
          )}
        </div>
      )}
      <CopyFallbackField url={vm.copyFallbackFor('list', invitation.token)} />
    </motion.li>
  )
}

/** Hiện ngay dưới nút vừa bấm và tự chọn sẵn liên kết; focus làm trình duyệt cuộn tới ô ở màn hẹp. */
function CopyFallbackField({ url }: { url: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (url) inputRef.current?.focus()
  }, [url])
  if (!url) return null
  return (
    <FormField label="Liên kết mời" hint="Trình duyệt không cho sao chép tự động. Liên kết đã được chọn sẵn, hãy sao chép.">
      <Input ref={inputRef} readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
    </FormField>
  )
}

function InvitationList({ vm }: { vm: InvitationsViewModel }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="space-y-4">
      <h3 id={titleId} className="text-sm font-bold">
        Lời mời đã tạo
      </h3>
      <div role="group" aria-label="Lọc lời mời" className="flex flex-wrap gap-2">
        {INVITATION_FILTERS.map((filter) => (
          <FilterChip key={filter.value || 'all'} label={filter.label} selected={vm.status === filter.value} onToggle={() => vm.setStatus(filter.value)} />
        ))}
      </div>
      <ConflictBanner show={vm.conflict} onReload={vm.reloadAfterConflict} message="Lời mời vừa được người khác thay đổi. Tải lại danh sách rồi thử lại." />
      {vm.loading && (
        <div className="space-y-3" role="status" aria-label="Đang tải lời mời">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      )}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {!vm.loading && !vm.error && vm.invitations.length === 0 && (
        <EmptyState icon={Inbox} title={vm.status ? 'Không có lời mời phù hợp' : 'Chưa có lời mời nào'} description="Tạo liên kết hoặc mời qua email ở phía trên." />
      )}
      {!vm.error && vm.invitations.length > 0 && (
        <motion.ul variants={listVariants} initial="initial" animate="animate" key={`${vm.status}-${vm.page}`} className="space-y-3">
          {vm.invitations.map((invitation) => (
            <InvitationItem key={invitation.id} invitation={invitation} vm={vm} />
          ))}
        </motion.ul>
      )}
      {!vm.error && <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />}
    </section>
  )
}

/** FR-MEM-01: chỉ mở khi máy chủ trả `MANAGE_MEMBERS`; người nhận lời mời vẫn gửi yêu cầu để duyệt. */
export function InvitationsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const vm = useInvitationsViewModel(open)
  const close = () => {
    vm.reset()
    onClose()
  }
  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()}>
      {open && (
        <SheetContent title="Mời thành viên" description={`CLB hiện hành: ${vm.clubName}. Người nhận lời mời vẫn gửi yêu cầu để ban chủ nhiệm duyệt.`}>
          <div className="space-y-8 p-5">
            <CreatePanel vm={vm} />
            <InvitationList vm={vm} />
          </div>
          <ConfirmDialog
            open={vm.revoking !== null}
            onOpenChange={(next) => !next && vm.cancelRevoke()}
            title="Thu hồi lời mời"
            description={`${vm.revoking ? invitationTitle(vm.revoking) : ''} sẽ không mở được nữa. Yêu cầu đã gửi bằng lời mời này vẫn giữ nguyên.`}
            confirmLabel="Thu hồi"
            confirmVariant="destructive"
            pending={vm.revokePending}
            onConfirm={vm.confirmRevoke}
          />
        </SheetContent>
      )}
    </Sheet>
  )
}
