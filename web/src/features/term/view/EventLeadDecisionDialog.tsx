import { useId } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { NativeSelect } from '@/shared/ui/Input'
import type { EventLeadAction, HandoverItem } from '../model/handoverTypes'
import { useEventLeadDecisionViewModel } from '../viewModel/useEventLeadDecisionViewModel'
import type { HandoverItemsViewModel } from '../viewModel/useHandoverItemsViewModel'

function DecisionForm({ item, items }: { item: HandoverItem; items: HandoverItemsViewModel }) {
  const formId = useId()
  const vm = useEventLeadDecisionViewModel(item)
  const choices: Array<{ value: EventLeadAction; label: string; hint: string; disabled: boolean }> = [
    {
      value: 'KEEP',
      label: 'Giữ Trưởng BTC hiện tại',
      hint: vm.lead ? vm.lead.fullName : 'Sự kiện chưa có Trưởng BTC đang hiệu lực.',
      disabled: !vm.canKeep,
    },
    { value: 'REPLACE', label: 'Thay Trưởng BTC', hint: 'Người mới nhận chức khi bàn giao hoàn tất.', disabled: false },
  ]

  return (
    <DialogContent
      title="Giữ hoặc thay Trưởng BTC"
      description={`${item.title}. Quyết định chỉ áp dụng khi bàn giao hoàn tất; tới lúc đó Trưởng BTC hiện tại vẫn giữ chức.`}
      footer={
        <>
          <Button variant="ghost" onClick={items.closeDecision} disabled={items.decisionPending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={items.decisionPending} disabled={!vm.canSubmit || (vm.action === 'REPLACE' && vm.candidatesLoading)}>
            Xác nhận mục này
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (vm.canSubmit) items.submitDecision(vm.request())
        }}
      >
        <fieldset className="space-y-2" disabled={items.decisionPending}>
          <legend className="mb-1.5 text-sm font-semibold">Trưởng BTC sau bàn giao</legend>
          <div className="grid grid-cols-1 gap-2">
            {choices.map(({ value, label, hint, disabled }) => (
              <label
                key={value}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3 transition-colors duration-200 hover:border-input',
                  'has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:ring-4 has-focus-visible:ring-primary/15',
                  disabled && 'cursor-not-allowed opacity-60 hover:border-border',
                )}
              >
                <input
                  type="radio"
                  name="event-lead-action"
                  value={value}
                  checked={vm.action === value}
                  disabled={disabled}
                  onChange={() => vm.setAction(value)}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span className="min-w-0 text-sm font-semibold">
                  {label}
                  <span className="block text-xs font-normal text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {vm.action === 'REPLACE' && (
          <FormField
            label="Trưởng BTC mới"
            required
            hint={vm.previousGone ? 'Người đã chọn lần trước không còn đủ điều kiện, hãy chọn người khác.' : 'Thành viên Thử việc hoặc Chính thức của CLB.'}
            error={vm.candidatesError ?? undefined}
          >
            <NativeSelect value={vm.selected} onChange={(event) => vm.setUserId(event.target.value)} disabled={vm.candidatesLoading || items.decisionPending}>
              <option value="">{vm.candidatesLoading ? 'Đang tải…' : vm.options.length === 0 ? 'Không có thành viên phù hợp' : 'Chọn người…'}</option>
              {vm.options.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.departmentName ? `${candidate.fullName} · Ban ${candidate.departmentName}` : candidate.fullName}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        )}
        <FormAlert message={items.decisionError} />
      </form>
    </DialogContent>
  )
}

/** FR-TERM-05: với sự kiện đang mở, ban chủ nhiệm mới chọn giữ hoặc thay Trưởng BTC khi xác nhận mục. */
export function EventLeadDecisionDialog({ items }: { items: HandoverItemsViewModel }) {
  const item = items.decisionItem
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && items.closeDecision()}>
      {item && <DecisionForm key={`${item.id}-${item.version}`} item={item} items={items} />}
    </Dialog>
  )
}
