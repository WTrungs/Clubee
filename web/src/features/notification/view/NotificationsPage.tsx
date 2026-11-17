import { motion } from 'motion/react'
import { BellOff, CheckCheck, SearchX } from 'lucide-react'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Button } from '@/shared/ui/Button'
import { FilterChip, Pagination, SearchInput } from '@/shared/ui/ListControls'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { Tabs, TabsBar } from '@/shared/ui/Tabs'
import { NOTIFICATION_CATEGORIES, notificationCategoryDisplay } from '../viewModel/notificationDisplay'
import { useNotificationInboxViewModel } from '../viewModel/useNotificationInboxViewModel'
import { NotificationDetailSheet } from './NotificationDetailSheet'
import { NotificationItem } from './NotificationItem'

/** FR-NOT-03: hộp thông báo gộp mọi CLB. */
export function NotificationsPage() {
  const vm = useNotificationInboxViewModel()
  return (
    <div>
      <PageHeader
        title="Thông báo"
        description="Thông báo từ mọi CLB bạn tham gia. Mở thông báo thì trang liên quan kiểm tra lại quyền của bạn."
        actions={
          <Button variant="outline" onClick={vm.markAllRead} loading={vm.markingAll} disabled={vm.unreadCount === 0} className="w-full sm:w-auto">
            <CheckCheck aria-hidden />
            Đánh dấu đã đọc tất cả
          </Button>
        }
      />

      <Tabs value={vm.tab} onValueChange={vm.setTab}>
        <TabsBar
          aria-label="Lọc thông báo"
          active={vm.tab}
          items={[
            { value: 'all', label: 'Tất cả' },
            { value: 'unread', label: 'Chưa đọc', count: vm.unreadCount },
          ]}
        />
      </Tabs>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput label="Tìm thông báo" placeholder="Tìm theo tiêu đề, tên CLB…" value={vm.keyword} onValueChange={vm.setKeyword} className="w-full lg:w-72" />
        <div role="group" aria-label="Lọc theo loại" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {NOTIFICATION_CATEGORIES.map((category) => (
            <FilterChip key={category} label={notificationCategoryDisplay[category].label} selected={vm.category === category} onToggle={() => vm.toggleCategory(category)} />
          ))}
        </div>
      </div>

      <section className="mt-4 rounded-2xl border bg-card p-2 shadow-sm">
        {vm.loading && (
          <div className="space-y-2 p-2" role="status" aria-label="Đang tải thông báo">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}
        {vm.error && !vm.loading && <ErrorState error={vm.error} onRetry={vm.retry} className="border-0" />}
        {!vm.loading && !vm.error && vm.items.length === 0 && (
          <EmptyState
            icon={vm.filtered ? SearchX : BellOff}
            title={vm.filtered ? 'Không có thông báo phù hợp' : 'Chưa có thông báo nào'}
            description={vm.filtered ? 'Thử bỏ bớt bộ lọc hoặc từ khóa.' : 'Khi có việc mới, sự kiện hay thay đổi chức vụ liên quan đến bạn, thông báo sẽ hiện ở đây.'}
            className="border-0"
          />
        )}
        {!vm.error && vm.items.length > 0 && (
          <motion.ul key={`${vm.tab}-${vm.category ?? ''}-${vm.page}`} variants={listVariants} initial="initial" animate="animate" className="divide-y">
            {vm.items.map((item) => (
              <motion.li key={item.id} variants={itemVariants} className="py-1">
                <NotificationItem item={item} onOpen={vm.open} />
              </motion.li>
            ))}
          </motion.ul>
        )}
      </section>

      <Pagination className="mt-4" page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />
      <NotificationDetailSheet id={vm.openedId} onClose={vm.closeDetail} />
    </div>
  )
}
