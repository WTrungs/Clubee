import { motion } from 'motion/react'
import { BookOpenText, ClipboardCheck, FilePlus2, HandCoins, Landmark, Plus, ReceiptText, SearchX, Wallet } from 'lucide-react'
import { useId } from 'react'
import { formatDate } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import { duration, easeOut, itemVariants, listVariants } from '@/shared/motion/presets'
import { AnimatedNumber } from '@/shared/ui/AnimatedNumber'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, NativeSelect } from '@/shared/ui/Input'
import { FilterChip, Pagination, SearchInput } from '@/shared/ui/ListControls'
import { MoneyInput } from '@/shared/ui/MoneyInput'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { Tabs, TabsBar, TabsContent } from '@/shared/ui/Tabs'
import type { FinanceCategory, FundDetail } from '../model/financeTypes'
import {
  financeCategoryLabel,
  fundStatusDisplay,
  LEDGER_CATEGORIES,
  LEDGER_PERIODS,
  ledgerPeriodLabel,
  requestFilterDisplay,
  type LedgerPeriod,
  type RequestFilter,
} from '../viewModel/financeDisplay'
import { SHARE_NOTE_MAX, useFundPanelViewModel, type FundPanelViewModel } from '../viewModel/useFundPanelViewModel'
import { useAdvanceListViewModel } from '../viewModel/useAdvanceListViewModel'
import { AdvanceDetailSheet } from './AdvanceDetailSheet'
import { AdvanceList } from './AdvanceList'
import { LedgerRow, RequestRow } from './FinanceMeta'
import { ProposeAdvanceSheet } from './ProposeAdvanceSheet'
import { ProposeExpenseSheet } from './ProposeExpenseSheet'
import { RecordIncomeSheet } from './RecordIncomeSheet'
import { TransactionDetailSheet } from './TransactionDetailSheet'

