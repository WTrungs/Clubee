import { motion } from 'motion/react'
import { Link } from 'react-router'
import { Building2, Plus, UserPlus } from 'lucide-react'
import { PresidencyTransferBanner } from '@/features/account/view/PresidencyTransferBanner'
import { TransferMembersSheet } from '@/features/member/view/TransferMembersSheet'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Button } from '@/shared/ui/Button'
import { FilterChip } from '@/shared/ui/ListControls'
import { PageHeader } from '@/shared/ui/PageHeader'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { Tabs, TabsBar, TabsContent } from '@/shared/ui/Tabs'
import type { DepartmentStatus } from '../model/orgTypes'
import { useOrgStructureViewModel, type OrgStructureViewModel } from '../viewModel/useOrgStructureViewModel'
import { AssignPositionSheet } from './AssignPositionSheet'
import { BoardBlock } from './BoardBlock'
import { DepartmentNode } from './DepartmentNode'
import { DepartmentDetail } from './DepartmentDetail'
import { DepartmentFormSheet } from './DepartmentFormSheet'
import { OrgChart } from './OrgChart'
import { PermissionMatrixPanel } from './PermissionMatrixPanel'
import { PositionsPanel } from './PositionsPanel'
import { RevokePositionDialog } from './RevokePositionDialog'

const statusFilters: Array<{ value: DepartmentStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'CLOSED', label: 'Đã đóng' },
]

function SelectedDetail({ vm }: { vm: OrgStructureViewModel }) {
  const department = vm.selected
  if (!department) return null
  return (
    <DepartmentDetail
      clubId={vm.clubId}
      department={department}
      members={vm.members}
      membersLoading={vm.membersLoading}
      membersError={vm.membersError}
      onEdit={() => vm.openEditDepartment(department)}
      onClose={() => vm.requestClose(department)}
      onAssign={() => vm.openAssign({ role: 'DEPARTMENT_HEAD', departmentId: department.id })}
      onTransfer={() => vm.openTransfer(department)}
      onRevoke={vm.openRevoke}
    />
  )
}

