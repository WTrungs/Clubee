import { motion } from 'motion/react'
import { CalendarClock, CircleSlash, MessageSquareWarning } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatDateTime } from '@/shared/format/formatDate'
import { formatNumber } from '@/shared/format/formatMoney'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Avatar } from '@/shared/ui/Avatar'
import type { EventDetail } from '../model/eventTypes'
import { formatEventTime, scheduleChangeText } from '../viewModel/eventDisplay'
import { EventPlace } from './EventMeta'
import { StaffSignupCard } from './StaffSignupCard'

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <motion.div variants={itemVariants} className="space-y-1 rounded-xl border bg-card p-4">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </motion.div>
  )
}

function PersonLine({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar name={name} size="xs" />
      {name}
    </span>
  )
}

export function EventOverviewTab({ event }: { event: EventDetail }) {
  return (
    <div className="space-y-5">
      <StaffSignupCard event={event} />
      {event.status === 'DRAFT' && event.rejectionReason && (
        <p className="flex items-start gap-2 rounded-xl bg-status-warning-soft p-4 text-sm text-status-warning">
          <MessageSquareWarning aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-bold">Đề xuất bị từ chối: </span>
            {event.rejectionReason}
          </span>
        </p>
      )}
      {event.status === 'CANCELLED' && event.cancellationReason && (
        <p className="flex items-start gap-2 rounded-xl bg-status-danger-soft p-4 text-sm text-status-danger">
          <CircleSlash aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-bold">Lý do hủy: </span>
            {event.cancellationReason}
          </span>
        </p>
      )}

      {event.lastScheduleChange && (
        <p className="flex items-start gap-2 rounded-xl bg-status-info-soft p-4 text-sm text-status-info">
          <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 space-y-0.5">
            <span className="block font-bold">{scheduleChangeText(event.lastScheduleChange)}</span>
            <span className="block">Lý do: {event.lastScheduleChange.reason}</span>
            <span className="block text-xs">
              {event.lastScheduleChange.actor.fullName} dời lúc {formatDateTime(event.lastScheduleChange.at)}
            </span>
          </span>
        </p>
      )}

      {event.description && <p className="max-w-3xl leading-relaxed whitespace-pre-line text-muted-foreground">{event.description}</p>}

      <motion.dl variants={listVariants} initial="initial" animate="animate" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Thời gian">{formatEventTime(event)}</Fact>
        <Fact label={event.format === 'ONLINE' ? 'Hình thức' : 'Địa điểm'}>
          {event.format === 'ONLINE' && event.onlineUrl ? (
            <a href={event.onlineUrl} target="_blank" rel="noreferrer noopener" className="font-semibold text-primary hover:underline">
              Trực tuyến · mở liên kết
            </a>
          ) : (
            <EventPlace event={event} />
          )}
        </Fact>
        <Fact label="Số chỗ">{event.capacity === null ? 'Không giới hạn' : `${formatNumber(event.capacity)} chỗ`}</Fact>
        <Fact label="Hạn đăng ký">{event.registrationDeadline ? formatDateTime(event.registrationDeadline) : 'Đến khi bắt đầu'}</Fact>
        <Fact label="Trưởng BTC">{event.lead ? <PersonLine name={event.lead.fullName} /> : <span className="text-muted-foreground">Chưa chỉ định</span>}</Fact>
        <Fact label="Người đề xuất">
          <PersonLine name={event.proposer.fullName} />
        </Fact>
        {event.approver && (
          <Fact label="Người duyệt">
            <PersonLine name={event.approver.fullName} />
          </Fact>
        )}
        <Fact label="Mở cho khách">{event.openToGuests ? 'Có, đăng ký trên trang công khai' : 'Không, chỉ thành viên'}</Fact>
      </motion.dl>
    </div>
  )
}
