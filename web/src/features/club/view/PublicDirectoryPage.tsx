import { motion } from 'motion/react'
import { FilterX, Megaphone, SearchX } from 'lucide-react'
import { Link } from 'react-router'
import { ClubMonogram } from '@/features/account/view/ClubMonogram'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { NativeSelect } from '@/shared/ui/Input'
import { Pagination, SearchInput } from '@/shared/ui/ListControls'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { usePublicDirectoryViewModel } from '../viewModel/usePublicClubViewModels'

/** FR-CLB-05: danh bạ CLB đang hoạt động, ai cũng xem được kể cả khi chưa đăng nhập (SRS 3.5). */
export function PublicDirectoryPage() {
  const vm = usePublicDirectoryViewModel()
  return (
    <div>
      <PageHeader title="Danh bạ CLB" description="Các CLB, đội, nhóm đang hoạt động. Mở một CLB để xem giới thiệu, liên hệ và đợt tuyển đang nhận đơn." />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
        <SearchInput label="Tìm CLB theo tên" placeholder="Tìm theo tên CLB…" value={vm.keyword} onValueChange={vm.setKeyword} />
        <NativeSelect aria-label="Lọc theo lĩnh vực" value={vm.field} onChange={(event) => vm.setField(event.target.value)}>
          <option value="">Mọi lĩnh vực</option>
          {vm.fields.map((field) => (
            <option key={field} value={field}>
              {field}
            </option>
          ))}
        </NativeSelect>
        {vm.filtered && (
          <Button variant="ghost" onClick={vm.clearFilters}>
            <FilterX aria-hidden />
            Bỏ lọc
          </Button>
        )}
      </div>

      {vm.loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Đang tải danh bạ CLB">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : vm.error ? (
        <ErrorState error={vm.error} onRetry={vm.refetch} />
      ) : vm.clubs.length === 0 ? (
        <EmptyState icon={SearchX} title="Không có CLB phù hợp" description={vm.filtered ? 'Thử tên khác hoặc bỏ lọc lĩnh vực.' : 'Chưa có CLB nào đang hoạt động.'} />
      ) : (
        <>
          <motion.ul
            key={`${vm.page}-${vm.field}`}
            aria-label="Danh sách CLB"
            variants={listVariants}
            initial="initial"
            animate="animate"
            className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            {vm.clubs.map((club) => (
              <motion.li key={club.id} variants={itemVariants} className="min-w-0">
                <Link
                  to={`/explore/${encodeURIComponent(club.id)}`}
                  className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                >
                  <div className="flex items-start gap-3">
                    <ClubMonogram clubId={club.id} shortName={club.shortName} logoUrl={club.logoUrl} />
                    <div className="min-w-0">
                      <h2 className="font-bold [overflow-wrap:anywhere]">{club.name}</h2>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone="neutral">{club.field}</Badge>
                        {club.openRecruitmentCount > 0 && (
                          <Badge tone="success" dot>
                            Đang tuyển
                          </Badge>
                        )}
                      </p>
                    </div>
                  </div>
                  <p className="line-clamp-3 text-sm text-muted-foreground">{club.description}</p>
                </Link>
              </motion.li>
            ))}
          </motion.ul>
          <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />
        </>
      )}

      <p className="mt-8 flex items-start gap-2 text-sm text-muted-foreground">
        <Megaphone aria-hidden className="mt-0.5 size-4 shrink-0" />
        Muốn tham gia? Đăng nhập rồi gửi yêu cầu gia nhập hoặc nộp đơn vào đợt tuyển đang mở.
      </p>
    </div>
  )
}
