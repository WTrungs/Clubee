import { motion } from 'motion/react'
import { Newspaper, PenSquare, SearchX } from 'lucide-react'
import { formatDate } from '@/shared/format/formatDate'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { FilterChip, Pagination, SearchInput } from '@/shared/ui/ListControls'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { NEWS_STATUS_FILTERS, newsStatusDisplay } from '../viewModel/newsDisplay'
import { useNewsListViewModel } from '../viewModel/useNewsViewModels'
import { NewsCover } from './NewsCover'
import { NewsDetailSheet } from './NewsDetailSheet'
import { NewsEditorSheet } from './NewsEditorSheet'

/** FR-CLB-06: tin tức của CLB; tin đã xuất bản cũng hiện trên trang công khai (FR-CLB-07). */
export function NewsPage() {
  const vm = useNewsListViewModel()
  return (
    <div>
      <PageHeader
        eyebrow={vm.clubName}
        title="Tin tức"
        description={vm.canManage ? 'Soạn, xuất bản và ẩn tin. Tin đã xuất bản hiện cho thành viên và trên trang công khai.' : 'Tin mới của CLB.'}
        actions={
          vm.canManage && (
            <Button onClick={vm.openCreate}>
              <PenSquare aria-hidden />
              Viết tin
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput label="Tìm tin" placeholder="Tìm theo tiêu đề…" value={vm.keyword} onValueChange={vm.setKeyword} className="w-full sm:w-72" />
        {vm.canManage && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo trạng thái">
            {NEWS_STATUS_FILTERS.map((status) => (
              <FilterChip key={status} label={newsStatusDisplay[status].label} selected={vm.status === status} onToggle={() => vm.toggleStatus(status)} />
            ))}
          </div>
        )}
      </div>

      {vm.error ? (
        <ErrorState error={vm.error} onRetry={vm.retry} />
      ) : vm.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Đang tải tin">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : vm.rows.length === 0 ? (
        vm.filtered ? (
          <EmptyState icon={SearchX} title="Không có tin phù hợp" description="Thử từ khóa hoặc bộ lọc khác." />
        ) : (
          <EmptyState icon={Newspaper} title="Chưa có tin nào" description={vm.canManage ? 'Bấm Viết tin để đăng tin đầu tiên.' : 'CLB chưa đăng tin nào.'} />
        )
      ) : (
        <>
          <motion.ul variants={listVariants} initial="initial" animate="animate" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Danh sách tin">
            {vm.rows.map((news) => (
              <motion.li key={news.id} variants={itemVariants}>
                <button
                  type="button"
                  onClick={() => vm.open(news.id)}
                  className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-[box-shadow,border-color] duration-200 hover:border-primary/40 hover:shadow-md"
                >
                  <NewsCover imageUrl={news.imageUrl} />
                  <span className="flex flex-1 flex-col gap-2 p-4">
                    {vm.canManage && (
                      <Badge tone={newsStatusDisplay[news.status].tone} dot className="self-start">
                        {newsStatusDisplay[news.status].label}
                      </Badge>
                    )}
                    <span className="line-clamp-2 font-semibold group-hover:text-primary">{news.title}</span>
                    <span className="line-clamp-3 text-sm text-muted-foreground">{news.excerpt}</span>
                    <span className="mt-auto pt-1 text-xs text-muted-foreground">
                      {news.publishedAt ? formatDate(news.publishedAt) : `Sửa ${formatDate(news.updatedAt)}`} · {news.author.fullName}
                    </span>
                  </span>
                </button>
              </motion.li>
            ))}
          </motion.ul>
          <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} className="mt-4" />
        </>
      )}

      <NewsDetailSheet newsId={vm.openedId} onClose={vm.close} onEdit={vm.openEdit} />
      <NewsEditorSheet open={vm.editor.open} editing={vm.editor.editing} onClose={vm.closeEditor} onSaved={vm.afterSave} />
    </div>
  )
}
