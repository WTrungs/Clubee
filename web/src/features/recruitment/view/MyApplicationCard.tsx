import { Undo2 } from 'lucide-react'
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
      <p className="text-xs text-muted-foreground">
        Nộp lúc {formatDateTime(application.submittedAt)}
        {application.withdrawnAt && ` · rút lúc ${formatDateTime(application.withdrawnAt)}`}
      </p>
      {application.allowedActions.includes('WITHDRAW') && (
        <Button variant="outline" size="sm" onClick={() => vm.askWithdraw(application)} aria-label={`Rút đơn ${application.recruitment.name}`}>
          <Undo2 aria-hidden />
          Rút đơn
        </Button>
      )}
    </div>
  )
}

/** Hộp xác nhận rút đơn; rút rồi không nộp lại được cho đợt này. */
export function WithdrawDialog({ vm }: { vm: WithdrawViewModel }) {
  return (
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
  )
}