function BalanceCard({ fund, vm }: { fund: FundDetail; vm: FundPanelViewModel }) {
  return (
    <motion.section
      aria-label={`Số dư ${fund.name}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.slow, ease: easeOut }}
      className="rounded-3xl bg-brand p-6 text-brand-foreground sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold opacity-90">
          <Wallet aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0 break-words">{fund.name}</span>
        </p>
        <span className="rounded-full bg-brand-foreground/15 px-3 py-1 text-xs font-bold">{fundStatusDisplay[fund.status].label}</span>
      </div>
      <p className="mt-4 text-sm opacity-90">Số dư hiện tại</p>
      <p className="text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl">
        <AnimatedNumber value={fund.balance} /> đ
      </p>
      <p className="mt-1 text-xs opacity-80">Tính từ các giao dịch đã ghi sổ, tại thời điểm bạn xem.</p>
      {fund.status === 'SETTLED' && fund.settledAt && (
        <p className="mt-3 text-sm opacity-90">
          Đã quyết toán ngày {formatDate(fund.settledAt)}
          {fund.settledBy ? ` bởi ${fund.settledBy.fullName}` : ''}. Quỹ không nhận thêm giao dịch.
        </p>
      )}
      {vm.advancesBlockSettle > 0 && (
        <p role="status" className="mt-3 rounded-xl bg-brand-foreground/15 px-3 py-2 text-sm">
          Còn {vm.advancesBlockSettle} tạm ứng chưa quyết toán xong. Chốt hết tạm ứng mới quyết toán được quỹ này.
        </p>
      )}
      {vm.pendingBlocksSettle > 0 && (
        <p role="status" className="mt-3 rounded-xl bg-brand-foreground/15 px-3 py-2 text-sm">
          Còn {vm.pendingBlocksSettle} khoản chờ duyệt hoặc chờ ghi sổ. Xử lý xong mới quyết toán được quỹ này.
        </p>
      )}
      {(vm.canRecordIncome || vm.canProposeExpense || vm.canProposeAdvance || vm.canSettle) && (
        <div className="mt-5 flex flex-wrap gap-2">
          {vm.canSettle && (
            <Button variant="secondary" size="sm" onClick={vm.openSettle}>
              <Landmark aria-hidden />
              Quyết toán quỹ
            </Button>
          )}
          {vm.canRecordIncome && (
            <Button variant="secondary" size="sm" onClick={vm.openIncome}>
              <Plus aria-hidden />
              Ghi khoản thu
            </Button>
          )}
          {vm.canProposeExpense && (
            <Button variant="secondary" size="sm" onClick={vm.openPropose}>
              <FilePlus2 aria-hidden />
              Đề xuất chi
            </Button>
          )}
          {vm.canProposeAdvance && (
            <Button variant="secondary" size="sm" onClick={vm.openProposeAdvance}>
              <HandCoins aria-hidden />
              Đề xuất tạm ứng
            </Button>
          )}
        </div>
      )}
    </motion.section>
  )
}

function Requests({ vm }: { vm: FundPanelViewModel }) {
  const titleId = useId()
  const pendingView = vm.requestFilter === 'PENDING'
  return (
    <section aria-labelledby={titleId} className="rounded-2xl border bg-card shadow-sm">
      <header className="space-y-3 border-b p-4 sm:p-5">
        <h2 id={titleId} className="flex items-center gap-2 font-bold">
          <ClipboardCheck aria-hidden className="size-5 text-muted-foreground" />
          Khoản chi
        </h2>
        <div role="group" aria-label="Lọc khoản chi" className="flex flex-wrap gap-2">
          {(Object.keys(requestFilterDisplay) as RequestFilter[]).map((filter) => (
            <FilterChip key={filter} label={requestFilterDisplay[filter].label} selected={vm.requestFilter === filter} onToggle={() => vm.setRequestFilter(filter)} />
          ))}
          <FilterChip label="Của tôi" selected={vm.mineOnly} onToggle={vm.toggleMineOnly} />
        </div>
      </header>
      <div className="p-2">
        {vm.requestsLoading && (
          <div className="space-y-2 p-2" role="status" aria-label="Đang tải khoản chi">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {vm.requestsError && !vm.requestsLoading && <ErrorState error={vm.requestsError} onRetry={vm.retryRequests} className="border-0" />}
        {!vm.requestsLoading && !vm.requestsError && vm.requests.length === 0 && (
          <EmptyState
            icon={ClipboardCheck}
            title={pendingView ? 'Không có khoản chi cần xử lý' : 'Chưa có khoản chi đã xử lý'}
            description={pendingView ? 'Khoản chi chờ duyệt hoặc chờ ghi sổ sẽ hiện ở đây.' : 'Khoản đã ghi sổ, bị từ chối hoặc đã rút sẽ hiện ở đây.'}
            className="border-0"
          />
        )}
        {!vm.requestsError && vm.requests.length > 0 && (
          <motion.ul key={`${vm.requestFilter}-${String(vm.mineOnly)}-${vm.requestPage}`} variants={listVariants} initial="initial" animate="animate" className="divide-y">
            {vm.requests.map((entry) => (
              <motion.li key={entry.id} variants={itemVariants} className="py-0.5">
                <RequestRow entry={entry} onOpen={vm.openTransaction} />
              </motion.li>
            ))}
          </motion.ul>
        )}
      </div>
    </section>
  )
}

function LedgerFilters({ vm }: { vm: FundPanelViewModel }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_14rem]">
      <SearchInput label="Tìm trong sổ quỹ" placeholder="Tìm theo nội dung, người tạo…" value={vm.keyword} onValueChange={vm.setKeyword} className="sm:col-span-2 lg:col-span-1" />
      <NativeSelect aria-label="Lọc theo kỳ" value={vm.period} onChange={(event) => vm.setPeriod(event.target.value as LedgerPeriod)}>
        {LEDGER_PERIODS.map((period) => (
          <option key={period} value={period} disabled={period === 'TERM' && !vm.termAvailable}>
            {ledgerPeriodLabel[period]}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Lọc theo hạng mục" value={vm.category} onChange={(event) => vm.setCategory(event.target.value as FinanceCategory | '')}>
        <option value="">Mọi hạng mục</option>
        {LEDGER_CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {financeCategoryLabel[category]}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}

function Ledger({ vm }: { vm: FundPanelViewModel }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="rounded-2xl border bg-card shadow-sm">
      <header className="space-y-3 border-b p-4 sm:p-5">
        <h2 id={titleId} className="flex items-center gap-2 font-bold">
          <BookOpenText aria-hidden className="size-5 text-muted-foreground" />
          Sổ quỹ
        </h2>
        <LedgerFilters vm={vm} />
      </header>
      <div className="p-2">
        {vm.ledgerLoading && (
          <div className="space-y-2 p-2" role="status" aria-label="Đang tải sổ quỹ">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}
        {vm.ledgerError && !vm.ledgerLoading && <ErrorState error={vm.ledgerError} onRetry={vm.retryLedger} className="border-0" />}
        {!vm.ledgerLoading && !vm.ledgerError && vm.entries.length === 0 && (
          <EmptyState
            icon={vm.filtered ? SearchX : ReceiptText}
            title={vm.filtered ? 'Không có giao dịch phù hợp' : 'Sổ quỹ chưa có giao dịch'}
            description={vm.filtered ? 'Thử đổi kỳ, hạng mục hoặc từ khóa.' : 'Khoản thu, khoản chi đã ghi sổ sẽ hiện ở đây.'}
            action={
              vm.filtered ? (
                <Button variant="outline" size="sm" onClick={vm.clearFilters}>
                  Bỏ bộ lọc
                </Button>
              ) : undefined
            }
            className="border-0"
          />
        )}
        {!vm.ledgerError && vm.entries.length > 0 && (
          <motion.ul key={`${vm.period}-${vm.category}-${vm.page}`} variants={listVariants} initial="initial" animate="animate" className="divide-y">
            {vm.entries.map((entry) => (
              <motion.li key={entry.id} variants={itemVariants} className="py-0.5">
                <LedgerRow entry={entry} onOpen={vm.openTransaction} />
              </motion.li>
            ))}
          </motion.ul>
        )}
      </div>
    </section>
  )
}

/** Một quỹ (chung hoặc sự kiện): thẻ số dư, sổ quỹ và các thao tác máy chủ cho phép. */
export function FundPanel({ fundId }: { fundId: string }) {
  const vm = useFundPanelViewModel(fundId)
  const advances = useAdvanceListViewModel(fundId, vm.tab === 'advances')
  const ledger = (
    <>
      <Ledger vm={vm} />
      <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />
    </>
  )

  return (
    <div className="space-y-5">
      <ConflictBanner show={vm.conflict} onReload={vm.reloadAfterConflict} message="Quỹ vừa được người khác cập nhật. Tải lại để xem số dư mới nhất rồi thao tác lại." />
      {vm.fundLoading && <Skeleton className="h-52 w-full rounded-3xl" />}
      {vm.fundError && !vm.fundLoading && <ErrorState error={vm.fundError} onRetry={vm.retryFund} />}
      {vm.fund && <BalanceCard fund={vm.fund} vm={vm} />}

      {!vm.fundError && !vm.canViewRequests && !vm.canViewAdvances && ledger}
      {!vm.fundError && (vm.canViewRequests || vm.canViewAdvances) && (
        <Tabs value={vm.tab} onValueChange={vm.setTab}>
          <TabsBar
            aria-label="Nội dung quỹ"
            active={vm.tab}
            items={[
              { value: 'ledger', label: 'Sổ quỹ' },
              ...(vm.canViewRequests ? [{ value: 'requests', label: 'Khoản chi', count: vm.fund?.pendingCount ?? undefined }] : []),
              ...(vm.canViewAdvances ? [{ value: 'advances', label: 'Tạm ứng' }] : []),
            ]}
          />
          <TabsContent value="ledger" className="space-y-5 pt-5">
            {ledger}
          </TabsContent>
          {vm.canViewRequests && (
            <TabsContent value="requests" className="space-y-5 pt-5">
              <Requests vm={vm} />
              <Pagination page={vm.requestPage} totalPages={vm.requestTotalPages} totalElements={vm.requestTotalElements} pageSize={vm.pageSize} onPageChange={vm.setRequestPage} />
            </TabsContent>
          )}
          {vm.canViewAdvances && (
            <TabsContent value="advances" className="space-y-5 pt-5">
              <AdvanceList vm={advances} />
            </TabsContent>
          )}
        </Tabs>
      )}

      <TransactionDetailSheet
        clubId={vm.clubId}
        transactionId={vm.openedTransactionId}
        fundId={fundId}
        onOpenTransaction={vm.switchTransaction}
        onOpenAdvance={vm.canViewAdvances ? advances.openAdvance : undefined}
        onClose={vm.closeTransaction}
      />
      {vm.fund && <RecordIncomeSheet open={vm.incomeOpen} fundId={vm.fund.id} fundName={vm.fund.name} onClose={vm.closeIncome} />}
      {vm.fund && <ProposeExpenseSheet open={vm.proposeOpen} fund={vm.fund} onClose={vm.closePropose} />}
      {vm.fund && <ProposeAdvanceSheet open={vm.advanceOpen} fund={vm.fund} onClose={vm.closeProposeAdvance} />}
      <AdvanceDetailSheet advanceId={advances.openedAdvanceId} onClose={advances.closeAdvance} onOpenTransaction={advances.openLinkedTransaction} />
      {vm.fund && (
        <ConfirmDialog
          open={vm.settleOpen}
          onOpenChange={(open) => !open && vm.closeSettle()}
          title="Quyết toán quỹ sự kiện"
          description={
            vm.fund.event?.status === 'CANCELLED'
              ? 'Sau khi quyết toán, quỹ không nhận thêm giao dịch. Sự kiện đã hủy giữ nguyên trạng thái.'
              : 'Sau khi quyết toán, quỹ không nhận thêm giao dịch. Ban chủ nhiệm hoặc Trưởng BTC đóng được sự kiện ngay sau đó.'
          }
          confirmLabel="Quyết toán"
          pending={vm.settling}
          onConfirm={vm.confirmSettle}
        >
          {vm.shareClubs.length > 0 && (
            <fieldset className="mb-4 space-y-3">
              <legend className="mb-1 text-sm font-semibold">Chia cho CLB đồng tổ chức</legend>
              <p className="text-xs text-muted-foreground">Không bắt buộc. Mỗi khoản ghi thành khoản chi đã ghi sổ của quỹ này; quỹ vẫn thuộc CLB bạn.</p>
              {vm.shareClubs.map((club) => {
                const draft = vm.shareDrafts[club.id] ?? { amount: '', note: '' }
                return (
                  <div key={club.id} className="space-y-2 rounded-xl border p-3">
                    <FormField label={`Số tiền chia cho ${club.name}`} error={vm.sharePlan.errors[club.id]}>
                      <MoneyInput value={draft.amount} onChange={(event) => vm.setShareDraft(club.id, { amount: event.target.value })} />
                    </FormField>
                    <FormField label={`Ghi chú cho ${club.name}`}>
                      <Input maxLength={SHARE_NOTE_MAX} value={draft.note} onChange={(event) => vm.setShareDraft(club.id, { note: event.target.value })} />
                    </FormField>
                  </div>
                )
              })}
              <FormAlert message={vm.sharePlan.totalError} />
            </fieldset>
          )}
          <FormAlert message={vm.settleError} />
          <p role="status" className="rounded-xl border bg-muted/40 p-3 text-sm">
            {vm.settleBalanceLoading ? (
              'Đang tải số dư mới nhất…'
            ) : vm.sharePlan.remainder > 0 ? (
              <>
                {vm.sharePlan.total > 0 && (
                  <>
                    Chia <span className="font-bold tabular-nums">{formatMoney(vm.sharePlan.total)}</span> cho CLB đồng tổ chức.{' '}
                  </>
                )}
                Chuyển <span className="font-bold tabular-nums">{formatMoney(vm.sharePlan.remainder)}</span> còn lại về Quỹ chung bằng một giao dịch chuyển quỹ.
              </>
            ) : vm.fund.balance > 0 && vm.sharePlan.total > 0 ? (
              'Toàn bộ số dư chia cho CLB đồng tổ chức nên không có giao dịch chuyển quỹ.'
            ) : (
              'Quỹ không còn số dư nên không có giao dịch chuyển quỹ.'
            )}
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
