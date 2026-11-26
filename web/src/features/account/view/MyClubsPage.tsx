import { motion } from 'motion/react'
import { Link } from 'react-router'
import { ArrowRight, CalendarHeart, Compass, Plus, SearchX, UsersRound } from 'lucide-react'
import { formatNumber } from '@/shared/format/formatMoney'
import { cn } from '@/shared/lib/cn'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { SearchInput } from '@/shared/ui/ListControls'
import { PageHeader } from '@/shared/ui/PageHeader'
import { EmptyState } from '@/shared/ui/StateViews'
import { memberStatusDisplay } from '../viewModel/memberStatus'
import { useMyClubsViewModel } from '../viewModel/useMyClubsViewModel'
import { CreateClubSheet } from '@/features/club/view/CreateClubSheet'
import { clubStatusDisplay } from '@/features/club/viewModel/clubStatusDisplay'
import { ClubMonogram } from './ClubMonogram'

export function MyClubsPage() {
  const vm = useMyClubsViewModel()

  return (
    <div>
      <PageHeader
        eyebrow={`Xin chào, ${vm.firstName}`}
        title="CLB của tôi"
        description="Chọn CLB để làm việc. Mọi thao tác sau đó gắn với CLB bạn chọn."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {vm.hasAnyClub && (
              <SearchInput label="Lọc CLB của tôi" placeholder="Tìm theo tên, lĩnh vực…" value={vm.keyword} onValueChange={vm.setKeyword} className="w-full sm:w-72" />
            )}
            <Button variant="outline" asChild>
              <Link to="/directory">
                <Compass aria-hidden />
                Tìm CLB khác
              </Link>
            </Button>
            <Button onClick={vm.openCreate}>
              <Plus aria-hidden />
              Tạo CLB
            </Button>
          </div>
        }
      />

      {!vm.hasAnyClub && (
        <EmptyState
          icon={Compass}
          title="Bạn chưa tham gia CLB nào"
          description="Tìm CLB và gửi yêu cầu gia nhập, hoặc tự tạo CLB mới. CLB bạn tham gia sẽ xuất hiện ở đây."
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild>
                <Link to="/directory">Tìm CLB</Link>
              </Button>
              <Button variant="outline" onClick={vm.openCreate}>
                <Plus aria-hidden />
                Tạo CLB mới
              </Button>
            </div>
          }
        />
      )}

      {vm.hasAnyClub && vm.memberships.length === 0 && vm.staffEvents.length === 0 && (
        <EmptyState icon={SearchX} title="Không có CLB phù hợp" description={`Không tìm thấy CLB nào khớp với “${vm.keyword}”.`} />
      )}

      {vm.memberships.length > 0 && (
        <motion.ul variants={listVariants} initial="initial" animate="animate" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {vm.memberships.map((membership) => {
            const status = memberStatusDisplay[membership.memberStatus]
            const enterable = vm.canEnter(membership.memberStatus)
            const Card = enterable ? 'button' : 'div'
            return (
              <motion.li key={membership.clubId} variants={itemVariants}>
                <Card
                  {...(enterable ? { type: 'button' as const, onClick: () => vm.openClub(membership.clubId) } : {})}
                  className={cn(
                    'group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm',
                    enterable && 'transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg',
                  )}
                >
                  <span aria-hidden className={cn('h-16 bg-brand transition-opacity', enterable ? 'opacity-90 group-hover:opacity-100' : 'opacity-40')} />
                  <span className="relative -mt-7 flex flex-1 flex-col gap-3 p-5 pt-0">
                    <ClubMonogram clubId={membership.clubId} shortName={membership.shortName} logoUrl={membership.logoUrl} className="size-14 rounded-2xl text-base ring-4 ring-card" />
                    <span className="space-y-1">
                      <span className="block text-lg leading-snug font-bold">{membership.clubName}</span>
                      <span className="block text-sm text-muted-foreground">
                        {membership.field}
                        {membership.departmentName && ` · Ban ${membership.departmentName}`}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      <Badge tone={status.tone} dot>
                        {status.label}
                      </Badge>
                      {membership.clubStatus !== 'ACTIVE' && <Badge tone={clubStatusDisplay[membership.clubStatus].tone}>CLB {clubStatusDisplay[membership.clubStatus].label.toLowerCase()}</Badge>}
                      {membership.positionTitles.map((title) => (
                        <Badge key={title} tone="progress">
                          {title}
                        </Badge>
                      ))}
                    </span>
                    <span className="mt-auto flex items-center justify-between border-t pt-3 text-sm">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <UsersRound aria-hidden className="size-4" />
                        {formatNumber(membership.memberCount)} thành viên
                      </span>
                      {enterable ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-primary">
                          Vào CLB
                          <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" />
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-status-warning">Đang chờ ban chủ nhiệm duyệt</span>
                      )}
                    </span>
                  </span>
                </Card>
              </motion.li>
            )
          })}
        </motion.ul>
      )}

      {vm.staffEvents.length > 0 && (
        <section className="mt-10" aria-labelledby="staff-events-heading">
          <h2 id="staff-events-heading" className="mb-3 flex items-center gap-2 text-lg font-bold">
            <CalendarHeart aria-hidden className="size-5 text-primary" />
            Sự kiện bạn làm BTC ở CLB khác
          </h2>
          <motion.ul variants={listVariants} initial="initial" animate="animate" className="grid gap-3 sm:grid-cols-2">
            {vm.staffEvents.map((event) => (
              <motion.li key={event.eventId} variants={itemVariants}>
                <Link
                  to={`/clubs/${event.clubId}/events/${event.eventId}`}
                  className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-[border-color,box-shadow] duration-200 hover:border-primary/40 hover:shadow-md"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{event.eventName}</span>
                    <span className="block text-sm text-muted-foreground">
                      {event.clubName} · {event.roleTitle}
                    </span>
                  </span>
                  <ArrowRight aria-hidden className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-1" />
                </Link>
              </motion.li>
            ))}
          </motion.ul>
        </section>
      )}
      <CreateClubSheet open={vm.createOpen} onClose={vm.closeCreate} />
    </div>
  )
}
