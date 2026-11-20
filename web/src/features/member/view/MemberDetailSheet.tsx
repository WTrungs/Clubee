import { ArrowRight, ArrowRightLeft, History, Inbox, LogOut, Mail, NotebookPen, PencilLine, Phone } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { formatDate, formatDateTime } from '@/shared/format/formatDate'
import { Button } from '@/shared/ui/Button'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import { MemberPositions } from '@/features/org/view/MemberPositions'
import type { MemberDetail } from '../model/memberTypes'
import { describeInfoChange, exitKindLabel, memberActionDisplay, memberStatusDisplay, memberSubtitle, stintRange } from '../viewModel/memberDisplay'
import { useMemberDetailViewModel } from '../viewModel/useMemberDetailViewModel'
import { MemberInfoSheet } from './MemberInfoSheet'
import { MemberStatusBadge } from './MemberTable'
import { PastMemberships } from './PastMemberships'
import { TransferDepartmentDialog } from './TransferDepartmentDialog'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof History; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <Icon aria-hidden className="size-4 text-muted-foreground" />
        {title}
      </h3>
      {children}
    </section>
  )
}

interface MemberBodyProps {
  member: MemberDetail
  onOpenBacklog?: (formerMemberId: string) => void
  /** Chỉ truyền khi máy chủ cho phép; nút nằm cạnh phần thông tin để chân sheet chỉ còn nút chuyển trạng thái. */
  onEdit?: () => void
  onTransfer?: () => void
  busy?: boolean
}

