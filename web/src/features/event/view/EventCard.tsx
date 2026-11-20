import { motion } from 'motion/react'
import { CalendarClock, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import { formatNumber } from '@/shared/format/formatMoney'
import { itemVariants } from '@/shared/motion/presets'
import { ProgressBar } from '@/shared/ui/ProgressBar'
import type { EventSummary } from '../model/eventTypes'
import { formatEventTime, seatInfo } from '../viewModel/eventDisplay'
import { EventCover } from './EventCover'
import { DateBlock, EventPlace, EventStatusBadge, RegistrationBadge } from './EventMeta'

export function EventCard({ event }: { event: EventSummary }) {
  const seats = seatInfo(event)
  const inactive = event.status === 'CANCELLED' || event.status === 'ENDED' || event.status === 'CLOSED' || event.status === 'SETTLED'

  return (
    <motion.li variants={itemVariants} layout>
      <Link
        to={`/clubs/${event.clubId}/events/${event.id}`}
        className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
      >
        <span className="relative block h-28 overflow-hidden">
          <EventCover seed={event.id} muted={inactive} className="absolute inset-0" />
          <DateBlock startAt={event.startAt} className="absolute top-3 left-3" />
          <span className="absolute top-3 right-3">
            <EventStatusBadge status={event.status} />
          </span>
        </span>
        <span className="flex flex-1 flex-col gap-3 p-4">
          <span className="block text-base leading-snug font-bold group-hover:text-primary">{event.name}</span>
          <span className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock aria-hidden className="size-4 shrink-0" />
              {formatEventTime(event)}
            </span>
            <EventPlace event={event} />
            {event.lead && (
              <span className="inline-flex items-center gap-1.5">
                <UserRound aria-hidden className="size-4 shrink-0" />
                Trưởng BTC: {event.lead.fullName}
              </span>
            )}
          </span>
          <span className="mt-auto space-y-2 border-t pt-3">
            {seats.limited ? (
              <>
                <span className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">
                    {formatNumber(event.confirmedCount)}/{formatNumber(event.capacity ?? 0)} chỗ
                    {event.waitlistCount > 0 && ` · ${event.waitlistCount} chờ`}
                  </span>
                  {seats.full ? <span className="text-status-warning">Hết chỗ</span> : <span className="text-status-success">Còn {seats.remaining}</span>}
                </span>
                <ProgressBar value={event.confirmedCount} max={event.capacity ?? 0} label={`Đã nhận ${event.confirmedCount} trên ${event.capacity} chỗ`} tone={seats.full ? 'warning' : 'primary'} />
              </>
            ) : (
              <span className="block text-xs font-semibold text-muted-foreground">
                {formatNumber(event.confirmedCount)} người đăng ký · không giới hạn chỗ
              </span>
            )}
            {event.myRegistration && (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                Bạn: <RegistrationBadge status={event.myRegistration.status} waitlistPosition={event.myRegistration.waitlistPosition} />
              </span>
            )}
          </span>
        </span>
      </Link>
    </motion.li>
  )
}
