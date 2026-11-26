import { motion } from 'motion/react'
import {
  AlarmClock,
  ArrowRight,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ClipboardList,
  Flag,
  Megaphone,
  PencilLine,
  Power,
  Settings2,
  SlidersHorizontal,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ClubMonogram } from '@/features/account/view/ClubMonogram'
import { EventStatusBadge } from '@/features/event/view/EventMeta'
import { formatEventTime } from '@/features/event/viewModel/eventDisplay'
import { ComposeAnnouncementSheet } from '@/features/notification/view/ComposeAnnouncementSheet'
import { clubStatusDisplay } from '../viewModel/clubStatusDisplay'
import { ClubStatusDialog } from './ClubStatusDialog'
import { DueLabel, TaskStatusBadge } from '@/features/task/view/TaskMeta'
import { formatDate } from '@/shared/format/formatDate'
import { cn } from '@/shared/lib/cn'
import { duration, easeOut, itemVariants, listVariants } from '@/shared/motion/presets'
import { AnimatedNumber } from '@/shared/ui/AnimatedNumber'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/DropdownMenu'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { Tone } from '@/shared/ui/tone'
import { toneVariants } from '@/shared/ui/tone'
import { useClubOverviewViewModel } from '../viewModel/useClubOverviewViewModel'
import { ClubAboutPanel } from './ClubAboutPanel'
import { ClubProfileSheet } from './ClubProfileSheet'
import { ClubSettingsSheet } from './ClubSettingsSheet'

function StatCard({ icon: Icon, label, value, tone, loading }: { icon: LucideIcon; label: string; value: number; tone: Tone; loading: boolean }) {
  return (
    <motion.li variants={itemVariants} whileHover={{ y: -3 }} className="flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-sm">
      <span className={cn('inline-flex size-12 shrink-0 items-center justify-center rounded-2xl', toneVariants({ tone }))}>
        <Icon aria-hidden className="size-6" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-muted-foreground">{label}</span>
        {loading ? <Skeleton className="mt-1 h-7 w-12" /> : <AnimatedNumber value={value} className="block text-2xl font-extrabold tabular-nums" />}
      </span>
    </motion.li>
  )
}

function Panel({ title, icon: Icon, action, children }: { title: string; icon: LucideIcon; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col rounded-2xl border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <h2 className="flex items-center gap-2 font-bold">
          <Icon aria-hidden className="size-5 text-muted-foreground" />
          {title}
        </h2>
        {action}
      </header>
      <div className="flex-1 p-3">{children}</div>
    </section>
  )
}

