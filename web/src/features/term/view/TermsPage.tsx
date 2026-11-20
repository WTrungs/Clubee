import { motion } from 'motion/react'
import { ArrowRight, ArrowRightLeft, CalendarRange, History, ListChecks, Pencil, Plus, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { formatDate } from '@/shared/format/formatDate'
import { useNow } from '@/shared/hooks/useNow'
import { fadeVariants, itemVariants, listVariants } from '@/shared/motion/presets'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { PageHeader } from '@/shared/ui/PageHeader'
import { ProgressBar } from '@/shared/ui/ProgressBar'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { Term } from '../model/termTypes'
import { progressText } from '../viewModel/handoverDisplay'
import { isTermOverdue, planEntryKind, planEntryKindDisplay, planSummary, termLifecycleSteps, termPeriod, termRemainingText, termStatusDisplay } from '../viewModel/termDisplay'
import { useTermsPageViewModel } from '../viewModel/useTermsPageViewModel'
import { DepartmentPlanSheet } from './DepartmentPlanSheet'
import { TermFormSheet } from './TermFormSheet'
import { TermLifecycle } from './TermLifecycle'

function StatusBadge({ term }: { term: Term }) {
  const display = termStatusDisplay[term.status]
  return (
    <Badge tone={display.tone} dot>
      {display.label}
    </Badge>
  )
}

function HandoverLink({ path }: { path: string | null }) {
  if (!path) return null
  return (
    <Button asChild>
      <Link to={path}>
        <ArrowRightLeft aria-hidden />
        Mở phiên bàn giao
      </Link>
    </Button>
  )
}

function CurrentTermCard({ term, overdueHint, handoverPath }: { term: Term; overdueHint: string | null; handoverPath: string | null }) {
  const now = useNow()
  const overdue = isTermOverdue(term, new Date(now))
  const handingOver = term.status === 'HANDING_OVER'
  return (
    <section aria-labelledby="current-term-title" className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Nhiệm kỳ hiện tại</p>
          <h2 id="current-term-title" className="text-lg font-bold tracking-tight">
            {term.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {termPeriod(term)} · {termRemainingText(term.endOn, new Date(now))}
          </p>
        </div>
        <StatusBadge term={term} />
      </div>
      {overdue && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-status-warning-soft p-3 text-sm font-medium text-status-warning">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          Nhiệm kỳ đã quá ngày kết thúc. Ban chủ nhiệm hiện tại vẫn giữ quyền tới khi bàn giao xong; trong lúc này chưa gán chức vụ thường trực mới.
          {overdueHint && ` ${overdueHint}`}
        </p>
      )}
      {handingOver && (
        <p role="status" className="rounded-xl bg-status-warning-soft p-3 text-sm font-medium text-status-warning">
          Đang bàn giao. Ban chủ nhiệm hiện tại giữ quyền tới khi bàn giao hoàn tất; trong lúc này chưa gán chức vụ thường trực mới.
        </p>
      )}
      <TermLifecycle steps={termLifecycleSteps(term.status)} />
      {handingOver && term.handoverProgress && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{progressText(term.handoverProgress)}</p>
          <ProgressBar
            value={term.handoverProgress.confirmed}
            max={term.handoverProgress.pending + term.handoverProgress.confirmed}
            label="Tiến độ xác nhận bàn giao"
            tone="success"
          />
        </div>
      )}
      {handingOver && <HandoverLink path={handoverPath} />}
    </section>
  )
}

interface PreparingTermCardProps {
  term: Term
  canEdit: boolean
  canStartHandover: boolean
  onEdit: () => void
  onEditPlan: () => void
  onStartHandover: () => void
}

