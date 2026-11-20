import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Scale, type LucideIcon } from 'lucide-react'
import { formatDate } from '@/shared/format/formatDate'
import { cn } from '@/shared/lib/cn'
import { Badge } from '@/shared/ui/Badge'
import { toneVariants } from '@/shared/ui/tone'
import type { TransactionFlow, TransactionStatus, TransactionSummary, TransactionType } from '../model/financeTypes'
import { financeCategoryLabel, flowLabel, signedAmount, transactionStatusDisplay, transactionTypeLabel } from '../viewModel/financeDisplay'

export function TransactionStatusBadge({ status }: { status: TransactionStatus }) {
  const display = transactionStatusDisplay[status]
  return (
    <Badge tone={display.tone} dot>
      {display.label}
    </Badge>
  )
}

/** Số tiền kèm dấu; màu xanh lá chỉ để nhấn tiền vào, ý nghĩa nằm ở dấu và chữ đọc cho trình đọc màn hình. */
export function AmountText({ amount, flow, className }: { amount: number; flow: TransactionFlow; className?: string }) {
  return (
    <span className={cn('font-bold tabular-nums', flow === 'IN' ? 'text-status-success' : 'text-foreground', className)}>
      <span className="sr-only">{flowLabel[flow]} </span>
      {signedAmount(amount, flow)}
    </span>
  )
}

const typeIcon: Record<TransactionType, LucideIcon> = {
  INCOME: ArrowDownLeft,
  EXPENSE: ArrowUpRight,
  ADJUSTMENT: Scale,
  TRANSFER: ArrowLeftRight,
}

export function TransactionIcon({ type, flow }: { type: TransactionType; flow: TransactionFlow }) {
  const Icon = typeIcon[type]
  return (
    <span className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-xl', toneVariants({ tone: flow === 'IN' ? 'success' : 'neutral' }))}>
      <Icon aria-hidden className="size-5" />
    </span>
  )
}

/** Một khoản chi hoặc điều chỉnh trong danh sách xử lý: người tạo, ngày tạo, trạng thái. */
export function RequestRow({ entry, onOpen }: { entry: TransactionSummary; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(entry.id)}
      className="flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors duration-200 hover:bg-muted"
    >
      <TransactionIcon type={entry.type} flow={entry.flow} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold break-words">{entry.description}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {entry.proposer.fullName} · {formatDate(entry.createdAt)} · {entry.type === 'ADJUSTMENT' ? transactionTypeLabel.ADJUSTMENT : financeCategoryLabel[entry.category]}
        </span>
        <span className="mt-1.5 block">
          <TransactionStatusBadge status={entry.status} />
        </span>
      </span>
      <AmountText amount={entry.amount} flow={entry.flow} className="shrink-0 pt-0.5 text-right text-sm" />
    </button>
  )
}

/** Một dòng sổ quỹ: nội dung, ngày, hạng mục và số tiền có dấu; bấm để mở chi tiết. */
export function LedgerRow({ entry, onOpen }: { entry: TransactionSummary; onOpen: (id: string) => void }) {
  // Chuyển quỹ đã có hạng mục Chuyển quỹ nên chỉ điều chỉnh cần ghi thêm loại.
  const special = entry.type === 'ADJUSTMENT'
  return (
    <button
      type="button"
      onClick={() => onOpen(entry.id)}
      className="flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors duration-200 hover:bg-muted"
    >
      <TransactionIcon type={entry.type} flow={entry.flow} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold break-words">{entry.description}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {entry.occurredOn ? formatDate(entry.occurredOn) : formatDate(entry.createdAt)} · {financeCategoryLabel[entry.category]}
          {special ? ` · ${transactionTypeLabel[entry.type]}` : ''}
        </span>
      </span>
      <AmountText amount={entry.amount} flow={entry.flow} className="shrink-0 pt-0.5 text-right text-sm" />
    </button>
  )
}
