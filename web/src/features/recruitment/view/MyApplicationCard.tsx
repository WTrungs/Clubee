import { CircleCheck, CircleX, Undo2 } from 'lucide-react'
import { formatDateTime } from '@/shared/format/formatDate'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import type { MyApplication } from '../model/recruitmentTypes'
import { applicationStatusDisplay, choicesText } from '../viewModel/recruitmentDisplay'
import type { WithdrawViewModel } from '../viewModel/useApplicationViewModels'

/** Trạng thái đơn của chính mình và nút Rút đơn khi máy chủ cho phép. */
export function MyApplicationCard({ application, vm, showRecruitment = false }: { application: MyApplication; vm: WithdrawViewModel; showRecruitment?: boolean }) {
  const status = applicationStatusDisplay[application.status]
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 font-semibold [overflow-wrap:anywhere]">{showRecruitment ? application.recruitment.name : 'Đơn của bạn'}</p>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
      </div>
      {showRecruitment && <p className="text-sm text-muted-foreground">{application.recruitment.clubName}</p>}
      <p className="text-sm">
        <span className="font-semibold">Nguyện vọng:</span> {choicesText(application.choices)}
      </p>
      {application.outcome?.departmentName && (
        <p className="rounded-lg bg-muted p-2.5 text-sm font-medium">
          {application.outcome.reserveOrder !== null
            ? `Dự bị ban ${application.outcome.departmentName}, thứ tự ${application.outcome.reserveOrder}.`
            : `Ban ${application.outcome.departmentName}${application.status === 'ADMITTED' && application.outcome.respondBy ? `, nhận kết quả trước ${formatDateTime(application.outcome.respondBy)}` : ''}.`}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Nộp lúc {formatDateTime(application.submittedAt)}
        {application.withdrawnAt && ` · rút lúc ${formatDateTime(application.withdrawnAt)}`}
      </p>
      {application.allowedActions.includes('RESPOND') && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="sm" onClick={() => vm.askRespond(application, 'ACCEPT')}>
            <CircleCheck aria-hidden />
            Nhận kết quả
          </Button>
          <Button size="sm" variant="outline" onClick={() => vm.askRespond(application, 'DECLINE')}>
            <CircleX aria-hidden />
            Từ chối
          </Button>
        </div>
      )}
      {application.allowedActions.includes('WITHDRAW') && (
        <Button variant="outline" size="sm" onClick={() => vm.askWithdraw(application)} aria-label={`Rút đơn ${application.recruitment.name}`}>
          <Undo2 aria-hidden />
          Rút đơn
        </Button>
      )}
    </div>
  )
}

/** Hộp xác nhận rút đơn (rút rồi không nộp lại được) và hộp nhận hoặc từ chối kết quả. */
export function WithdrawDialog({ vm }: { vm: WithdrawViewModel }) {
  const respond = vm.respondTarget ?? vm.lastRespond
  const department = respond?.application.outcome?.departmentName ?? ''
  return (
    <>
      <ConfirmDialog
        open={vm.respondTarget !== null}
        onOpenChange={(open) => !open && vm.closeRespond()}
        title={respond?.decision === 'ACCEPT' ? 'Nhận kết quả' : 'Từ chối nhận kết quả'}
        description={
          respond?.decision === 'ACCEPT'
            ? `Bạn sẽ thành thành viên ${respond.application.recruitment.clubName}, ban ${department}.`
            : `Ban chủ nhiệm có thể gọi người dự bị vào suất ở ban ${department}. Không đổi lại được.`
        }
        confirmLabel={respond?.decision === 'ACCEPT' ? 'Nhận kết quả' : 'Từ chối'}
        confirmVariant={respond?.decision === 'ACCEPT' ? 'primary' : 'destructive'}
        pending={vm.respondPending}
        onConfirm={vm.confirmRespond}
      />
      <ConfirmDialog
        open={vm.withdrawTarget !== null}
        onOpenChange={(open) => !open && vm.closeWithdraw()}
        title="Rút đơn ứng tuyển"
        description={`Rút đơn ${vm.withdrawTarget?.recruitment.name ?? ''}. Mỗi đợt chỉ nộp một đơn nên rút rồi thì không nộp lại được cho đợt này.`}
        confirmLabel="Rút đơn"
        confirmVariant="destructive"
        pending={vm.withdrawPending}
        onConfirm={vm.confirmWithdraw}
      />
    </>
  )
}
