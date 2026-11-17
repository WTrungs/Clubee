import { motion } from 'motion/react'
import { Clock, MapPin, UsersRound } from 'lucide-react'
import { Link } from 'react-router'
import { formatTimeRange } from '@/shared/format/formatDate'
import { itemVariants } from '@/shared/motion/presets'
import type { SessionSummary } from '../model/sessionTypes'
import { sessionScopeLabel } from '../viewModel/sessionDisplay'
import { SessionDateBlock, SessionTimingBadge } from './SessionMeta'

export function SessionCard({ session }: { session: SessionSummary }) {
  return (
    <motion.li variants={itemVariants}>
      <Link
        to={`/clubs/${session.clubId}/sessions/${session.id}`}
        className="group flex h-full gap-4 rounded-2xl border bg-card p-4 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-primary/40 hover:shadow-md"
      >
        <SessionDateBlock startAt={session.startAt} />
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="flex flex-wrap items-center gap-2">
            <SessionTimingBadge session={session} />
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <UsersRound aria-hidden className="size-3.5" />
              {sessionScopeLabel(session.scope)}
            </span>
          </span>
          <span className="block leading-snug font-bold group-hover:text-primary">{session.title}</span>
          <span className="flex flex-col gap-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock aria-hidden className="size-4 shrink-0" />
              {formatTimeRange(session.startAt, session.endAt)}
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MapPin aria-hidden className="size-4 shrink-0" />
              <span className="truncate">{session.location}</span>
            </span>
          </span>
        </span>
      </Link>
    </motion.li>
  )
}
