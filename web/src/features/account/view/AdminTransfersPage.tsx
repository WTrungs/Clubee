import { motion } from 'motion/react'
import { CircleAlert, Inbox, ScrollText } from 'lucide-react'
import { useId } from 'react'
import { formatDate, formatDateTime } from '@/shared/format/formatDate'
import { cn } from '@/shared/lib/cn'
import { BOARD_INACTIVE_DAYS, TRANSFER_NOTE_MAX } from '@/shared/lib/transferRules'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { FormField } from '@/shared/ui/FormField'
import { Textarea } from '@/shared/ui/Input'
import { FilterChip, Pagination } from '@/shared/ui/ListControls'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { AdminTransferRequest, BoardActivityCheck } from '../model/presidencyTransferTypes'
import { boardCheckText, transferStatusDisplay } from '../viewModel/presidencyTransferDisplay'
import { useAdminTransfersViewModel, type AdminTransferFilter, type AdminTransfersViewModel } from '../viewModel/useAdminTransfersViewModel'

const filters: Array<{ value: AdminTransferFilter; label: string }> = [
  { value: 'PENDING', label: 'Đang chờ' },
  { value: 'HANDLED', label: 'Đã xử lý' },
]

function CheckLine({ label, check }: { label: string; check: BoardActivityCheck }) {
  return (
    <p className={cn('text-sm', check.boardInactive ? 'text-foreground' : 'font-semibold text-status-danger')}>
      <span className="font-semibold">{label}:</span> {boardCheckText(check)}
    </p>
  )
}

function RequestCard({ request, onOpen }: { request: AdminTransferRequest; onOpen: () => void }) {
  const display = transferStatusDisplay[request.status]
  return (
    <motion.li variants={itemVariants} className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold">{request.club.name}</h3>
          <p className="text-xs text-muted-foreground">
            {request.requester.fullName} gửi lúc {formatDateTime(request.createdAt)}
          </p>
        </div>
        <Badge tone={display.tone}>{display.label}</Badge>
      </div>
      <blockquote className="rounded-xl bg-muted/50 p-3 text-sm">{request.reason}</blockquote>
      {request.status !== 'PENDING' && request.decisionNote && (
        <p className="text-xs text-muted-foreground">
          {request.handledBy?.fullName ?? 'Quản trị hệ thống'}
          {request.handledAt && ` · ${formatDateTime(request.handledAt)}`}
          {request.newPresident && ` · Chủ nhiệm mới: ${request.newPresident.fullName}`}: {request.decisionNote}
        </p>
      )}
      {request.allowedActions.includes('DECIDE') && (
        <div className="flex justify-end">
          <Button onClick={onOpen}>Xem và xử lý</Button>
        </div>
      )}
    </motion.li>
  )
}