function PreparingTermCard({ term, canEdit, canStartHandover, onEdit, onEditPlan, onStartHandover }: PreparingTermCardProps) {
  const plan = term.departmentPlan ?? []
  return (
    <section aria-labelledby="preparing-term-title" className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Nhiệm kỳ kế tiếp</p>
          <h2 id="preparing-term-title" className="text-lg font-bold tracking-tight">
            {term.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            Dự kiến {termPeriod(term)}
            {term.createdBy && ` · khai báo bởi ${term.createdBy.fullName}`}
          </p>
        </div>
        <StatusBadge term={term} />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold">Kế hoạch ban</h3>
          <p className="text-xs font-semibold text-muted-foreground">{planSummary(plan)}</p>
        </div>
        {plan.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có ban nào trong kế hoạch.</p>
        ) : (
          <ul aria-label="Kế hoạch ban" className="divide-y rounded-xl border">
            {plan.map((entry) => {
              const kind = planEntryKind(entry)
              return (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5">
                  <span className="min-w-0 text-sm">
                    {kind === 'RENAME' ? (
                      <>
                        <span className="text-muted-foreground">{entry.currentName}</span>
                        <ArrowRight aria-hidden className="mx-1 inline size-3.5 align-[-2px] text-muted-foreground" />
                        <span className="sr-only">đổi thành </span>
                        <span className="font-semibold">{entry.name}</span>
                      </>
                    ) : (
                      <span className={kind === 'DROP' ? 'text-muted-foreground line-through' : 'font-semibold'}>{entry.name}</span>
                    )}
                  </span>
                  <Badge tone={planEntryKindDisplay[kind].tone}>{planEntryKindDisplay[kind].label}</Badge>
                </li>
              )
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">Kế hoạch chỉ áp dụng khi bàn giao hoàn tất; cơ cấu đang chạy chưa đổi.</p>
      </div>

      {(canEdit || canStartHandover) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {canEdit && (
            <>
              <Button variant="outline" onClick={onEdit}>
                <Pencil aria-hidden />
                Sửa tên, ngày
              </Button>
              <Button variant="outline" onClick={onEditPlan}>
                <ListChecks aria-hidden />
                Sửa kế hoạch ban
              </Button>
            </>
          )}
          {canStartHandover && (
            <Button onClick={onStartHandover}>
              <ArrowRightLeft aria-hidden />
              Bắt đầu bàn giao
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

function PastTerms({ terms, positionsPath }: { terms: Term[]; positionsPath: (term: Term) => string }) {
  return (
    <section aria-labelledby="past-terms-title" className="space-y-3">
      <h2 id="past-terms-title" className="text-base font-bold">
        Nhiệm kỳ đã qua
      </h2>
      {terms.length === 0 ? (
        <EmptyState icon={History} title="Chưa có nhiệm kỳ nào đã đóng" description="Nhiệm kỳ kết thúc sau khi bàn giao xong sẽ nằm ở đây." />
      ) : (
        <motion.ul variants={listVariants} initial="initial" animate="animate" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {terms.map((term) => (
            <motion.li key={term.id} variants={itemVariants} className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{term.name}</p>
                  <p className="text-sm text-muted-foreground">{termPeriod(term)}</p>
                </div>
                <StatusBadge term={term} />
              </div>
              <Link
                to={positionsPath(term)}
                aria-label={`Xem chức vụ ${term.name}`}
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                Xem chức vụ
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </section>
  )
}

/** Trang Nhiệm kỳ (SRS 5.5): nhiệm kỳ đang phụ trách, nhiệm kỳ Chuẩn bị và các nhiệm kỳ đã qua. */
export function TermsPage() {
  const vm = useTermsPageViewModel()

  return (
    <div>
      <PageHeader
        eyebrow={vm.clubName}
        title="Nhiệm kỳ"
        description="Nhiệm kỳ đang chạy, nhiệm kỳ kế tiếp đang chuẩn bị và các nhiệm kỳ đã qua."
        actions={
          vm.canCreate && (
            <Button onClick={vm.openCreate}>
              <Plus aria-hidden />
              Khai báo nhiệm kỳ mới
            </Button>
          )
        }
      />

      {vm.loading && (
        <div className="space-y-4" role="status" aria-label="Đang tải nhiệm kỳ">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      )}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}

      {!vm.loading && !vm.error && (
        <motion.div variants={fadeVariants} initial="initial" animate="animate" className="grid grid-cols-1 gap-5">
          {vm.current ? (
            <CurrentTermCard
              term={vm.current}
              overdueHint={vm.canCreate ? 'Hãy khai báo nhiệm kỳ mới rồi bàn giao.' : vm.canStartHandover ? 'Hãy bắt đầu bàn giao sang nhiệm kỳ kế tiếp.' : null}
              handoverPath={vm.handoverPath(vm.current)}
            />
          ) : (
            <EmptyState icon={CalendarRange} title="CLB chưa có nhiệm kỳ đang chạy" />
          )}
          {vm.preparing ? (
            <PreparingTermCard
              term={vm.preparing}
              canEdit={vm.canEdit}
              canStartHandover={vm.canStartHandover}
              onEdit={() => vm.preparing && vm.openEdit(vm.preparing)}
              onEditPlan={vm.openPlan}
              onStartHandover={vm.openStart}
            />
          ) : (
            <p className="rounded-2xl border border-dashed bg-card/60 p-4 text-sm text-muted-foreground">
              {vm.canCreate ? 'Chưa có nhiệm kỳ kế tiếp. Khai báo khi gần hết nhiệm kỳ để chuẩn bị kế hoạch ban và bàn giao.' : 'Chưa có nhiệm kỳ kế tiếp.'}
              {vm.current && ` Nhiệm kỳ hiện tại kết thúc ngày ${formatDate(vm.current.endOn)}.`}
            </p>
          )}
          <PastTerms terms={vm.past} positionsPath={vm.positionsPath} />
        </motion.div>
      )}

      <TermFormSheet state={vm.termForm} clubName={vm.clubName} onClose={vm.closeTermForm} />
      <DepartmentPlanSheet term={vm.planTerm} onClose={vm.closePlan} />
      <ConfirmDialog
        open={vm.startOpen}
        onOpenChange={(open) => !open && vm.closeStart()}
        title="Bắt đầu bàn giao"
        description={`${vm.current?.name ?? 'Nhiệm kỳ hiện tại'} chuyển sang Đang bàn giao để bàn giao cho ${vm.preparing?.name ?? 'nhiệm kỳ mới'}.`}
        confirmLabel="Bắt đầu bàn giao"
        pending={vm.startPending}
        onConfirm={vm.confirmStart}
      >
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Ban chủ nhiệm hiện tại giữ nguyên quyền tới khi bàn giao hoàn tất.</li>
          <li>Trong lúc bàn giao không gán chức vụ thường trực mới; người của nhiệm kỳ mới ghi ở kết quả bầu.</li>
          <li>Không quay lại trạng thái Đang chạy được.</li>
        </ul>
      </ConfirmDialog>
    </div>
  )
}
