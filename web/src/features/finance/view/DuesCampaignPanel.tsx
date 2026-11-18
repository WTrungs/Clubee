import { ArrowLeft, Lock, Pencil, Users } from 'lucide-react'
import { useId } from 'react'
import { formatDate, formatDateTime } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormField } from '@/shared/ui/FormField'
import { Input } from '@/shared/ui/Input'
import { FilterChip, Pagination, SearchInput } from '@/shared/ui/ListControls'
import { MoneyInput } from '@/shared/ui/MoneyInput'
import { ProgressBar } from '@/shared/ui/ProgressBar'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { DuesCampaignDetail, DuesItem } from '../model/duesTypes'
import { duesCampaignStatusDisplay, duesDeadlineText, duesDueText, duesItemStatusDisplay, duesProgressText } from '../viewModel/duesDisplay'
import { DUES_NAME_MAX } from '../viewModel/duesSchemas'
import { useDuesItemsViewModel, type DuesItemsViewModel } from '../viewModel/useDuesItemsViewModel'
import { ExemptionDialog } from './ExemptionDialog'

function EditDuesDialog({ vm }: { vm: DuesItemsViewModel }) {
  const formId = useId()
  const { register, formState } = vm.editForm
  return (
    <Dialog open={vm.dialog?.kind === 'EDIT'} onOpenChange={(open) => !open && vm.closeDialog()}>
      <DialogContent
        title="Sửa đợt đóng quỹ"
        description={vm.canEditAmount ? undefined : 'Đã có người nộp nên không đổi được mức đóng.'}
        footer={
          <>
            <Button variant="ghost" onClick={vm.closeDialog} disabled={vm.pending}>
              Hủy bỏ
            </Button>
            <Button type="submit" form={formId} loading={vm.pending}>
              Lưu
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={vm.submitEdit} className="space-y-4">
          <FormField label="Tên kỳ" required error={formState.errors.name?.message}>
            <Input maxLength={DUES_NAME_MAX} {...register('name')} />
          </FormField>
          <FormField label="Hạn nộp" required error={formState.errors.dueDate?.message}>
            <Input inputMode="numeric" placeholder="dd/mm/yyyy" {...register('dueDate')} />
          </FormField>
          <FormField label="Mức đóng mỗi người" required error={formState.errors.amount?.message}>
            <MoneyInput disabled={!vm.canEditAmount} {...register('amount')} />
          </FormField>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Summary({ campaign, vm }: { campaign: DuesCampaignDetail; vm: DuesItemsViewModel }) {
  const status = duesCampaignStatusDisplay[campaign.status]
  return (
    <section aria-label={`Đợt ${campaign.name}`} className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-xl font-bold break-words">{campaign.name}</h2>
          <p className="text-sm text-muted-foreground">
            {formatMoney(campaign.amount)} mỗi người · {duesDeadlineText(campaign.dueOn)}
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <ProgressBar value={campaign.settledCount} max={campaign.memberCount} label="Tiến độ thu" tone="success" />
      <p className="text-sm tabular-nums">{duesProgressText(campaign)}</p>
      <p className="text-xs text-muted-foreground">
        Mở bởi {campaign.openedBy.fullName}, {formatDateTime(campaign.openedAt)}
        {campaign.closedBy && campaign.closedAt ? `. Đóng bởi ${campaign.closedBy.fullName}, ${formatDateTime(campaign.closedAt)}.` : '.'}
      </p>
      {(vm.canEdit || vm.canClose) && (
        <div className="flex flex-wrap gap-2">
          {vm.canEdit && (
            <Button variant="outline" size="sm" onClick={vm.openEdit}>
              <Pencil aria-hidden />
              Sửa đợt
            </Button>
          )}
          {vm.canClose && (
            <Button variant="outline" size="sm" onClick={vm.openClose}>
              <Lock aria-hidden />
              Đóng đợt
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

function ExemptionNote({ item }: { item: DuesItem }) {
  if (!item.exemption) return null
  return <span className="block text-xs break-words text-muted-foreground">Lý do: {item.exemption.reason}</span>
}

function ItemAction({ item, vm }: { item: DuesItem; vm: DuesItemsViewModel }) {
  if (!vm.canExempt) return null
  return (
    <Button variant="ghost" size="sm" onClick={() => vm.openExemption(item)} aria-label={`Miễn giảm cho ${item.member.fullName}`}>
      Miễn giảm
    </Button>
  )
}

function ItemList({ vm, fullAmount }: { vm: DuesItemsViewModel; fullAmount: number }) {
  return (
    <>
      {/* Màn rộng: bảng; màn hẹp: thẻ. */}
      <table className="hidden w-full text-sm sm:table">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="px-3 py-2 font-medium">
              Thành viên
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Phải đóng
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Đã nộp
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Tình trạng
            </th>
            <th scope="col" className="px-3 py-2">
              <span className="sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {vm.items.map((item) => {
            const status = duesItemStatusDisplay[item.status]
            return (
              <tr key={item.id}>
                <td className="px-3 py-2">
                  <span className="block font-medium">{item.member.fullName}</span>
                  <span className="block text-xs text-muted-foreground">{item.departmentName ?? 'Chưa thuộc ban'}</span>
                </td>
                <td className="px-3 py-2">
                  {duesDueText(item, fullAmount)}
                  <ExemptionNote item={item} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.paidAmount)}</td>
                <td className="px-3 py-2">
                  <Badge tone={status.tone}>{status.label}</Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  <ItemAction item={item} vm={vm} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <ul className="divide-y sm:hidden" aria-label="Người trong đợt">
        {vm.items.map((item) => {
          const status = duesItemStatusDisplay[item.status]
          return (
            <li key={item.id} className="space-y-1.5 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{item.member.fullName}</span>
                  <span className="block text-xs text-muted-foreground">{item.departmentName ?? 'Chưa thuộc ban'}</span>
                </span>
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>
              <p className="text-sm">
                {duesDueText(item, fullAmount)} · đã nộp <span className="tabular-nums">{formatMoney(item.paidAmount)}</span>
              </p>
              <ExemptionNote item={item} />
              <ItemAction item={item} vm={vm} />
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** Một đợt đóng quỹ (FR-FIN-09): tiến độ, người phải đóng, miễn giảm, sửa và đóng đợt. */
export function DuesCampaignPanel({ campaignId, onBack }: { campaignId: string; onBack: () => void }) {
  const vm = useDuesItemsViewModel(campaignId)
  const campaign = vm.campaign
  const listId = useId()
  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft aria-hidden />
        Tất cả đợt
      </Button>
      {vm.loading && (
        <div role="status" aria-label="Đang tải đợt đóng quỹ">
          <Skeleton className="h-40 w-full" />
        </div>
      )}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {campaign && (
        <>
          <Summary campaign={campaign} vm={vm} />
          <section aria-labelledby={listId} className="rounded-2xl border bg-card shadow-sm">
            <header className="space-y-3 border-b p-4 sm:p-5">
              <h3 id={listId} className="flex items-center gap-2 font-bold">
                <Users aria-hidden className="size-5 text-muted-foreground" />
                Người phải đóng
              </h3>
              <SearchInput label="Tìm thành viên" placeholder="Tìm theo tên, ban…" value={vm.keyword} onValueChange={vm.setKeyword} className="sm:max-w-md" />
              <div role="group" aria-label="Lọc theo tình trạng" className="flex flex-wrap gap-2">
                {vm.filters.map((item) => (
                  <FilterChip key={item.key} label={item.label} selected={vm.filter === item.key} onToggle={() => vm.setFilter(item.key)} />
                ))}
              </div>
            </header>
            <div className="p-2">
              {vm.itemsLoading && (
                <div className="space-y-2 p-2" role="status" aria-label="Đang tải danh sách">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              )}
              {vm.itemsError && !vm.itemsLoading && <ErrorState error={vm.itemsError} onRetry={vm.refetchItems} className="border-0" />}
              {!vm.itemsLoading && !vm.itemsError && vm.items.length === 0 && (
                <EmptyState icon={Users} title="Không có ai phù hợp" description="Thử đổi bộ lọc hoặc từ khóa." className="border-0" />
              )}
              {!vm.itemsError && vm.items.length > 0 && <ItemList vm={vm} fullAmount={campaign.amount} />}
            </div>
          </section>
          <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />
          <EditDuesDialog vm={vm} />
          <ExemptionDialog vm={vm} />
          <ConfirmDialog
            open={vm.dialog?.kind === 'CLOSE'}
            onOpenChange={(open) => !open && vm.closeDialog()}
            title="Đóng đợt đóng quỹ"
            description={`Sau khi đóng, đợt ${campaign.name} không nhận thêm khoản nộp và không sửa được. Người chưa nộp vẫn nằm trong báo cáo. Hạn nộp là ${formatDate(campaign.dueOn)}.`}
            confirmLabel="Đóng đợt"
            pending={vm.pending}
            onConfirm={vm.confirmClose}
          />
        </>
      )}
    </div>
  )
}