function DecisionSheet({ vm }: { vm: AdminTransfersViewModel }) {
  const formId = useId()
  const noteId = useId()
  const request = vm.selected
  return (
    <Sheet open={request !== null} onOpenChange={(open) => !open && vm.closeRequest()}>
      {request && (
        <SheetContent
          title={`Chuyển quyền · ${request.club.name}`}
          description={`${request.requester.fullName} gửi lúc ${formatDateTime(request.createdAt)}.`}
          footer={
            <>
              <Button variant="outline" className="text-destructive" onClick={vm.reject} disabled={vm.pending}>
                Từ chối
              </Button>
              <Button type="submit" form={formId} disabled={vm.pending || !vm.canApprove || vm.noCandidates}>
                Chuyển quyền
              </Button>
            </>
          }
        >
          <form
            id={formId}
            noValidate
            className="space-y-5 p-5"
            onSubmit={(event) => {
              event.preventDefault()
              vm.requestApprove()
            }}
          >
            <blockquote className="rounded-xl bg-muted/50 p-3 text-sm">{request.reason}</blockquote>
            <div className="space-y-1 rounded-xl border p-3">
              <CheckLine label="Lúc gửi" check={request.checkAtRequest} />
              {request.checkNow && <CheckLine label="Hiện tại" check={request.checkNow} />}
            </div>
            {!vm.canApprove && (
              <p role="alert" className="flex items-start gap-2 rounded-xl bg-status-danger-soft p-3 text-sm text-status-danger">
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                Ban chủ nhiệm đã đăng nhập lại nên không chuyển quyền được; chỉ từ chối được yêu cầu này.
              </p>
            )}
            {vm.canApprove && (
              <fieldset className="space-y-2" aria-describedby={`${formId}-audit`}>
                <legend className="text-sm font-semibold">Chủ nhiệm mới</legend>
                <p id={`${formId}-audit`} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ScrollText aria-hidden className="size-3.5" />
                  Việc xem danh sách thành viên này được ghi nhật ký.
                </p>
                {vm.candidatesLoading && <Skeleton className="h-24 rounded-xl" />}
                {vm.candidatesError && <ErrorState error={vm.candidatesError} onRetry={vm.retryCandidates} />}
                {vm.noCandidates && (
                  <p role="status" className="rounded-xl bg-muted/60 p-3 text-sm">
                    CLB không còn thành viên Chính thức nào khác để nhận chức; chỉ từ chối được yêu cầu này.
                  </p>
                )}
                <ul className="space-y-2">
                  {vm.candidates.map((candidate) => (
                    <li key={candidate.id}>
                      <label className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-x-3 rounded-xl border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                        <input
                          type="radio"
                          name="newPresident"
                          value={candidate.id}
                          checked={vm.newPresidentId === candidate.id}
                          onChange={() => vm.setNewPresidentId(candidate.id)}
                          className="row-span-2 mt-1 size-4 accent-primary"
                        />
                        <span className="text-sm font-semibold">{candidate.fullName}</span>
                        <span className="text-xs text-muted-foreground">
                          {candidate.departmentName ? `Ban ${candidate.departmentName}` : 'Chưa có ban'}
                          {candidate.joinedOn && ` · Gia nhập ${formatDate(candidate.joinedOn)}`}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                {vm.selectionError && (
                  <p role="alert" className="text-xs font-medium text-destructive">
                    {vm.selectionError}
                  </p>
                )}
              </fieldset>
            )}
            <FormField
              label="Ghi chú xử lý"
              required
              error={vm.noteError}
              hint="Bắt buộc. Chuyển quyền thì cả CLB thấy ghi chú này; từ chối thì chỉ người gửi thấy."
            >
              <Textarea id={noteId} rows={3} maxLength={TRANSFER_NOTE_MAX} value={vm.note} onChange={(event) => vm.setNote(event.target.value)} />
            </FormField>
          </form>
          <ConfirmDialog
            open={vm.confirming}
            onOpenChange={(open) => !open && vm.cancelConfirm()}
            title="Chuyển quyền Chủ nhiệm"
            description={`${vm.newPresidentName} thành Chủ nhiệm ${request.club.name} từ hôm nay tới hết nhiệm kỳ. Chủ nhiệm hiện tại thôi giữ chức; Phó chủ nhiệm, Thủ quỹ giữ nguyên. Cả CLB nhận thông báo.`}
            confirmLabel="Chuyển quyền"
            pending={vm.pending}
            onConfirm={vm.approve}
          />
        </SheetContent>
      )}
    </Sheet>
  )
}

/** FR-ACC-08: Admin xử lý yêu cầu chuyển quyền Chủ nhiệm khi ban chủ nhiệm không hoạt động. */
export function AdminTransfersPage() {
  const vm = useAdminTransfersViewModel()
  return (
    <div>
      <PageHeader
        eyebrow="Quản trị hệ thống"
        title="Chuyển quyền chủ nhiệm"
        description={`Yêu cầu của thành viên Chính thức khi cả ban chủ nhiệm không đăng nhập quá ${BOARD_INACTIVE_DAYS} ngày.`}
      />
      <div role="group" aria-label="Lọc yêu cầu" className="mb-4 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <FilterChip key={filter.value} label={filter.label} selected={vm.status === filter.value} onToggle={() => vm.setStatus(filter.value)} />
        ))}
      </div>
      {vm.loading && <Skeleton className="h-40 rounded-2xl" />}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {!vm.loading && !vm.error && vm.requests.length === 0 && (
        <EmptyState icon={Inbox} title={vm.status === 'PENDING' ? 'Không có yêu cầu đang chờ' : 'Chưa có yêu cầu nào đã xử lý'} />
      )}
      {!vm.error && vm.requests.length > 0 && (
        <motion.ul key={`${vm.status}-${vm.page}`} variants={listVariants} initial="initial" animate="animate" aria-label="Yêu cầu chuyển quyền" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {vm.requests.map((request) => (
            <RequestCard key={request.id} request={request} onOpen={() => vm.openRequest(request)} />
          ))}
        </motion.ul>
      )}
      {!vm.error && <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} className="mt-5" />}
      <DecisionSheet vm={vm} />
    </div>
  )
}
