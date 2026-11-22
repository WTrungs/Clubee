import { RefreshCw } from 'lucide-react'
import { getErrorMessage } from '@/api/apiError'
import { Button } from '@/shared/ui/Button'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Tabs, TabsBar, TabsContent } from '@/shared/ui/Tabs'
import { useFinancePageViewModel } from '../viewModel/useFinancePageViewModel'
import { useDuesCampaignsViewModel } from '../viewModel/useDuesCampaignsViewModel'
import { DuesCampaignList } from './DuesCampaignList'
import { DuesCampaignPanel } from './DuesCampaignPanel'
import { EventFundList } from './EventFundList'
import { FinanceReportPanel } from './FinanceReportPanel'
import { FundPanel } from './FundPanel'
import { MyDuesPanel } from './MyDuesPanel'
import { OpenDuesSheet } from './OpenDuesSheet'

/** Tab Đóng quỹ: danh sách đợt, hoặc một đợt khi URL có `?dues=`. */
function DuesTab({ active }: { active: boolean }) {
  const vm = useDuesCampaignsViewModel(active)
  return (
    <>
      {vm.openedCampaignId ? <DuesCampaignPanel campaignId={vm.openedCampaignId} onBack={vm.backToList} /> : <DuesCampaignList vm={vm} />}
      <OpenDuesSheet
        open={vm.openSheet}
        onClose={() => vm.setOpenSheet(false)}
        onOpened={(campaignId) => {
          vm.setOpenSheet(false)
          vm.openCampaign(campaignId)
        }}
      />
    </>
  )
}

/** FR-FIN-06: sổ Quỹ chung cho mọi thành viên (SRS 3.5); quỹ sự kiện (FR-FIN-11); tab Đóng quỹ của ban chủ nhiệm (FR-FIN-09); khoản đóng của tôi (FR-FIN-13). */
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
        <TabsBar
          aria-label="Chọn quỹ"
          active={vm.view}
          className="mb-5"
          items={[
            { value: 'general', label: 'Quỹ chung' },
            ...(vm.hasEventFunds ? [{ value: 'events', label: 'Quỹ sự kiện', count: vm.eventFundCount }] : []),
            ...(vm.canViewDues ? [{ value: 'dues', label: 'Đóng quỹ' }] : []),
            ...(vm.canViewReport ? [{ value: 'report', label: 'Báo cáo' }] : []),
            { value: 'mine', label: 'Khoản đóng của tôi' },
          ]}
        />
        <TabsContent value="general">
          <FundPanel fundId={vm.generalFundId} />
        </TabsContent>
        {vm.hasEventFunds && (
          <TabsContent value="events">
            <EventFundList vm={vm} />
          </TabsContent>
        )}
        {vm.canViewDues && (
          <TabsContent value="dues">
            <DuesTab active={vm.view === 'dues'} />
          </TabsContent>
        )}
        {vm.canViewReport && (
          <TabsContent value="report">
            <FinanceReportPanel active={vm.view === 'report'} />
          </TabsContent>
        )}
        <TabsContent value="mine">
          <MyDuesPanel clubId={vm.clubId} active={vm.view === 'mine'} highlightId={vm.highlightDuesId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
