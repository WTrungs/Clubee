import { motion } from 'motion/react'
import { ArrowLeft, CalendarX2, ReceiptText, Users } from 'lucide-react'
import { Link } from 'react-router'
import { EventCard } from '@/features/event/view/EventCard'
import { LedgerRow } from '@/features/finance/view/FinanceMeta'
import { TransactionDetailSheet } from '@/features/finance/view/TransactionDetailSheet'
import { PositionsPanel } from '@/features/org/view/PositionsPanel'
import { formatMoney } from '@/shared/format/formatMoney'
import { listVariants } from '@/shared/motion/presets'
import { Badge } from '@/shared/ui/Badge'
import { Pagination } from '@/shared/ui/ListControls'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { Tabs, TabsBar, TabsContent } from '@/shared/ui/Tabs'
import type { TermFundSummary, TermOverview, TermPositionHolder } from '../model/termTypes'
import { termPeriod, termStatusDisplay } from '../viewModel/termDisplay'
import { holderPeriodText, useTermDetailViewModel, type TermDetailViewModel } from '../viewModel/useTermDetailViewModel'

function HolderList({ holders, label }: { holders: TermPositionHolder[]; label: string }) {
  if (holders.length === 0) return <p className="text-sm text-muted-foreground">Không có ai giữ chức trong nhiệm kỳ.</p>
  return (
    <ul aria-label={label} className="divide-y">
      {holders.map((holder) => (
        <li key={holder.id} className="py-2 first:pt-0 last:pb-0">
          <p className="text-sm font-semibold">{holder.person.fullName}</p>
          <p className="text-xs text-muted-foreground">{holderPeriodText(holder)}</p>
        </li>
      ))}
    </ul>
  )
}

function FundStat({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'danger' }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className={tone === 'success' ? 'font-bold text-status-success tabular-nums' : tone === 'danger' ? 'font-bold text-status-danger tabular-nums' : 'font-bold tabular-nums'}>
        {formatMoney(value)}
      </p>
    </div>
  )
}

function FundSummary({ fund }: { fund: TermFundSummary }) {
  return (
    <section aria-labelledby="term-fund-title" className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
      <h2 id="term-fund-title" className="text-base font-bold">
        Quỹ chung trong nhiệm kỳ
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FundStat label="Số dư đầu kỳ" value={fund.openingBalance} />
        <FundStat label="Tổng thu" value={fund.income} tone="success" />
        <FundStat label="Tổng chi" value={fund.expense} tone="danger" />
        <FundStat label="Số dư cuối kỳ" value={fund.closingBalance} />
      </div>
      <p className="text-xs text-muted-foreground">Tính theo ngày phát sinh của giao dịch đã ghi sổ, gồm cả chuyển quỹ.</p>
    </section>
  )
}

function StructureTab({ overview }: { overview: TermOverview }) {
  const closed = overview.term.status === 'CLOSED'
  return (
    <div className="grid grid-cols-1 gap-5">
      <section aria-labelledby="term-board-title" className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
        <h2 id="term-board-title" className="text-base font-bold">
          Ban chủ nhiệm
        </h2>
        <HolderList holders={overview.board} label="Ban chủ nhiệm trong nhiệm kỳ" />
      </section>
      <section aria-labelledby="term-departments-title" className="space-y-3">
        <div className="space-y-1">
          <h2 id="term-departments-title" className="text-base font-bold">
            Các ban
          </h2>
          {closed && <p className="text-sm text-muted-foreground">Tên ban theo lúc nhiệm kỳ đóng.</p>}
        </div>
        {overview.departments.length === 0 ? (
          <EmptyState icon={Users} title="Nhiệm kỳ không có ban nào" />
        ) : (
          <ul aria-label="Các ban trong nhiệm kỳ" className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {overview.departments.map((department) => (
              <li key={department.id} className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
                <p className="font-semibold">Ban {department.name}</p>
                <HolderList holders={department.holders} label={`Trưởng, phó ban ${department.name}`} />
              </li>
            ))}
          </ul>
        )}
      </section>
      {overview.generalFund && <FundSummary fund={overview.generalFund} />}
    </div>
  )
}

