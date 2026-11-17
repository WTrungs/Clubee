import { motion } from 'motion/react'
import { ArrowRight, CalendarClock, CircleAlert, Clock, Compass, UserPlus, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import { ClubMonogram } from '@/features/account/view/ClubMonogram'
import { ClubContactList } from '@/features/club/view/ClubContactList'
import { formatDateTime } from '@/shared/format/formatDate'
import { cn } from '@/shared/lib/cn'
import { duration, easeOut } from '@/shared/motion/presets'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import { invitationPageMessage, type InvitationPageState } from '../viewModel/invitationDisplay'
import { useInvitationPageViewModel } from '../viewModel/useInvitationPageViewModel'
import { JoinRequestDialog } from './JoinRequestDialog'

const directoryLink = (
  <Button asChild variant="outline">
    <Link to="/directory">
      <Compass aria-hidden />
      Tìm CLB
    </Link>
  </Button>
)

function StateNotice({ state, onEnter }: { state: Exclude<InvitationPageState, 'JOIN'>; onEnter: () => void }) {
  const message = invitationPageMessage[state]
  const blocked = state === 'EXPIRED' || state === 'REVOKED' || state === 'USED'
  const Icon = blocked ? CircleAlert : Clock
  return (
    <div className="space-y-4">
      <div role="status" className={cn('flex items-start gap-3 rounded-2xl p-4', blocked ? 'bg-status-danger-soft text-status-danger' : 'bg-status-warning-soft text-status-warning')}>
        <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">{message.title}</p>
          <p className="text-sm text-foreground/80">{message.description}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {state === 'MEMBER' && (
          <Button onClick={onEnter}>
            Vào CLB
            <ArrowRight aria-hidden />
          </Button>
        )}
        {state === 'PENDING' && (
          <Button asChild variant="outline">
            <Link to="/clubs">Xem CLB của tôi</Link>
          </Button>
        )}
        {blocked && directoryLink}
      </div>
    </div>
  )
}

/** FR-MEM-01: trang mở từ liên kết mời; vẫn cần đăng nhập, chỉ hiện thông tin công khai của CLB (SRS 3.5). */
export function InvitationPage() {
  const vm = useInvitationPageViewModel()
  const preview = vm.preview

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Lời mời gia nhập" description="Xem CLB mời bạn, rồi gửi yêu cầu để ban chủ nhiệm duyệt." />
      {vm.loading && (
        <div className="space-y-4" role="status" aria-label="Đang tải lời mời">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      )}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} action={directoryLink} />}
      {preview && vm.state && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.slow, ease: easeOut }}
          aria-labelledby="invitation-club"
          className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-6"
        >
          <div className="flex items-start gap-4">
            <ClubMonogram clubId={preview.club.id} shortName={preview.club.shortName} logoUrl={preview.club.logoUrl} className="size-14 rounded-2xl" />
            <div className="min-w-0 space-y-1">
              <h2 id="invitation-club" className="text-xl font-bold text-balance">
                {preview.club.name}
              </h2>
              <Badge tone="neutral">{preview.club.field}</Badge>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{preview.club.description}</p>
          <ClubContactList contacts={preview.club} />
          <dl className="grid grid-cols-1 gap-3 rounded-xl bg-muted/50 p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="sr-only">Người mời</dt>
              <dd className="flex items-center gap-2">
                <UserRound aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span>
                  Mời bởi <span className="font-semibold">{preview.invitedBy.fullName}</span>
                </span>
              </dd>
            </div>
            <div>
              <dt className="sr-only">Hạn lời mời</dt>
              <dd className="flex items-center gap-2">
                <CalendarClock aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span>
                  {preview.status === 'ACTIVE' ? 'Còn hiệu lực đến' : 'Hạn'} <span className="font-semibold">{formatDateTime(preview.expiresAt)}</span>
                </span>
              </dd>
            </div>
          </dl>
          {vm.state === 'JOIN' ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">Ban chủ nhiệm vẫn xem lời giới thiệu và duyệt yêu cầu của bạn.</p>
              <Button onClick={vm.openJoin}>
                <UserPlus aria-hidden />
                Xin gia nhập
              </Button>
            </div>
          ) : (
            <StateNotice state={vm.state} onEnter={vm.enterClub} />
          )}
        </motion.section>
      )}
      <JoinRequestDialog target={vm.joinTarget} onClose={vm.closeJoin} />
    </div>
  )
}
