import { AlertTriangle, BarChart3, FilterX, HandCoins, ShieldAlert, WalletCards } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { ReportPeriodPicker } from '@/features/report/view/ReportPeriodPicker'
import { formatDate } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import { cn } from '@/shared/lib/cn'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { NativeSelect } from '@/shared/ui/Input'
import { Pagination } from '@/shared/ui/ListControls'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { FinanceReport } from '../model/financeReportTypes'
import { financeCategoryLabel } from '../viewModel/financeDisplay'
import { netText, reportMonthLabel, reportShare } from '../viewModel/financeReportDisplay'
import { useFinanceReportViewModel, type FinanceReportViewModel } from '../viewModel/useFinanceReportViewModel'
import { ExportMenu } from '@/shared/ui/ExportMenu'

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'danger' | 'warning' }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-lg font-extrabold break-words tabular-nums sm:text-xl',
          tone === 'success' && 'text-status-success',
          tone === 'danger' && 'text-status-danger',
          tone === 'warning' && 'text-status-warning',
        )}
      >
        {value}
      </p>
    </div>
  )
}

interface AmountRow {
  key: string
  label: string
  income: number
  expense: number
  /** Có thì dòng bấm được để lọc theo dòng đó. */
  onSelect?: () => void
}

/** Ô tiền: màn hẹp hiện chữ Thu/Chi ngay trước số; màn rộng chữ đó chỉ dành cho trình đọc màn hình vì đã có tiêu đề cột. */
function Amount({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <span className={cn('text-sm break-words tabular-nums sm:text-right', className)}>
      <span className="text-xs text-muted-foreground sm:sr-only">{label} </span>
      {value > 0 ? formatMoney(value) : '–'}
    </span>
  )
}

