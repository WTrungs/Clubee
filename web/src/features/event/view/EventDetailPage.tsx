import { motion } from 'motion/react'
import { ArrowLeft, CalendarClock, CalendarCog, Lock, Send, ShieldCheck, ShieldX, Ticket, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { AttendancePanel } from '@/features/attendance/view/AttendancePanel'
import { FundPanel } from '@/features/finance/view/FundPanel'
import { duration, easeOut } from '@/shared/motion/presets'
import { Button } from '@/shared/ui/Button'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import { Tabs, TabsBar, TabsContent } from '@/shared/ui/Tabs'
import type { EventTransitionAction } from '../model/eventTypes'
import { eventActionLabel, formatEventTime } from '../viewModel/eventDisplay'
import { useEventDetailViewModel, type EventDetailViewModel } from '../viewModel/useEventDetailViewModel'
import { useRescheduleViewModel } from '../viewModel/useRescheduleViewModel'
import { EventCover } from './EventCover'
import { EventLifecycle } from './EventLifecycle'
import { EventPlace, EventStatusBadge } from './EventMeta'
import { EventOverviewTab } from './EventOverviewTab'
import { EventRegistrationTab } from './EventRegistrationTab'
import { EventStaffTab } from './EventStaffTab'
import { EventTransitionDialogs } from './EventTransitionDialogs'
import { RescheduleSheet } from './RescheduleSheet'

const actionIcon: Record<EventTransitionAction, ReactNode> = {
  SUBMIT: <Send aria-hidden />,
  APPROVE: <ShieldCheck aria-hidden />,
  REJECT: <ShieldX aria-hidden />,
  OPEN_REGISTRATION: <Ticket aria-hidden />,
  CANCEL: <XCircle aria-hidden />,
  CLOSE: <Lock aria-hidden />,
}

const actionVariant: Record<EventTransitionAction, 'primary' | 'outline'> = {
  SUBMIT: 'primary',
  APPROVE: 'primary',
  REJECT: 'outline',
  OPEN_REGISTRATION: 'primary',
  CANCEL: 'outline',
  CLOSE: 'primary',
}

function TransitionButton({ action, vm }: { action: EventTransitionAction; vm: EventDetailViewModel }) {
  return (
    <Button
      variant={actionVariant[action]}
      loading={vm.pendingAction === action && vm.dialog === null}
      disabled={vm.transitionPending}
      onClick={() => vm.requestTransition(action)}
      className={action === 'CANCEL' ? 'text-destructive' : undefined}
    >
      {actionIcon[action]}
      {eventActionLabel[action]}
    </Button>
  )
}

export function EventDetailPage() {
  const vm = useEventDetailViewModel()
  const event = vm.event
  const reschedule = useRescheduleViewModel(vm.clubId, event)

  if (vm.loading) {
    return (
      <div className="space-y-4" role="status" aria-label="Đang tải sự kiện">
        <Skeleton className="h-48 w-full rounded-3xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }
  if (vm.error || !event) return <ErrorState error={vm.error} onRetry={vm.refetch} />

  return (
    <div className="space-y-5">
      <Link to={`/clubs/${vm.clubId}/events`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        Tất cả sự kiện
      </Link>

      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.slow, ease: easeOut }}
        className="relative overflow-hidden rounded-3xl text-brand-foreground"
      >
        <EventCover seed={event.id} muted={event.status === 'CANCELLED'} className="absolute inset-0" />
        <div className="relative space-y-3 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-card px-1 py-0.5">
              <EventStatusBadge status={event.status} />
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-balance sm:text-4xl">{event.name}</h1>
          <div className="flex flex-col gap-1.5 text-sm font-medium sm:flex-row sm:flex-wrap sm:gap-x-5">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock aria-hidden className="size-4 shrink-0" />
              {formatEventTime(event)}
            </span>
            <EventPlace event={event} />
          </div>
        </div>
      </motion.header>

      <ConflictBanner show={vm.conflict} onReload={vm.reloadAfterConflict} />

      {(vm.transitions.length > 0 || vm.canReschedule) && (
        <div className="flex flex-wrap gap-2">
          {vm.transitions
            .filter((action) => action !== 'CANCEL')
            .map((action) => (
              <TransitionButton key={action} action={action} vm={vm} />
            ))}
          {vm.canReschedule && (
            <Button variant="outline" onClick={reschedule.openSheet} disabled={vm.transitionPending}>
              <CalendarCog aria-hidden />
              Dời thời gian
            </Button>
          )}
          {vm.transitions.includes('CANCEL') && <TransitionButton action="CANCEL" vm={vm} />}
        </div>
      )}

      <EventLifecycle steps={vm.steps} cancelled={event.status === 'CANCELLED'} />

      <Tabs value={vm.tab} onValueChange={vm.setTab}>
        <TabsBar items={vm.tabs.map((tab) => ({ value: tab.value, label: tab.label }))} active={vm.tab} aria-label="Nội dung sự kiện" />
        <TabsContent value="overview" className="pt-5">
          <EventOverviewTab event={event} />
        </TabsContent>
        {vm.canViewStaff && (
          <TabsContent value="staff" className="pt-5">
            <EventStaffTab event={event} clubId={vm.clubId} canManage={vm.canManageStaff} />
          </TabsContent>
        )}
        <TabsContent value="registrations" className="pt-5">
          <EventRegistrationTab event={event} vm={vm} />
        </TabsContent>
        {vm.canViewAttendance && (
          <TabsContent value="attendance" className="pt-5">
            <AttendancePanel activity={{ type: 'EVENT', clubId: vm.clubId, id: event.id }} />
          </TabsContent>
        )}
        {vm.fundId && (
          <TabsContent value="fund" className="pt-5">
            <FundPanel fundId={vm.fundId} />
          </TabsContent>
        )}
      </Tabs>

      <EventTransitionDialogs vm={vm} />
      <RescheduleSheet event={event} vm={reschedule} />
    </div>
  )
}
