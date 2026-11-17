import { BookCheck, Check, FileText, RefreshCw, Scale, Undo2, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { formatDate, formatDateTime } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import { formatFileSize } from '@/shared/lib/validateUploadFile'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import type { TransactionDetail, TransactionRef, TransactionTransitionAction } from '../model/financeTypes'
import { financeCategoryLabel, transactionActionLabel, transactionTypeLabel } from '../viewModel/financeDisplay'
import { useTransactionActionsViewModel, type TransactionActionsViewModel } from '../viewModel/useTransactionActionsViewModel'
import { useTransactionDetail } from '../viewModel/useTransactionDetail'
import { AdjustmentSheet } from './AdjustmentSheet'
import { AmountText, TransactionStatusBadge } from './FinanceMeta'

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{children}</dd>
    </div>
  )
}

const dateLabel = (transaction: TransactionDetail) => {
  if (transaction.type === 'INCOME') return 'Ngày thu'
  if (transaction.type === 'EXPENSE') return 'Ngày chi'
  return 'Ngày ghi sổ'
}

const creatorLabel = (transaction: TransactionDetail) => {
  if (transaction.type === 'EXPENSE') return 'Người đề xuất'
  if (transaction.type === 'TRANSFER') return 'Người quyết toán'
  return 'Người ghi'
}

const actionIcon: Record<TransactionTransitionAction, ReactNode> = {
  APPROVE: <Check aria-hidden />,
  POST: <BookCheck aria-hidden />,
  REJECT: <X aria-hidden />,
  WITHDRAW: <Undo2 aria-hidden />,
}

/** Số dư trước và sau khi ghi sổ một khoản làm giảm quỹ (BR-FIN-08). */
function BalancePreview({ amount, actions }: { amount: number; actions: TransactionActionsViewModel }) {
  const balance = actions.currentBalance
  if (actions.balanceError) {
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-status-danger-soft p-3 text-sm sm:flex-row sm:items-center">
        <p className="flex-1 text-status-danger">Không tải được số dư hiện tại: {actions.balanceError}</p>
        <Button variant="outline" size="sm" onClick={actions.retryBalance} className="self-start sm:self-auto">
          <RefreshCw aria-hidden />
          Thử lại
        </Button>
      </div>
    )
  }
  return (
    <>
      <dl className="grid grid-cols-1 gap-3 rounded-xl border bg-muted/40 p-3 text-sm sm:grid-cols-2">
        <DetailRow label="Số dư hiện tại">{balance === null ? 'Đang tải…' : formatMoney(balance)}</DetailRow>
        <DetailRow label="Sau khi ghi sổ">{balance === null ? '—' : formatMoney(balance - amount)}</DetailRow>
      </dl>
      {balance !== null && balance < amount && (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          Quỹ không đủ tiền cho khoản này. Ghi khoản thu trước rồi mới ghi sổ.
        </p>
      )}
    </>
  )
}

function ActionDialogs({ data, actions }: { data: TransactionDetail; actions: TransactionActionsViewModel }) {
  const close = (open: boolean) => !open && actions.closeDialog()
  const adjustment = data.type === 'ADJUSTMENT'
  return (
    <>
      <ReasonDialog
        open={actions.dialog === 'REJECT'}
        onOpenChange={close}
        title={adjustment ? 'Từ chối điều chỉnh' : 'Từ chối khoản chi'}
        description={adjustment ? 'Thủ quỹ tạo điều chỉnh sẽ nhận thông báo kèm lý do.' : 'Người đề xuất sẽ nhận thông báo kèm lý do.'}
        label="Lý do từ chối"
        confirmLabel="Từ chối"
        confirmVariant="destructive"
        pending={actions.pending}
        onConfirm={(reason) => actions.confirm(reason)}
      />
      <ConfirmDialog
        open={actions.dialog === 'WITHDRAW'}
        onOpenChange={close}
        title={adjustment ? 'Rút điều chỉnh' : 'Rút đề xuất'}
        description={
          adjustment
            ? 'Điều chỉnh này sẽ không còn chờ duyệt. Muốn điều chỉnh lại thì tạo điều chỉnh mới.'
            : 'Khoản này sẽ không còn chờ duyệt. Muốn chi lại thì gửi đề xuất mới.'
        }
        confirmLabel={adjustment ? 'Rút điều chỉnh' : 'Rút đề xuất'}
        pending={actions.pending}
        onConfirm={() => actions.confirm()}
      />
      <ConfirmDialog
        open={actions.dialog === 'POST'}
        onOpenChange={close}
        title="Ghi sổ khoản chi"
        description="Chỉ ghi sổ khi tiền đã chi thật. Giao dịch đã ghi sổ không sửa được, sai thì phải tạo điều chỉnh."
        confirmLabel="Ghi sổ"
        pending={actions.pending}
        onConfirm={() => actions.confirm()}
      >
        <BalancePreview amount={data.amount} actions={actions} />
      </ConfirmDialog>
      <ConfirmDialog
        open={actions.dialog === 'APPROVE' && adjustment}
        onOpenChange={close}
        title="Duyệt điều chỉnh giảm quỹ"
        description="Duyệt xong điều chỉnh được ghi sổ ngay: số dư giảm và không sửa được, sai thì phải tạo điều chỉnh khác."
        confirmLabel="Duyệt"
        pending={actions.pending}
        onConfirm={() => actions.confirm()}
      >
        <BalancePreview amount={data.amount} actions={actions} />
      </ConfirmDialog>
    </>
  )
}

