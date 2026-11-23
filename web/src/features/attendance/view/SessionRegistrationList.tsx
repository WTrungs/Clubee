import { motion } from 'motion/react'
import { UsersRound } from 'lucide-react'
import { RegistrationBadge } from '@/features/event/view/EventMeta'
import { formatDateTime } from '@/shared/format/formatDate'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Avatar } from '@/shared/ui/Avatar'
import { Pagination, SearchInput } from '@/shared/ui/ListControls'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { useSessionRegistrationsViewModel } from '../viewModel/useSessionRegistrationsViewModel'

/** Tab Đăng ký cho người phụ trách buổi (FR-ATT-03). */
export function SessionRegistrationList({ clubId, sessionId }: { clubId: string; sessionId: string }) {
  const list = useSessionRegistrationsViewModel(clubId, sessionId)
  return (
    <section aria-labelledby="session-registrations-heading" className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="session-registrations-heading" className="flex items-center gap-2 font-bold">
          <UsersRound aria-hidden className="size-4 text-muted-foreground" />
          Danh sách đăng ký
        </h2>
        <SearchInput label="Tìm người đăng ký" placeholder="Tìm theo tên…" value={list.keyword} onValueChange={list.setKeyword} className="sm:w-64" />
      </div>
      {list.loading && <Skeleton className="h-40 w-full rounded-2xl" />}
      {list.error && <ErrorState error={list.error} onRetry={list.refetch} />}
      {!list.loading && !list.error && list.rows.length === 0 && <EmptyState icon={UsersRound} title="Chưa có ai đăng ký" />}
      {!list.error && list.rows.length > 0 && (
        <motion.ul variants={listVariants} initial="initial" animate="animate" key={list.page} className="divide-y overflow-hidden rounded-2xl border bg-card">
          {list.rows.map((row, index) => (
            <motion.li key={row.id} variants={itemVariants} className="flex items-center gap-3 px-4 py-3">
              <span className="w-6 text-right text-xs text-muted-foreground tabular-nums">{list.page * list.pageSize + index + 1}</span>
              <Avatar name={row.attendee.fullName} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{row.attendee.fullName}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatDateTime(row.registeredAt)}
                  {row.promotedAt && ` · được đôn lúc ${formatDateTime(row.promotedAt)}`}
                </span>
              </span>
              <RegistrationBadge status={row.status} waitlistPosition={row.waitlistPosition} />
            </motion.li>
          ))}
        </motion.ul>
      )}
      <Pagination page={list.page} totalPages={list.totalPages} totalElements={list.totalElements} pageSize={list.pageSize} onPageChange={list.setPage} />
    </section>
  )
}
