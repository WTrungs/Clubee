import { FileText, MailQuestion, Undo2 } from 'lucide-react'
import { formatDateTime } from '@/shared/format/formatDate'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import type { SessionDetail } from '../model/sessionTypes'
import { absenceStatusDisplay } from '../viewModel/sessionDisplay'
import { useAbsenceViewModel } from '../viewModel/useAbsenceViewModel'

/** FR-ATT-04: đơn xin phép của chính người xem; ẩn khi không có đơn và không xin được. */
export function MyAbsenceCard({ clubId, session }: { clubId: string; session: SessionDetail }) {
  const vm = useAbsenceViewModel(clubId, session.id)
  const mine = session.myAbsenceRequest
  const canRequest = session.allowedActions.includes('REQUEST_ABSENCE')
  if (!mine && !canRequest) return null
  const display = mine ? absenceStatusDisplay[mine.status] : null

  return (
    <section aria-label="Xin phép vắng" className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <MailQuestion aria-hidden className="size-5 text-muted-foreground" />
          Xin phép vắng
        </h2>
        {display && (
          <Badge tone={display.tone} dot>
            {display.label}
          </Badge>
        )}
      </div>
      {mine ? (
        <div className="space-y-2 text-sm">
          <p className="break-words">
            <span className="font-semibold">Lý do của bạn:</span> {mine.reason}
          </p>
          <p className="text-xs text-muted-foreground">Gửi lúc {formatDateTime(mine.createdAt)}</p>
          {mine.decision && (
            <p className="break-words text-muted-foreground">
              {mine.status === 'APPROVED' ? 'Duyệt' : 'Từ chối'} bởi {mine.decision.by.fullName} lúc {formatDateTime(mine.decision.at)}
              {mine.decision.note && `. Lý do: ${mine.decision.note}`}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {mine.allowedActions.includes('WITHDRAW') && (
              <Button variant="outline" size="sm" onClick={() => vm.setWithdrawOpen(true)} disabled={vm.withdrawing}>
                <Undo2 aria-hidden />
                Rút đơn
              </Button>
            )}
            {mine.status === 'REJECTED' && canRequest && (
              <Button variant="outline" size="sm" onClick={() => vm.setRequestOpen(true)}>
                <FileText aria-hidden />
                Gửi đơn mới
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Không đến được? Gửi đơn trước giờ bắt đầu để được ghi Vắng có phép nếu được duyệt.</p>
          <Button variant="outline" onClick={() => vm.setRequestOpen(true)} className="self-start sm:self-auto">
            <FileText aria-hidden />
            Xin phép vắng
          </Button>
        </div>
      )}

      <ReasonDialog
        open={vm.requestOpen}
        onOpenChange={vm.setRequestOpen}
        title="Xin phép vắng buổi này?"
        description="Người phụ trách buổi nhận đơn và duyệt trước khi chốt điểm danh."
        placeholder="Ví dụ: Trùng lịch thi giữa kỳ."
        confirmLabel="Gửi đơn"
        pending={vm.requesting}
        onConfirm={vm.submitRequest}
      />
      {mine && (
        <ConfirmDialog
          open={vm.withdrawOpen}
          onOpenChange={vm.setWithdrawOpen}
          title="Rút đơn xin phép?"
          description={mine.status === 'APPROVED' ? 'Đơn đã được duyệt; rút đơn thì bạn sẽ được tính như người tham gia bình thường.' : 'Người phụ trách sẽ không xét đơn này nữa.'}
          confirmLabel="Rút đơn"
          pending={vm.withdrawing}
          onConfirm={() => vm.confirmWithdraw(mine.id, mine.version)}
        />
      )}
    </section>
  )
}