export function ClubOverviewPage() {
  const vm = useClubOverviewViewModel()
  const { club } = vm

  return (
    <div className="space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.slow, ease: easeOut }}
        className="rounded-3xl bg-brand p-6 text-brand-foreground sm:p-8"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {club.logoUrl && <ClubMonogram clubId={club.id} shortName={club.shortName} logoUrl={club.logoUrl} className="size-12 rounded-2xl border-0" />}
              <p className="min-w-0 text-sm font-semibold opacity-90">
                {club.field} · {club.shortName} · {club.currentTermName}
              </p>
              {club.status !== 'ACTIVE' && (
                <Badge tone={clubStatusDisplay[club.status].tone} dot>
                  {clubStatusDisplay[club.status].label}
                </Badge>
              )}
            </div>
            {(vm.canSendAnnouncement || vm.canManageClub) && (
              <div className="flex flex-wrap gap-2">
                {vm.canSendAnnouncement && (
                  <Button variant="secondary" size="sm" onClick={vm.openCompose}>
                    <Megaphone aria-hidden />
                    Gửi thông báo
                  </Button>
                )}
                {vm.canManageClub && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="secondary" size="sm" className="max-sm:aspect-square max-sm:px-0">
                        <Settings2 aria-hidden />
                        {/* Màn hẹp chỉ hiện biểu tượng để hai nút nằm một hàng; tên đọc màn hình giữ nguyên. */}
                        <span className="max-sm:sr-only">Quản lý CLB</span>
                        <ChevronDown aria-hidden className="max-sm:hidden" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {vm.canEditClub && (
                        <>
                          <DropdownMenuItem onSelect={vm.openProfile}>
                            <PencilLine aria-hidden />
                            Sửa hồ sơ CLB
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={vm.openSettings}>
                            <SlidersHorizontal aria-hidden />
                            Tham số CLB
                          </DropdownMenuItem>
                        </>
                      )}
                      {vm.canChangeStatus && (
                        <DropdownMenuItem onSelect={vm.openStatus}>
                          <Power aria-hidden />
                          Đổi trạng thái CLB
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-balance sm:text-4xl">{club.name}</h1>
          <p className="max-w-2xl text-sm opacity-90 sm:text-base">{club.description}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-bold">
            {club.myPositionTitles.length > 0 ? (
              club.myPositionTitles.map((title) => (
                <span key={title} className="rounded-full bg-brand-foreground/15 px-3 py-1">
                  {title}
                </span>
              ))
            ) : (
              <span className="rounded-full bg-brand-foreground/15 px-3 py-1">Thành viên, không giữ chức vụ</span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-foreground/15 px-3 py-1">
              <Flag aria-hidden className="size-3.5" />
              Thành lập {formatDate(club.foundedOn)}
            </span>
          </div>
        </div>
      </motion.section>

      <motion.ul variants={listVariants} initial="initial" animate="animate" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ClipboardList} label="Việc của tôi đang mở" value={vm.stats.openTasks} tone="progress" loading={vm.statsLoading} />
        <StatCard icon={AlarmClock} label="Việc quá hạn" value={vm.stats.overdueTasks} tone={vm.stats.overdueTasks > 0 ? 'danger' : 'success'} loading={vm.statsLoading} />
        <StatCard icon={CalendarRange} label="Sự kiện sắp tới" value={vm.stats.upcomingEvents} tone="info" loading={vm.statsLoading} />
        <StatCard icon={UsersRound} label="Thành viên" value={vm.stats.members} tone="warning" loading={false} />
      </motion.ul>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel
          title="Việc gần hạn nhất"
          icon={ClipboardList}
          action={
            <Link to="/me/tasks" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Tất cả
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          }
        >
          {vm.tasksLoading && (
            <div className="space-y-2 p-2" role="status" aria-label="Đang tải công việc">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          )}
          {vm.tasksError && <ErrorState error={vm.tasksError} onRetry={vm.retryTasks} className="border-0" />}
          {!vm.tasksLoading && !vm.tasksError && vm.nearestTasks.length === 0 && (
            <EmptyState icon={ClipboardList} title="Không có việc đang mở" description="Bạn đã xong hết việc ở CLB này." className="border-0" />
          )}
          {vm.nearestTasks.length > 0 && (
            <motion.ul variants={listVariants} initial="initial" animate="animate" className="space-y-1">
              {vm.nearestTasks.map((task) => (
                <motion.li key={task.id} variants={itemVariants}>
                  <Link
                    to={`/me/tasks?task=${encodeURIComponent(task.id)}&taskClub=${encodeURIComponent(task.clubId)}`}
                    className="flex flex-col gap-1.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted sm:flex-row sm:items-center sm:gap-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{task.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{task.scope.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <TaskStatusBadge status={task.status} />
                      <DueLabel dueAt={task.dueAt} overdue={task.overdue} dueSoon={task.dueSoon} announceDueSoon done={false} />
                    </span>
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </Panel>

        <Panel
          title="Sự kiện sắp tới"
          icon={CalendarDays}
          action={
            <Link to={`/clubs/${club.id}/events`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Tất cả
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          }
        >
          {vm.eventsLoading && (
            <div className="space-y-2 p-2" role="status" aria-label="Đang tải sự kiện">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}
          {vm.eventsError && <ErrorState error={vm.eventsError} onRetry={vm.retryEvents} className="border-0" />}
          {!vm.eventsLoading && !vm.eventsError && vm.upcoming.length === 0 && (
            <EmptyState icon={CalendarDays} title="Chưa có sự kiện sắp tới" className="border-0" />
          )}
          {vm.upcoming.length > 0 && (
            <motion.ul variants={listVariants} initial="initial" animate="animate" className="space-y-1">
              {vm.upcoming.map((event) => (
                <motion.li key={event.id} variants={itemVariants}>
                  <Link to={`/clubs/${club.id}/events/${event.id}`} className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{event.name}</span>
                      <span className="block text-xs text-muted-foreground">{formatEventTime(event)}</span>
                    </span>
                    <EventStatusBadge status={event.status} />
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </Panel>
      </div>

      <ClubAboutPanel club={club} />
      <ClubProfileSheet open={vm.profileOpen} onClose={vm.closeProfile} />
      <ClubSettingsSheet open={vm.settingsOpen} onClose={vm.closeSettings} />
      <ComposeAnnouncementSheet open={vm.composeOpen} onClose={vm.closeCompose} />
      <ClubStatusDialog open={vm.statusOpen} onClose={vm.closeStatus} />
    </div>
  )
}
