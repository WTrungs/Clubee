import { EyeOff, PencilLine, Send } from 'lucide-react'
import { formatDate, formatDateTime } from '@/shared/format/formatDate'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import type { NewsDetail } from '../model/newsTypes'
import { newsStatusDisplay } from '../viewModel/newsDisplay'
import { useNewsDetailViewModel } from '../viewModel/useNewsViewModels'
import { NewsCover } from './NewsCover'

interface NewsDetailSheetProps {
  newsId: string | null
  onClose: () => void
  onEdit: (news: NewsDetail) => void
}

export function NewsDetailSheet({ newsId, onClose, onEdit }: NewsDetailSheetProps) {
  const vm = useNewsDetailViewModel(newsId)
  const news = vm.news
  const status = news ? newsStatusDisplay[news.status] : null
  return (
    <Sheet open={newsId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        title={news?.title ?? 'Tin tức'}
        footer={
          news &&
          (vm.canEdit || vm.canPublish || vm.canHide) && (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {vm.canEdit && (
                <Button variant="outline" onClick={() => onEdit(news)}>
                  <PencilLine aria-hidden />
                  Sửa
                </Button>
              )}
              {vm.canHide && (
                <Button variant="outline" onClick={() => vm.setConfirmHide(true)}>
                  <EyeOff aria-hidden />
                  Ẩn tin
                </Button>
              )}
              {vm.canPublish && (
                <Button onClick={vm.publish} loading={vm.publishing}>
                  <Send aria-hidden />
                  {news.status === 'HIDDEN' ? 'Hiện lại' : 'Xuất bản'}
                </Button>
              )}
            </div>
          )
        }
      >
        {vm.error ? (
          <ErrorState error={vm.error} onRetry={vm.retry} className="m-5" />
        ) : vm.loading || !news || !status ? (
          <div className="space-y-3 p-5" role="status" aria-label="Đang tải tin">
            <Skeleton className="aspect-[16/9] w-full rounded-xl" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <article className="space-y-4 p-5">
            <NewsCover imageUrl={news.imageUrl} className="rounded-xl" />
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {(vm.canEdit || news.status !== 'PUBLISHED') && (
                <Badge tone={status.tone} dot>
                  {status.label}
                </Badge>
              )}
              <span>
                {news.author.fullName} · {news.publishedAt ? `Xuất bản ${formatDate(news.publishedAt)}` : `Sửa lần cuối ${formatDateTime(news.updatedAt)}`}
              </span>
            </div>
            {news.hiddenAt && news.hiddenBy && (
              <p className="rounded-xl bg-status-warning-soft p-3 text-sm text-status-warning">
                {news.hiddenBy.fullName} đã ẩn tin lúc {formatDateTime(news.hiddenAt)}. Thành viên và khách không còn thấy tin này.
              </p>
            )}
            <p className="text-sm leading-relaxed break-words whitespace-pre-line">{news.body}</p>
          </article>
        )}
      </SheetContent>
      <ConfirmDialog
        open={vm.confirmHide}
        onOpenChange={vm.setConfirmHide}
        title="Ẩn tin này?"
        description="Thành viên và khách trên trang công khai sẽ không còn thấy tin. Bạn có thể hiện lại bất cứ lúc nào."
        confirmLabel="Ẩn tin"
        pending={vm.hiding}
        onConfirm={vm.hide}
      />
    </Sheet>
  )
}