/** Sơ đồ: ban chủ nhiệm, các ban (cây ở màn rộng, thẻ ở màn hẹp) và khung chi tiết ban ở màn rộng. */
function ChartTab({ vm, treeMode, wide }: { vm: OrgStructureViewModel; treeMode: boolean; wide: boolean }) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold">{vm.status === 'ACTIVE' ? 'Sơ đồ CLB' : 'Ban đã đóng'}</h2>
        <div role="group" aria-label="Lọc ban theo trạng thái" className="flex flex-wrap gap-2">
          {statusFilters.map((filter) => (
            <FilterChip key={filter.value} label={filter.label} selected={vm.status === filter.value} onToggle={() => vm.setStatus(filter.value)} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <PresidencyTransferBanner />
          <BoardBlock clubName={vm.clubName} term={vm.term} board={vm.board} loading={vm.boardLoading} error={vm.boardError} onRevoke={vm.openRevoke} />
          {/* Màn rộng vẽ cây nối thẳng từ khối CLB; màn hẹp và ban đã đóng thành danh sách thẻ. */}
          {!vm.loading && !vm.error && treeMode && vm.departments.length > 0 && (
            <OrgChart departments={vm.departments} selectedId={vm.selectedId} onSelect={vm.select} />
          )}
          <div className={treeMode && vm.departments.length > 0 ? undefined : 'mt-5'}>
            {vm.loading && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="status" aria-label="Đang tải danh sách ban">
                {[0, 1, 2, 3].map((item) => (
                  <Skeleton key={item} className="h-28 rounded-2xl" />
                ))}
              </div>
            )}
            {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
            {!vm.loading && !vm.error && vm.departments.length === 0 && (
              <EmptyState
                icon={Building2}
                title={vm.status === 'ACTIVE' ? 'Chưa có ban chuyên môn' : 'Chưa có ban nào đã đóng'}
                description={vm.status === 'ACTIVE' ? 'Ban chủ nhiệm khai báo ban để phân công thành viên.' : 'Ban được gộp hoặc bỏ sẽ nằm ở đây để tra cứu.'}
              />
            )}
            {!vm.loading && !vm.error && !treeMode && vm.departments.length > 0 && (
              <motion.ul
                key={vm.status}
                variants={listVariants}
                initial="initial"
                animate="animate"
                aria-label={vm.status === 'ACTIVE' ? 'Ban chuyên môn' : 'Ban đã đóng'}
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"
              >
                {vm.departments.map((department) => (
                  <motion.li key={department.id} variants={itemVariants}>
                    <DepartmentNode department={department} selected={vm.selectedId === department.id} onSelect={() => vm.select(department.id)} />
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </div>
        </div>

        {wide && (
          <aside aria-label="Chi tiết ban" className="sticky top-20 max-h-[calc(100dvh-6rem)] self-start overflow-y-auto rounded-2xl border bg-card p-5 shadow-sm">
            {vm.selected ? <SelectedDetail vm={vm} /> : <p className="text-sm text-muted-foreground">Chọn một ban để xem người phụ trách và thành viên.</p>}
          </aside>
        )}
      </div>
    </>
  )
}

/** Màn Cơ cấu: sơ đồ ban chủ nhiệm, ban chuyên môn, người phụ trách (FR-ORG-01, 02, 03) và tra cứu chức vụ (FR-ORG-06). */
export function OrgStructurePage() {
  const vm = useOrgStructureViewModel()
  const wide = useMediaQuery('(min-width: 1024px)')
  // Cây cần đủ chỗ cho hai ban mỗi hàng bên cạnh khung chi tiết, nên chỉ vẽ từ 1280 px; hẹp hơn thì thành danh sách.
  const roomy = useMediaQuery('(min-width: 1280px)')
  const treeMode = roomy && vm.status === 'ACTIVE'

  return (
    <div>
      <PageHeader
        eyebrow={vm.clubName}
        title="Cơ cấu"
        description="Ban chủ nhiệm, các ban chuyên môn và người phụ trách trong nhiệm kỳ."
        actions={
          vm.canManage && (
            <div className="flex flex-col gap-2 sm:flex-row">
              {vm.canAssign && (
                <Button variant="outline" onClick={() => vm.openAssign()}>
                  <UserPlus aria-hidden />
                  Gán chức vụ
                </Button>
              )}
              <Button onClick={vm.openCreateDepartment}>
                <Plus aria-hidden />
                Thêm ban
              </Button>
            </div>
          )
        }
      />

      {vm.termOverdue && (
        <p role="status" className="mb-4 rounded-xl bg-status-warning-soft p-3 text-sm font-medium text-status-warning">
          Nhiệm kỳ đã quá ngày kết thúc nên chưa gán chức vụ thường trực mới.
          {vm.canManage && (
            <>
              {' '}
              Bàn giao nhiệm kỳ ở{' '}
              <Link to={vm.termsPath} className="underline underline-offset-2">
                trang Nhiệm kỳ
              </Link>{' '}
              rồi ghi người mới ở kết quả bầu.
            </>
          )}
        </p>
      )}
      {vm.term?.status === 'HANDING_OVER' && (
        <p role="status" className="mb-4 rounded-xl bg-status-warning-soft p-3 text-sm font-medium text-status-warning">
          CLB đang bàn giao nhiệm kỳ. Ban chủ nhiệm hiện tại giữ quyền tới khi bàn giao xong; người của nhiệm kỳ mới ghi ở kết quả bầu.
        </p>
      )}

      <Tabs value={vm.tab} onValueChange={vm.setTab}>
        <TabsBar
          aria-label="Cơ cấu CLB"
          active={vm.tab}
          items={[
            { value: 'chart', label: 'Sơ đồ' },
            { value: 'positions', label: 'Chức vụ' },
            ...(vm.canViewPermissions ? [{ value: 'permissions', label: 'Phân quyền' }] : []),
          ]}
        />
        <TabsContent value="chart" className="pt-5">
          <ChartTab vm={vm} treeMode={treeMode} wide={wide} />
        </TabsContent>
        <TabsContent value="positions" className="pt-5">
          <PositionsPanel active={vm.tab === 'positions'} />
        </TabsContent>
        {vm.canViewPermissions && (
          <TabsContent value="permissions" className="pt-5">
            <PermissionMatrixPanel active={vm.tab === 'permissions'} />
          </TabsContent>
        )}
      </Tabs>

      {!wide && (
        <Sheet open={vm.selected !== null} onOpenChange={(open) => !open && vm.select(null)}>
          <SheetContent title={vm.selected ? `Ban ${vm.selected.name}` : 'Chi tiết ban'} hideHeader>
            <div className="p-5">
              <SelectedDetail vm={vm} />
            </div>
          </SheetContent>
        </Sheet>
      )}

      <DepartmentFormSheet state={vm.departmentForm} clubName={vm.clubName} onClose={vm.closeDepartmentForm} />
      <AssignPositionSheet preset={vm.assign} clubName={vm.clubName} onClose={vm.closeAssign} />
      <RevokePositionDialog position={vm.revoking} onClose={vm.closeRevoke} />
      <TransferMembersSheet
        source={vm.transferring}
        members={vm.members}
        membersLoading={vm.membersLoading}
        membersError={vm.membersError}
        onRetryMembers={vm.refetchMembers}
        onClose={vm.closeTransfer}
      />
      <ReasonDialog
        open={vm.closing !== null}
        onOpenChange={(open) => !open && vm.cancelClose()}
        title="Đóng ban"
        description={`Ban ${vm.closing?.name ?? ''} chuyển sang Đã đóng, không xóa và vẫn tra cứu được. Ban còn thành viên hoặc chức vụ thì chưa đóng được.`}
        confirmLabel="Đóng ban"
        confirmVariant="destructive"
        pending={vm.closePending}
        onConfirm={vm.confirmClose}
      />
    </div>
  )
}