/** Giao dịch liên quan (gốc hoặc điều chỉnh); bấm để xem trong cùng sheet. */
function RelatedTransaction({ item, onOpen, disabled }: { item: TransactionRef; onOpen: (id: string) => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      disabled={disabled}
      className="flex w-full cursor-pointer items-start gap-3 rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-medium break-words">{item.description}</span>
        <span className="mt-1 block">
          <TransactionStatusBadge status={item.status} />
        </span>
      </span>
      <AmountText amount={item.amount} flow={item.flow} className="shrink-0 text-right" />
    </button>
  )
}

interface DetailBodyProps {
  clubId: string
  transactionId: string
  fundId: string | null
  onOpenTransaction: (id: string) => void
  onPendingChange: (pending: boolean) => void
}

function DetailBody({ clubId, transactionId, fundId, onOpenTransaction, onPendingChange }: DetailBodyProps) {
  const detail = useTransactionDetail(clubId, transactionId, fundId)
  // Lần hỏi lại bị từ chối thì không hiện nội dung cũ (BR-SEC-02).
  const data = detail.isSuccess ? detail.data : undefined
  const actions = useTransactionActionsViewModel(clubId, data)
  const [adjustOpen, setAdjustOpen] = useState(false)
  useEffect(() => onPendingChange(actions.pending), [actions.pending, onPendingChange])
  const samePerson = data?.approver && data.poster && data.approver.id === data.poster.id
  const canAdjust = data?.allowedActions.includes('ADJUST') ?? false
  return (
    <SheetContent
      title={data ? transactionTypeLabel[data.type] : 'Giao dịch'}
      description={data?.fundName}
      footer={
        data && (actions.actions.length > 0 || canAdjust) ? (
          <>
            {canAdjust && (
              <Button variant="outline" onClick={() => setAdjustOpen(true)} disabled={actions.pending}>
                <Scale aria-hidden />
                Tạo điều chỉnh
              </Button>
            )}
            {actions.actions.map((action) => (
              <Button
                key={action}
                variant={action === 'APPROVE' || action === 'POST' ? 'primary' : 'outline'}
                loading={actions.pendingAction === action && actions.dialog === null}
                disabled={actions.pending}
                onClick={() => actions.request(action)}
                className={action === 'REJECT' ? 'text-destructive' : undefined}
              >
                {actionIcon[action]}
                {transactionActionLabel[action]}
              </Button>
            ))}
          </>
        ) : undefined
      }
    >
      <div className="space-y-6 p-5">
        <ConflictBanner show={actions.conflict} onReload={actions.reloadAfterConflict} message="Khoản này vừa được người khác xử lý. Tải lại để xem trạng thái mới nhất." />
        {detail.isPending && (
          <div className="space-y-3" role="status" aria-label="Đang tải giao dịch">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {detail.isError && <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />}
        {data && (
          <>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <TransactionStatusBadge status={data.status} />
                {samePerson && (
                  <Badge tone="warning" title="Một người vừa duyệt vừa ghi sổ khoản này; mọi thành viên xem được để giám sát.">
                    Cùng người duyệt và ghi sổ
                  </Badge>
                )}
              </div>
              <AmountText amount={data.amount} flow={data.flow} className="block text-3xl tracking-tight" />
              <p className="text-sm leading-relaxed break-words">{data.description}</p>
            </div>

            <dl className="grid grid-cols-1 gap-4 rounded-2xl border bg-muted/40 p-4 sm:grid-cols-2">
              <DetailRow label="Hạng mục">{financeCategoryLabel[data.category]}</DetailRow>
              <DetailRow label={dateLabel(data)}>{data.occurredOn ? formatDate(data.occurredOn) : 'Chưa ghi sổ'}</DetailRow>
              {data.counterpartFundName &&
                (data.flow === 'IN' ? <DetailRow label="Chuyển từ">{data.fundName}</DetailRow> : <DetailRow label="Chuyển sang">{data.counterpartFundName}</DetailRow>)}
              <DetailRow label={creatorLabel(data)}>
                {data.proposer.fullName}
                <span className="block text-xs font-normal text-muted-foreground">{formatDateTime(data.createdAt)}</span>
              </DetailRow>
              {data.approver && (
                <DetailRow label={data.status === 'REJECTED' ? 'Người từ chối' : 'Người duyệt'}>
                  {data.approver.fullName}
                  {data.decidedAt && <span className="block text-xs font-normal text-muted-foreground">{formatDateTime(data.decidedAt)}</span>}
                </DetailRow>
              )}
              {data.poster && data.type !== 'INCOME' && (
                <DetailRow label="Người ghi sổ">
                  {data.poster.fullName}
                  {data.postedAt && <span className="block text-xs font-normal text-muted-foreground">{formatDateTime(data.postedAt)}</span>}
                </DetailRow>
              )}
            </dl>

            {data.original && (
              <section aria-label="Giao dịch gốc" className="space-y-2">
                <h3 className="text-sm font-semibold">Giao dịch gốc</h3>
                <RelatedTransaction item={data.original} onOpen={onOpenTransaction} disabled={actions.pending} />
              </section>
            )}

            {data.adjustments.length > 0 && (
              <section aria-label="Các điều chỉnh" className="space-y-2">
                <h3 className="text-sm font-semibold">Các điều chỉnh</h3>
                <ul className="space-y-1.5">
                  {data.adjustments.map((item) => (
                    <li key={item.id}>
                      <RelatedTransaction item={item} onOpen={onOpenTransaction} disabled={actions.pending} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.rejectionReason && (
              <div className="rounded-2xl border border-destructive/30 bg-status-danger-soft p-4 text-sm">
                <p className="font-semibold text-status-danger">Lý do từ chối</p>
                <p className="mt-1 break-words whitespace-pre-line">{data.rejectionReason}</p>
              </div>
            )}

            <section aria-label="Chứng từ" className="space-y-2">
              <h3 className="text-sm font-semibold">Chứng từ</h3>
              {data.attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Không có chứng từ đính kèm.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.attachments.map((file) => (
                    <li key={file.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                      <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatFileSize(file.size)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <ActionDialogs data={data} actions={actions} />
            <AdjustmentSheet open={adjustOpen} original={data} onClose={() => setAdjustOpen(false)} />
          </>
        )}
      </div>
    </SheetContent>
  )
}

interface TransactionDetailSheetProps {
  clubId: string
  transactionId: string | null
  /** Quỹ đang xem; chuyển quỹ hiện là tiền vào khi xem từ quỹ nhận. */
  fundId: string | null
  /** Xem giao dịch liên quan ngay trong sheet (giao dịch gốc, các điều chỉnh). */
  onOpenTransaction: (id: string) => void
  onClose: () => void
}

/** Chi tiết một giao dịch; mở bằng tham số `tx` trên URL để thông báo dẫn thẳng tới. */
export function TransactionDetailSheet({ clubId, transactionId, fundId, onOpenTransaction, onClose }: TransactionDetailSheetProps) {
  // Không đóng khi đang chờ máy chủ xử lý thao tác (NFR-REL-01).
  const [pending, setPending] = useState(false)
  return (
    <Sheet open={transactionId !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      {transactionId && (
        <DetailBody
          key={transactionId}
          clubId={clubId}
          transactionId={transactionId}
          fundId={fundId}
          onOpenTransaction={onOpenTransaction}
          onPendingChange={setPending}
        />
      )}
    </Sheet>
  )
}
