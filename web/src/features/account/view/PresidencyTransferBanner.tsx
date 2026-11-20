import { Clock, ShieldAlert } from 'lucide-react'
import { getErrorMessage } from '@/api/apiError'
import { formatDateTime } from '@/shared/format/formatDate'
import { TRANSFER_REASON_MAX, TRANSFER_REASON_MIN } from '@/shared/lib/transferRules'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import { usePresidencyTransferViewModel } from '../viewModel/usePresidencyTransferViewModel'

/** FR-ACC-08: dải thông báo ở Cơ cấu khi ban chủ nhiệm không hoạt động hoặc đã có yêu cầu chuyển quyền chờ xử lý. */
export function PresidencyTransferBanner() {
  const vm = usePresidencyTransferViewModel()
  if (vm.error) {
    return (
      <div role="alert" className="mb-4 flex flex-wrap items-center gap-2 text-sm text-destructive">
        <span>Chưa kiểm tra được tình trạng ban chủ nhiệm. {getErrorMessage(vm.error)}</span>
        <Button size="sm" variant="outline" onClick={vm.retry}>
          Thử lại
        </Button>
      </div>
    )
  }
  if (!vm.visible) return null
  const pending = vm.pending

  return (
    <div role="status" className="mb-4 flex flex-col gap-3 rounded-2xl bg-status-warning-soft p-4 text-status-warning sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {pending ? <Clock aria-hidden className="mt-0.5 size-5 shrink-0" /> : <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0" />}
        <div className="min-w-0 space-y-1 text-sm">
          {pending ? (
            <>
              <p className="font-semibold">Đang chờ quản trị hệ thống xử lý yêu cầu chuyển quyền Chủ nhiệm</p>
              <p className="text-foreground/80">
                {pending.mine ? 'Bạn' : pending.requester.fullName} gửi lúc {formatDateTime(pending.createdAt)}.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">Ban chủ nhiệm không đăng nhập hơn {vm.inactiveDays} ngày</p>
              <p className="text-foreground/80">Thành viên Chính thức có thể đề nghị quản trị hệ thống chuyển quyền Chủ nhiệm cho người khác.</p>
            </>
          )}
        </div>
      </div>
      {vm.canRequest && (
        <Button variant="outline" className="shrink-0" onClick={vm.openRequest}>
          Yêu cầu chuyển quyền chủ nhiệm
        </Button>
      )}
      {vm.canCancel && (
        <Button variant="outline" className="shrink-0" onClick={vm.openCancel}>
          Hủy yêu cầu
        </Button>
      )}

      <ReasonDialog
        open={vm.dialog === 'request'}
        onOpenChange={(open) => !open && vm.closeDialog()}
        title="Yêu cầu chuyển quyền chủ nhiệm"
        description="Quản trị hệ thống sẽ kiểm tra lại và chọn Chủ nhiệm mới trong số thành viên Chính thức. Chỉ chức Chủ nhiệm bị thay; các chức khác giữ nguyên."
        label="Lý do, tình hình CLB"
        minLength={TRANSFER_REASON_MIN}
        maxLength={TRANSFER_REASON_MAX}
        confirmLabel="Gửi yêu cầu"
        pending={vm.pendingAction}
        onConfirm={vm.sendRequest}
      />
      <ConfirmDialog
        open={vm.dialog === 'cancel'}
        onOpenChange={(open) => !open && vm.closeDialog()}
        title="Hủy yêu cầu chuyển quyền"
        description="Quản trị hệ thống sẽ không xử lý yêu cầu này nữa. Bạn gửi lại được nếu ban chủ nhiệm vẫn không hoạt động."
        confirmLabel="Hủy yêu cầu"
        confirmVariant="destructive"
        pending={vm.pendingAction}
        onConfirm={vm.confirmCancel}
      />
    </div>
  )
}
