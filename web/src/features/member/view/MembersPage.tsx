import { UserPlus, UsersRound } from 'lucide-react'
import { formatNumber } from '@/shared/format/formatMoney'
import { Button } from '@/shared/ui/Button'
import { Pagination } from '@/shared/ui/ListControls'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { Tabs, TabsBar, TabsContent } from '@/shared/ui/Tabs'
import { useJoinRequestsViewModel } from '../viewModel/useJoinRequestsViewModel'
import { useLeaveRequestsViewModel } from '../viewModel/useLeaveRequestsViewModel'
import { useMemberListViewModel, type MemberListViewModel } from '../viewModel/useMemberListViewModel'
import { useMembersPageViewModel } from '../viewModel/useMembersPageViewModel'
import { BacklogPanel } from './BacklogPanel'
import { InvitationsSheet } from './InvitationsSheet'
import { JoinRequestList } from './JoinRequestList'
import { LeaveRequestList } from './LeaveRequestList'
import { MemberDetailSheet } from './MemberDetailSheet'
import { MemberFiltersBar } from './MemberFiltersBar'
import { MemberTable } from './MemberTable'
import { MyMembershipCard } from './MyMembershipCard'

function MemberListPanel({ vm, onOpen }: { vm: MemberListViewModel; onOpen: (membershipId: string) => void }) {
  return (
    <div>
      <MemberFiltersBar vm={vm} />
      {vm.loading && (
        <div className="space-y-2.5" role="status" aria-label="Đang tải danh sách thành viên">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-16 rounded-2xl" />
          ))}
        </div>
      )}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {!vm.loading && !vm.error && vm.members.length === 0 && (
        <EmptyState
          icon={UsersRound}
          title="Không có thành viên phù hợp"
          description={vm.keyword || vm.activeCount > 0 ? 'Thử từ khóa khác hoặc bỏ bớt bộ lọc.' : 'CLB chưa có thành viên nào.'}
        />
      )}
      {!vm.loading && !vm.error && vm.members.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {formatNumber(vm.totalElements)} thành viên
          </p>
          <MemberTable members={vm.members} listKey={`${vm.page}-${vm.members.length}`} onOpen={(member) => onOpen(member.membershipId)} />
          <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />
        </div>
      )}
    </div>
  )
}

/** FR-MEM-04 danh sách thành viên và tư cách của tôi (FR-MEM-07); ban chủ nhiệm thêm tab yêu cầu gia nhập (FR-MEM-03), xin tạm nghỉ, tồn đọng (FR-MEM-09). */
export function MembersPage() {
  const page = useMembersPageViewModel()
  const list = useMemberListViewModel()
  const requests = useJoinRequestsViewModel()
  const leave = useLeaveRequestsViewModel()

  return (
    <div>
      <PageHeader
        eyebrow={page.clubName}
        title="Thành viên"
        description="Tên, ban và chức vụ của thành viên. Liên hệ, MSSV chỉ ban chủ nhiệm xem được."
        actions={
          page.canManage && (
            <Button onClick={page.openInvitations}>
              <UserPlus aria-hidden />
              Mời thành viên
            </Button>
          )
        }
      />
      <MyMembershipCard />
      {page.canManage ? (
        <Tabs value={page.tab} onValueChange={page.setTab}>
          <TabsBar
            aria-label="Thành viên và các yêu cầu"
            active={page.tab}
            items={[
              { value: 'members', label: 'Thành viên' },
              { value: 'requests', label: 'Yêu cầu gia nhập', count: requests.loading ? undefined : requests.totalElements },
              { value: 'leave', label: 'Xin tạm nghỉ', count: page.leavePendingCount },
              { value: 'backlog', label: 'Tồn đọng', count: page.backlogOpenCount },
            ]}
          />
          <TabsContent value="members" className="pt-5">
            <MemberListPanel vm={list} onOpen={page.openMember} />
          </TabsContent>
          <TabsContent value="requests" className="pt-5">
            <JoinRequestList vm={requests} />
          </TabsContent>
          <TabsContent value="leave" className="pt-5">
            <LeaveRequestList vm={leave} />
          </TabsContent>
          <TabsContent value="backlog" className="pt-5">
            <BacklogPanel formerMemberId={page.formerMemberId} clearFormer={page.clearFormer} />
          </TabsContent>
        </Tabs>
      ) : (
        <MemberListPanel vm={list} onOpen={page.openMember} />
      )}
      <MemberDetailSheet membershipId={page.selectedMemberId} onClose={page.closeMember} onOpenBacklog={page.canManage ? page.openBacklogOf : undefined} />
      {page.canManage && <InvitationsSheet open={page.invitationsOpen} onClose={page.closeInvitations} />}
    </div>
  )
}
