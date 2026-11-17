import { RefreshCw } from 'lucide-react'
import { getErrorMessage } from '@/api/apiError'
import { Button } from '@/shared/ui/Button'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Tabs, TabsBar, TabsContent } from '@/shared/ui/Tabs'
import { useFinancePageViewModel } from '../viewModel/useFinancePageViewModel'
import { EventFundList } from './EventFundList'
import { FundPanel } from './FundPanel'

/** FR-FIN-06: sổ Quỹ chung cho mọi thành viên (SRS 3.5); ban chủ nhiệm và BTC xem thêm quỹ sự kiện (FR-FIN-11). */
export function FinancePage() {
  const vm = useFinancePageViewModel()
  return (
    <div>
      <PageHeader title="Tài chính" description={`Sổ quỹ của ${vm.clubName}. Mọi thành viên xem được các khoản thu, chi đã ghi sổ của Quỹ chung.`} />
      {vm.eventFundsError && (
        <div role="alert" className="mb-4 flex flex-col gap-2 rounded-xl bg-status-warning-soft p-3 text-sm text-status-warning sm:flex-row sm:items-center">
          <p className="flex-1">Không tải được danh sách quỹ sự kiện: {getErrorMessage(vm.eventFundsError)}</p>
          <Button variant="outline" size="sm" onClick={vm.retryEventFunds} className="self-start sm:self-auto">
            <RefreshCw aria-hidden />
            Thử lại
          </Button>
        </div>
      )}
      {/* Luôn giữ cùng cấu trúc Tabs để sổ Quỹ chung không bị gắn lại khi biết có quỹ sự kiện. */}
      <Tabs value={vm.view} onValueChange={vm.setView}>
        {vm.hasEventFunds && (
          <TabsBar
            aria-label="Chọn quỹ"
            active={vm.view}
            className="mb-5"
            items={[
              { value: 'general', label: 'Quỹ chung' },
              { value: 'events', label: 'Quỹ sự kiện', count: vm.eventFundCount },
            ]}
          />
        )}
        <TabsContent value="general">
          <FundPanel fundId={vm.generalFundId} />
        </TabsContent>
        {vm.hasEventFunds && (
          <TabsContent value="events">
            <EventFundList vm={vm} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
