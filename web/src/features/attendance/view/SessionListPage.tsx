import { motion } from 'motion/react'
import { CalendarPlus, CalendarX2 } from 'lucide-react'
import { listVariants } from '@/shared/motion/presets'
import { Button } from '@/shared/ui/Button'
import { NativeSelect } from '@/shared/ui/Input'
import { Pagination, SearchInput } from '@/shared/ui/ListControls'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { Tabs, TabsBar } from '@/shared/ui/Tabs'
import { SESSION_TABS, useSessionListViewModel } from '../viewModel/useSessionListViewModel'
import { SessionCard } from './SessionCard'
import { SessionFormSheet } from './SessionFormSheet'

export function SessionListPage() {
  const vm = useSessionListViewModel()
  const filtered = vm.keyword !== '' || vm.scopeFilter !== ''

  return (
    <div>
      <PageHeader
        eyebrow={vm.clubName}
        title="Sinh hoạt"
        description="Buổi sinh hoạt của CLB và các ban."
        actions={
          vm.scopes.length > 0 && (
            <Button onClick={() => vm.setFormOpen(true)}>
              <CalendarPlus aria-hidden />
              Tạo buổi
            </Button>
          )
        }
      />

      <Tabs value={vm.when} onValueChange={vm.setWhen} className="mb-4">
        <TabsBar items={SESSION_TABS} active={vm.when} aria-label="Thời gian" />
      </Tabs>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <SearchInput label="Tìm buổi sinh hoạt" placeholder="Tìm theo tên, địa điểm…" value={vm.keyword} onValueChange={vm.setKeyword} className="sm:max-w-md sm:flex-1" />
        <NativeSelect aria-label="Lọc theo phạm vi" value={vm.scopeFilter} onChange={(event) => vm.setScopeFilter(event.target.value)} className="sm:w-56">
          <option value="">Mọi phạm vi</option>
          <option value="CLUB">Toàn CLB</option>
          {vm.departments.map((department) => (
            <option key={department.id} value={department.id}>
              Ban {department.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      {vm.scopesError && (
        <p role="alert" className="-mt-2 mb-5 flex flex-wrap items-center gap-2 text-sm text-status-danger">
          Không tải được quyền tạo buổi: {vm.scopesError}
          <Button variant="link" size="sm" onClick={vm.retryScopes}>
            Thử lại
          </Button>
        </p>
      )}
      {vm.departmentsError && (
        <p role="alert" className="-mt-2 mb-5 flex flex-wrap items-center gap-2 text-sm text-status-danger">
          Không tải được danh sách ban để lọc: {vm.departmentsError}
          <Button variant="link" size="sm" onClick={vm.retryDepartments}>
            Thử lại
          </Button>
        </p>
      )}

      {vm.loading && (
        <div className="grid gap-3 lg:grid-cols-2" role="status" aria-label="Đang tải buổi sinh hoạt">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-32 rounded-2xl" />
          ))}
        </div>
      )}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {!vm.loading && !vm.error && vm.sessions.length === 0 && (
        <EmptyState
          icon={CalendarX2}
          title={vm.when === 'UPCOMING' ? 'Chưa có buổi sắp tới' : 'Chưa có buổi đã qua'}
          description={filtered ? 'Thử từ khóa hoặc phạm vi khác.' : vm.when === 'UPCOMING' ? 'Buổi mới tạo sẽ hiện ở đây.' : 'Buổi đã kết thúc sẽ hiện ở đây.'}
        />
      )}
      {!vm.loading && vm.sessions.length > 0 && (
        <motion.ul key={`${vm.when}-${vm.page}`} variants={listVariants} initial="initial" animate="animate" className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {vm.sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </motion.ul>
      )}
      <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />

      <SessionFormSheet clubId={vm.clubId} clubName={vm.clubName} scopes={vm.scopes} open={vm.formOpen} onOpenChange={vm.setFormOpen} />
    </div>
  )
}