function MemberBody({ member, onOpenBacklog, onEdit, onTransfer, busy = false }: MemberBodyProps) {
  return (
    <div className="space-y-6 p-5">
      {(onEdit || onTransfer) && (
        <div className="flex flex-wrap gap-2">
          {onEdit && (
            <Button size="sm" variant="outline" disabled={busy} onClick={onEdit}>
              <PencilLine aria-hidden />
              Sửa thông tin
            </Button>
          )}
          {onTransfer && (
            <Button size="sm" variant="outline" disabled={busy} onClick={onTransfer}>
              <ArrowRightLeft aria-hidden />
              Chuyển ban
            </Button>
          )}
        </div>
      )}
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Trạng thái">
          <MemberStatusBadge status={member.status} />
        </Field>
        <Field label="Ban chính">{member.department?.name ?? 'Chưa có ban'}</Field>
        <Field label="Ngày gia nhập">{member.joinedOn ? formatDate(member.joinedOn) : '—'}</Field>
        {member.leftOn && <Field label="Ngày rời">{formatDate(member.leftOn)}</Field>}
        {member.exitKind && (
          <>
            <Field label="Hình thức">{exitKindLabel[member.exitKind]}</Field>
            {member.leaveReason && (
              <div className="sm:col-span-2">
                <Field label="Lý do rời">{member.leaveReason}</Field>
              </div>
            )}
          </>
        )}
      </dl>

      {member.status !== 'LEFT' && (
        <MemberPositions userId={member.person.id} fullName={member.person.fullName} canAssign={member.allowedActions.includes('ASSIGN_POSITION')} />
      )}

      {(member.contact || member.studentId) && (
        <Section title="Liên hệ (chỉ ban chủ nhiệm xem được)" icon={Mail}>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {member.contact && (
              <>
                <Field label="Email">
                  <span className="break-all">{member.contact.email}</span>
                </Field>
                <Field label="Số điện thoại">
                  <span className="inline-flex items-center gap-1.5">
                    <Phone aria-hidden className="size-3.5 text-muted-foreground" />
                    {member.contact.phone ?? '—'}
                  </span>
                </Field>
              </>
            )}
            {member.studentId && <Field label="MSSV">{member.studentId}</Field>}
          </dl>
        </Section>
      )}

      {member.backlogCount !== null && member.backlogCount > 0 && (
        <div className="space-y-2 rounded-xl bg-status-warning-soft p-3 text-sm text-status-warning">
          <p className="flex items-start gap-2">
            <Inbox aria-hidden className="mt-0.5 size-4 shrink-0" />
            {member.backlogCount} mục tồn đọng (công việc, việc chờ nghiệm thu, chức vụ) đang chờ ban chủ nhiệm gán lại.
          </p>
          {onOpenBacklog && (
            <Button variant="outline" size="sm" onClick={() => onOpenBacklog(member.person.id)}>
              Xử lý tồn đọng
            </Button>
          )}
        </div>
      )}

      {member.infoHistory !== null && (
        <Section title="Ghi chú nội bộ (chỉ ban chủ nhiệm xem được)" icon={NotebookPen}>
          {member.internalNote ? <p className="text-sm whitespace-pre-line">{member.internalNote}</p> : <p className="text-sm text-muted-foreground">Chưa có ghi chú.</p>}
        </Section>
      )}

      {member.infoHistory && member.infoHistory.length > 0 && (
        <Section title="Lịch sử chỉnh sửa thông tin" icon={PencilLine}>
          <ol className="space-y-3 border-l pl-4">
            {member.infoHistory.map((change) => {
              const shown = describeInfoChange(change)
              return (
                <li key={`${change.at}-${change.field}`} className="space-y-0.5">
                  <p className="text-sm font-semibold">{shown.label}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-sm break-words">
                    <span className="line-clamp-2 text-muted-foreground">{shown.from}</span>
                    <ArrowRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="sr-only">thành</span>
                    <span className="line-clamp-2">{shown.to}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(change.at)} · {change.actor.fullName}
                  </p>
                </li>
              )
            })}
          </ol>
        </Section>
      )}

      {member.history && member.history.length > 0 && (
        <Section title="Lịch sử trạng thái" icon={History}>
          <ol className="space-y-3 border-l pl-4">
            {member.history.map((change) => (
              <li key={`${change.at}-${change.toStatus}`} className="space-y-0.5">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                  {change.fromStatus ? memberStatusDisplay[change.fromStatus].label : change.toStatus === 'PENDING' ? 'Gửi yêu cầu' : 'Lập CLB'}
                  <ArrowRight aria-hidden className="size-3.5 text-muted-foreground" />
                  {memberStatusDisplay[change.toStatus].label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(change.at)} · {change.actor.fullName}
                </p>
                {change.reason && <p className="text-sm">{change.reason}</p>}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {member.departmentHistory && member.departmentHistory.length > 1 && (
        <Section title="Lịch sử ban chính" icon={ArrowRightLeft}>
          <ol className="space-y-2 border-l pl-4">
            {member.departmentHistory.map((stint) => (
              <li key={`${stint.department.id}-${stint.fromOn}`} className="space-y-0.5">
                <p className="text-sm font-semibold">Ban {stint.department.name}</p>
                <p className="text-xs text-muted-foreground">
                  {stintRange(stint)}
                  {stint.changedBy && ` · ${stint.changedBy.fullName}`}
                </p>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {member.pastMemberships && member.pastMemberships.length > 0 && (
        <Section title="Các lần sinh hoạt trước" icon={LogOut}>
          <PastMemberships items={member.pastMemberships} />
        </Section>
      )}
    </div>
  )
}

interface MemberDetailSheetProps {
  membershipId: string | null
  onClose: () => void
  /** Chỉ ban chủ nhiệm: mở tab Tồn đọng lọc theo người này (FR-MEM-09). */
  onOpenBacklog?: (formerMemberId: string) => void
}

/** Chi tiết thành viên; trường riêng tư chỉ có khi máy chủ trả về (SRS 3.5). Chuyển trạng thái theo ST-MEM (FR-MEM-06, 08). */
export function MemberDetailSheet({ membershipId, onClose, onOpenBacklog }: MemberDetailSheetProps) {
  const vm = useMemberDetailViewModel(membershipId)
  const member = vm.member
  const dialogDisplay = vm.dialog ? memberActionDisplay[vm.dialog] : null
  const [panel, setPanel] = useState<{ membershipId: string; kind: 'edit' | 'transfer' } | null>(null)
  // Sheet đóng hoặc đổi người (kể cả bằng nút Back) thì bỏ form đang mở, để mở lại không tự bật form cũ.
  if (panel !== null && panel.membershipId !== membershipId) setPanel(null)
  const openPanel = (kind: 'edit' | 'transfer') => setPanel(member ? { membershipId: member.membershipId, kind } : null)
  const panelOpen = (kind: 'edit' | 'transfer') => panel !== null && panel.kind === kind && panel.membershipId === member?.membershipId
  const canEdit = member?.allowedActions.includes('EDIT_INFO') ?? false
  const canTransfer = member?.allowedActions.includes('TRANSFER_DEPARTMENT') ?? false
  const hasFooter = member !== null && vm.actions.length > 0

  return (
    <Sheet open={membershipId !== null} onOpenChange={(open) => !open && !vm.pending && onClose()}>
      <SheetContent
        title={member?.person.fullName ?? 'Chi tiết thành viên'}
        description={member ? memberSubtitle(member) : undefined}
        footer={
          hasFooter
            ? vm.actions.map((action) => (
                <Button key={action} variant={memberActionDisplay[action].variant} disabled={vm.pending} onClick={() => vm.requestAction(action)}>
                  {memberActionDisplay[action].label}
                </Button>
              ))
            : undefined
        }
      >
        <ConflictBanner show={vm.conflict} onReload={vm.reloadAfterConflict} />
        {vm.loading && (
          <div className="space-y-4 p-5" role="status" aria-label="Đang tải thông tin thành viên">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
        {vm.error && (
          <div className="p-5">
            <ErrorState error={vm.error} onRetry={vm.refetch} />
          </div>
        )}
        {member && (
          <MemberBody
            member={member}
            onOpenBacklog={onOpenBacklog}
            onEdit={canEdit ? () => openPanel('edit') : undefined}
            onTransfer={canTransfer ? () => openPanel('transfer') : undefined}
            busy={vm.pending}
          />
        )}
      </SheetContent>

      <ReasonDialog
        open={dialogDisplay !== null}
        onOpenChange={(open) => !open && vm.closeDialog()}
        title={dialogDisplay?.dialogTitle ?? ''}
        description={dialogDisplay ? `${member?.person.fullName ?? ''}: ${dialogDisplay.dialogDescription}` : undefined}
        confirmLabel={dialogDisplay?.confirmLabel ?? ''}
        confirmVariant={vm.dialog === 'REMOVE' || vm.dialog === 'PUT_ON_LEAVE' ? 'destructive' : 'primary'}
        pending={vm.pending}
        onConfirm={vm.confirm}
      />
      <MemberInfoSheet member={member} open={panelOpen('edit')} onClose={() => setPanel(null)} />
      <TransferDepartmentDialog member={member} open={panelOpen('transfer')} onClose={() => setPanel(null)} />
    </Sheet>
  )
}