function EventsTab({ vm }: { vm: TermDetailViewModel }) {
  const events = vm.events
  if (events.loading) return <Skeleton role="status" aria-label="Đang tải sự kiện" className="h-48 rounded-2xl" />
  if (events.error) return <ErrorState error={events.error} onRetry={events.refetch} />
  if (events.rows.length === 0) return <EmptyState icon={CalendarX2} title="Không có sự kiện nào bắt đầu trong nhiệm kỳ" />
  return (
    <>
      <motion.ul key={events.page} variants={listVariants} initial="initial" animate="animate" aria-label="Sự kiện trong nhiệm kỳ" className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {events.rows.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </motion.ul>
      <Pagination page={events.page} totalPages={events.totalPages} totalElements={events.totalElements} pageSize={events.pageSize} onPageChange={events.setPage} />
    </>
  )
}

function LedgerTab({ vm }: { vm: TermDetailViewModel }) {
  const ledger = vm.ledger
  if (!ledger.fundId) return <EmptyState icon={ReceiptText} title="CLB chưa có Quỹ chung" />
  if (ledger.loading) return <Skeleton role="status" aria-label="Đang tải sổ quỹ" className="h-48 rounded-2xl" />
  if (ledger.error) return <ErrorState error={ledger.error} onRetry={ledger.refetch} />
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Giao dịch đã ghi sổ của Quỹ chung, phát sinh trong khoảng nhiệm kỳ.</p>
      {ledger.rows.length === 0 ? (
        <EmptyState icon={ReceiptText} title="Không có giao dịch nào trong nhiệm kỳ" />
      ) : (
        <ul aria-label="Sổ Quỹ chung trong nhiệm kỳ" className="divide-y rounded-2xl border bg-card p-1 shadow-sm">
          {ledger.rows.map((entry) => (
            <li key={entry.id}>
              <LedgerRow entry={entry} onOpen={vm.openTransaction} />
            </li>
          ))}
        </ul>
      )}
      <Pagination page={ledger.page} totalPages={ledger.totalPages} totalElements={ledger.totalElements} pageSize={ledger.pageSize} onPageChange={ledger.setPage} />
      <TransactionDetailSheet clubId={vm.clubId} transactionId={vm.transactionId} fundId={ledger.fundId} onOpenTransaction={vm.openTransaction} onClose={vm.closeTransaction} />
    </div>
  )
}

/** FR-TERM-08: tra cứu nhiệm kỳ đã qua: cơ cấu, chức vụ, sự kiện và sổ quỹ; mọi thành viên xem được. */
export function TermDetailPage() {
  const vm = useTermDetailViewModel()
  const term = vm.term
  return (
    <div>
      <Link to={`/clubs/${encodeURIComponent(vm.clubId)}/terms`} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        Nhiệm kỳ
      </Link>
      <PageHeader
        eyebrow={vm.clubName}
        title={term?.name ?? 'Nhiệm kỳ'}
        description={term ? termPeriod(term) : undefined}
        actions={
          term && (
            <Badge tone={termStatusDisplay[term.status].tone} dot>
              {termStatusDisplay[term.status].label}
            </Badge>
          )
        }
      />
      {vm.loading && <Skeleton role="status" aria-label="Đang tải nhiệm kỳ" className="h-64 rounded-2xl" />}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {vm.overview && (
        <Tabs value={vm.tab} onValueChange={vm.setTab}>
          <TabsBar aria-label="Tra cứu nhiệm kỳ" active={vm.tab} items={vm.tabs} />
          <TabsContent value="structure" className="pt-5">
            <StructureTab overview={vm.overview} />
          </TabsContent>
          <TabsContent value="positions" className="pt-5">
            <PositionsPanel active={vm.tab === 'positions'} termId={vm.termId} />
          </TabsContent>
          <TabsContent value="events" className="pt-5">
            <EventsTab vm={vm} />
          </TabsContent>
          <TabsContent value="ledger" className="pt-5">
            <LedgerTab vm={vm} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
