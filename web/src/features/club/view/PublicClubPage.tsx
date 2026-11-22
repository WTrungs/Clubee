import { motion } from 'motion/react'
import { ArrowLeft, CalendarClock, LogIn, Send, UserPlus, Users } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { ClubMonogram } from '@/features/account/view/ClubMonogram'
import { formatDateTime } from '@/shared/format/formatDate'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { usePublicClubViewModel } from '../viewModel/usePublicClubViewModels'
import { ClubContactList } from './ClubContactList'

/** FR-CLB-05: trang CLB chỉ có thông tin công khai theo SRS 3.5; tin tức và sự kiện cho khách thuộc FR-CLB-07. */
export function PublicClubPage() {
  const { clubId = '' } = useParams()
  const vm = usePublicClubViewModel(clubId)
  const club = vm.club

  return (
    <div className="space-y-6">
      <Link to="/explore" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        Danh bạ CLB
      </Link>

      {vm.loading && (
        <div role="status" aria-label="Đang tải thông tin CLB" className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      )}
      {vm.error && (
        <ErrorState
          error={vm.error}
          onRetry={vm.refetch}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/explore">Về danh bạ</Link>
            </Button>
          }
        />
      )}

      {club && (
        <>
          <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-4">
              <ClubMonogram clubId={club.id} shortName={club.shortName} logoUrl={club.logoUrl} className="size-14 rounded-2xl text-sm" />
              <div className="min-w-0 space-y-1.5">
                <h1 className="text-2xl font-bold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{club.name}</h1>
                <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                  <span className="font-semibold">{club.shortName}</span>
                  <Badge tone="neutral">{club.field}</Badge>
                </p>
              </div>
            </div>
            <p className="mt-4 leading-relaxed whitespace-pre-line [overflow-wrap:anywhere]">{club.description}</p>
            <div className="mt-5 border-t pt-4">
              <h2 className="mb-2 text-sm font-bold">Liên hệ</h2>
              <ClubContactList contacts={club} emptyText="CLB chưa công bố liên hệ." />
            </div>
          </section>

          <section aria-labelledby="public-recruitments" className="space-y-3">
            <h2 id="public-recruitments" className="text-lg font-bold">
              Đợt tuyển đang nhận đơn
            </h2>
            {club.openRecruitments.length === 0 ? (
              <EmptyState icon={Users} title="Chưa có đợt tuyển nào đang mở" description="Bạn vẫn có thể đăng nhập và gửi yêu cầu gia nhập CLB." />
            ) : (
              <motion.ul variants={listVariants} initial="initial" animate="animate" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {club.openRecruitments.map((recruitment) => (
                  <motion.li key={recruitment.id} variants={itemVariants} className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
                    <div className="min-w-0 space-y-1">
                      <h3 className="font-semibold [overflow-wrap:anywhere]">{recruitment.name}</h3>
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CalendarClock aria-hidden className="size-4 shrink-0" />
                        Nhận đơn đến {formatDateTime(recruitment.closesAt)}
                      </p>
                    </div>
                    <p className="flex flex-wrap gap-1.5">
                      {recruitment.departments.map((department) => (
                        <Badge key={department.id} tone="info">
                          Ban {department.name}: {department.quota} chỉ tiêu
                        </Badge>
                      ))}
                    </p>
                    <Button asChild className="self-start">
                      <Link to={`/recruitments/${encodeURIComponent(recruitment.id)}`} aria-label={`Nộp đơn: ${recruitment.name}`}>
                        <Send aria-hidden />
                        Nộp đơn
                      </Link>
                    </Button>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </section>

          {!vm.isAdmin && (
            <section className="flex flex-col gap-3 rounded-2xl border border-dashed bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {vm.signedIn ? 'Muốn gia nhập mà không qua đợt tuyển? Gửi yêu cầu ở trang Tìm CLB.' : 'Đăng nhập để gửi yêu cầu gia nhập hoặc nộp đơn tuyển thành viên.'}
              </p>
              <Button asChild variant="outline" className="shrink-0">
                {vm.signedIn ? (
                  <Link to="/directory">
                    <UserPlus aria-hidden />
                    Xin gia nhập
                  </Link>
                ) : (
                  <Link to="/login" state={{ from: '/directory' }}>
                    <LogIn aria-hidden />
                    Đăng nhập để tham gia
                  </Link>
                )}
              </Button>
            </section>
          )}
        </>
      )}
    </div>
  )
}
