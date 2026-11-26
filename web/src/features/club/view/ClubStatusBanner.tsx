import { Archive, PauseCircle } from 'lucide-react'
import { formatDate } from '@/shared/format/formatDate'
import { cn } from '@/shared/lib/cn'
import type { ClubDetail } from '../model/clubTypes'
import { clubStatusNotice } from '../viewModel/clubStatusDisplay'

/** FR-CLB-04: CLB tạm ngừng hoặc đã giải thể hiện băng giải thích ở đầu mọi trang của CLB. */
export function ClubStatusBanner({ club }: { club: Pick<ClubDetail, 'status' | 'lastStatusChange'> }) {
  if (club.status === 'ACTIVE') return null
  const notice = clubStatusNotice[club.status]
  const Icon = club.status === 'SUSPENDED' ? PauseCircle : Archive
  const change = club.lastStatusChange
  return (
    <div
      role="status"
      className={cn(
        'mb-4 flex items-start gap-3 rounded-2xl p-4 text-sm',
        club.status === 'SUSPENDED' ? 'bg-status-warning-soft text-status-warning' : 'bg-status-neutral-soft text-status-neutral',
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">
          {notice.title}
          {change && ` từ ${formatDate(change.at)}`}
        </p>
        <p>{notice.body}</p>
        {change && <p className="break-words opacity-90">Lý do: {change.reason}</p>}
      </div>
    </div>
  )
}