/** Một bảng nhỏ: tên dòng, thu, chi, kèm hai thanh thu và chi so với dòng lớn nhất; dòng bấm được thì lọc theo dòng đó. */
function AmountTable({ title, icon, rows, empty }: { title: string; icon: ReactNode; rows: AmountRow[]; empty: string }) {
  const titleId = useId()
  const largest = Math.max(0, ...rows.flatMap((row) => [row.income, row.expense]))
  const grid = 'grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_7rem_7rem] sm:items-center'
  return (
    <section aria-labelledby={titleId} className="rounded-2xl border bg-card shadow-sm">
      <h3 id={titleId} className="flex items-center gap-2 border-b p-4 font-bold">
        {icon}
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="p-2">
          <div className={cn(grid, 'hidden px-2 py-1 text-xs text-muted-foreground sm:grid')} aria-hidden>
            <span />
            <span className="text-right">Thu</span>
            <span className="text-right">Chi</span>
          </div>
          <ul className="divide-y">
            {rows.map((row) => {
              const content = (
                <>
                  <span className="col-span-2 min-w-0 sm:col-span-1">
                    <span className="block text-sm font-medium break-words">
                      {row.onSelect && <span className="sr-only">Lọc theo </span>}
                      {row.label}
                    </span>
                    <span className="mt-1 block space-y-0.5" aria-hidden>
                      <span className="block h-1 rounded-full bg-status-success" style={{ width: `${reportShare(row.income, largest)}%` }} />
                      <span className="block h-1 rounded-full bg-primary/60" style={{ width: `${reportShare(row.expense, largest)}%` }} />
                    </span>
                  </span>
                  <Amount label="Thu" value={row.income} className="text-status-success" />
                  <Amount label="Chi" value={row.expense} />
                </>
              )
              return (
                <li key={row.key}>
                  {row.onSelect ? (
                    <button type="button" onClick={row.onSelect} className={cn(grid, 'w-full rounded-lg px-2 py-2.5 text-left hover:bg-muted')}>
                      {content}
                    </button>
                  ) : (
                    <div className={cn(grid, 'px-2 py-2.5')}>{content}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}

function AttentionList({
  title,
  icon,
  count,
  loading,
  error,
  onRetry,
  empty,
  toolbar,
  footer,
  children,
}: {
  title: string
  icon: ReactNode
  count: number
  loading: boolean
  error: unknown
  onRetry: () => void
  empty: string
  toolbar?: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="rounded-2xl border bg-card shadow-sm">
      <h3 id={titleId} className="flex items-center gap-2 border-b p-4 font-bold">
        {icon}
        {title}
        {!loading && !error && <Badge tone={count > 0 ? 'warning' : 'neutral'}>{count}</Badge>}
      </h3>
      {toolbar && <div className="border-b p-3">{toolbar}</div>}
      {loading ? (
        <div className="space-y-2 p-3" role="status" aria-label={`Đang tải ${title.toLowerCase()}`}>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={onRetry} className="m-3" />
      ) : count === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <>
          <ul className="divide-y p-2">{children}</ul>
          {footer && <div className="px-3 pb-3">{footer}</div>}
        </>
      )}
    </section>
  )
}

function linkRow(to: string, primary: string, secondary: string, amount: string) {
  return (
    <li key={to}>
      <Link to={to} className="flex items-start justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-muted">
        <span className="min-w-0">
          <span className="block text-sm font-medium break-words">{primary}</span>
          <span className="block text-xs text-muted-foreground">{secondary}</span>
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{amount}</span>
      </Link>
    </li>
  )
}

function AttentionLists({ vm, report, clubId }: { vm: FinanceReportViewModel; report: FinanceReport; clubId: string }) {
  const finance = `/clubs/${encodeURIComponent(clubId)}/finance`
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <AttentionList
        title="Chưa nộp quỹ"
        icon={<WalletCards aria-hidden className="size-5 text-muted-foreground" />}
        count={vm.unpaidTotal}
        loading={vm.unpaidLoading}
        error={vm.unpaidError}
        onRetry={vm.retryUnpaid}
        empty={vm.unpaidCampaign ? 'Đợt này không ai còn thiếu.' : 'Không ai còn thiếu.'}
        toolbar={
          vm.campaigns.length > 0 && (
            <NativeSelect aria-label="Lọc theo đợt đóng quỹ" value={vm.unpaidCampaign} onChange={(event) => vm.setUnpaidCampaign(event.target.value)}>
              <option value="">Mọi đợt</option>
              {vm.campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </NativeSelect>
          )
        }
        footer={<Pagination page={vm.unpaidPage} totalPages={vm.unpaidTotalPages} totalElements={vm.unpaidTotal} pageSize={vm.listSize} onPageChange={vm.setUnpaidPage} />}
      >
        {vm.unpaid.map((row) =>
          linkRow(
            `${finance}?view=dues&dues=${encodeURIComponent(row.campaignId)}`,
            row.member.fullName,
            `${row.campaignName} · ${row.overdue ? 'quá hạn' : 'hạn'} ${formatDate(row.dueOn)}`,
            formatMoney(row.owed),
          ),
        )}
      </AttentionList>
      <AttentionList
        title="Tạm ứng quá hạn"
        icon={<HandCoins aria-hidden className="size-5 text-muted-foreground" />}
        count={vm.overdueTotal}
        loading={vm.overdueLoading}
        error={vm.overdueError}
        onRetry={vm.retryOverdue}
        empty="Không có tạm ứng quá hạn."
        footer={<Pagination page={vm.overduePage} totalPages={vm.overdueTotalPages} totalElements={vm.overdueTotal} pageSize={vm.listSize} onPageChange={vm.setOverduePage} />}
      >
        {vm.overdueAdvances.map((advance) =>
          linkRow(`${finance}?adv=${encodeURIComponent(advance.id)}`, advance.purpose, `${advance.requester.fullName} · hạn ${formatDate(advance.settleBy)}`, formatMoney(advance.amount)),
        )}
      </AttentionList>
      <AttentionList
        title="Cùng một người duyệt và ghi sổ"
        icon={<ShieldAlert aria-hidden className="size-5 text-muted-foreground" />}
        count={report.flagged.length}
        loading={false}
        error={null}
        onRetry={vm.refetch}
        empty="Không có khoản nào trong kỳ."
      >
        {report.flagged.map((row) =>
          linkRow(`${finance}?tx=${encodeURIComponent(row.transactionId)}`, row.description, `${row.person.fullName} · ${formatDate(row.occurredOn)} · ${row.fundName}`, formatMoney(row.amount)),
        )}
      </AttentionList>
    </div>
  )
}

function ReportBody({ vm, report, clubId }: { vm: FinanceReportViewModel; report: FinanceReport; clubId: string }) {
  const filtered = report.category !== null || report.event !== null
  return (
    <div className={cn('space-y-5 transition-opacity', vm.refreshing && 'opacity-60')} aria-busy={vm.refreshing}>
      <p className="text-sm text-muted-foreground">
        {report.label}: {formatDate(report.from)} – {formatDate(report.to)}. Chỉ tính khoản Đã ghi sổ; chuyển quỹ không tính.
      </p>
      {filtered && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-status-info-soft p-3 text-sm">
          <span className="flex-1">
            Đang lọc
            {report.category ? ` theo hạng mục ${financeCategoryLabel[report.category]}` : ''}
            {report.event ? ` theo quỹ ${report.event.name}` : ''}.
          </span>
          <Button variant="outline" size="sm" onClick={vm.clearFilters}>
            <FilterX aria-hidden />
            Bỏ lọc
          </Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tổng thu" value={formatMoney(report.totalIncome)} tone="success" />
        <Stat label="Tổng chi" value={formatMoney(report.totalExpense)} />
        <Stat label="Chênh lệch" value={netText(report.net, formatMoney)} tone={report.net < 0 ? 'danger' : undefined} />
        <Stat label="Khoản cần lưu ý" value={String(report.flagged.length)} tone={report.flagged.length > 0 ? 'warning' : undefined} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <AmountTable
          title="Theo hạng mục"
          icon={<BarChart3 aria-hidden className="size-5 text-muted-foreground" />}
          empty="Không có khoản nào trong kỳ."
          rows={report.byCategory.map((row) => ({
            key: row.category,
            label: financeCategoryLabel[row.category],
            income: row.income,
            expense: row.expense,
            onSelect: report.category === null ? () => vm.filterByCategory(row.category) : undefined,
          }))}
        />
        <AmountTable
          title="Theo quỹ"
          icon={<WalletCards aria-hidden className="size-5 text-muted-foreground" />}
          empty="Không có khoản nào trong kỳ."
          rows={report.byFund.map((row) => ({
            key: row.fundId,
            label: row.fundName,
            income: row.income,
            expense: row.expense,
            onSelect: row.eventId && report.event === null ? () => row.eventId && vm.filterByEvent(row.eventId) : undefined,
          }))}
        />
      </div>
      <AmountTable
        title="Theo tháng"
        icon={<BarChart3 aria-hidden className="size-5 text-muted-foreground" />}
        empty="Không có tháng nào trong kỳ."
        rows={report.byMonth.map((row) => ({ key: row.month, label: `Tháng ${reportMonthLabel(row.month)}`, income: row.income, expense: row.expense }))}
      />
      <AttentionLists vm={vm} report={report} clubId={clubId} />
    </div>
  )
}

/** Tab Báo cáo (FR-FIN-12): tổng thu chi theo kỳ, theo hạng mục, quỹ, tháng; người chưa nộp, tạm ứng quá hạn, khoản R-01. */
export function FinanceReportPanel({ active }: { active: boolean }) {
  const vm = useFinanceReportViewModel(active)
  const { clubId } = useCurrentClub()
  return (
    <div className="space-y-5">
      <ReportPeriodPicker params={vm.periodParams} loading={vm.periodsLoading} />
      {vm.canExport && (
        <div className="flex justify-end">
          <ExportMenu onExport={vm.exportReport} pending={vm.exporting} label="Xuất báo cáo" />
        </div>
      )}
      {vm.periodsError && <ErrorState error={vm.periodsError} onRetry={vm.retryPeriods} />}
      {vm.loading && !vm.report && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="status" aria-label="Đang tải báo cáo">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      )}
      {vm.invalidReasons && (
        <div role="alert" className="rounded-xl bg-status-danger-soft p-3 text-sm text-status-danger">
          <p className="font-semibold">Điều kiện báo cáo chưa hợp lệ:</p>
          <ul className="mt-1 list-disc pl-5">
            {vm.invalidReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {!vm.error && !vm.invalidReasons && vm.report && <ReportBody vm={vm} report={vm.report} clubId={clubId} />}
      {!vm.error && !vm.invalidReasons && !vm.report && !vm.loading && vm.period === 'CUSTOM' && (
        <EmptyState icon={AlertTriangle} title="Chọn khoảng ngày" description="Nhập ngày bắt đầu, ngày kết thúc rồi bấm Xem." />
      )}
    </div>
  )
}
