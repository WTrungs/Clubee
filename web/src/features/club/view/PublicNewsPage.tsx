import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { NewsCover } from '@/features/news/view/NewsCover'
import { formatDate } from '@/shared/format/formatDate'
import { Button } from '@/shared/ui/Button'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import { usePublicNewsViewModel } from '../viewModel/usePublicClubViewModels'

/** FR-CLB-07: đọc một tin đã xuất bản trên trang công khai; không ghi tên người viết. */
export function PublicNewsPage() {
  const { clubId = '', newsId = '' } = useParams()
  const vm = usePublicNewsViewModel(clubId, newsId)
  const clubPath = `/explore/${encodeURIComponent(clubId)}`
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to={clubPath} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        {vm.news?.clubName ?? 'Trang CLB'}
      </Link>
      {vm.loading && (
        <div role="status" aria-label="Đang tải tin" className="space-y-4">
          <Skeleton className="aspect-[16/9] w-full rounded-2xl" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}
      {vm.error && (
        <ErrorState
          error={vm.error}
          onRetry={vm.refetch}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to={clubPath}>Về trang CLB</Link>
            </Button>
          }
        />
      )}
      {vm.news && (
        <article className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <NewsCover imageUrl={vm.news.imageUrl} />
          <div className="space-y-3 p-5 sm:p-6">
            <p className="text-sm text-muted-foreground">{formatDate(vm.news.publishedAt)}</p>
            <h1 className="text-2xl font-bold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{vm.news.title}</h1>
            <p className="leading-relaxed whitespace-pre-line [overflow-wrap:anywhere]">{vm.news.body}</p>
          </div>
        </article>
      )}
      {vm.news && vm.others.length > 0 && (
        <section aria-labelledby="other-news" className="space-y-3">
          <h2 id="other-news" className="text-lg font-bold">
            Tin khác
          </h2>
          <ul className="space-y-2">
            {vm.others.map((item) => (
              <li key={item.id}>
                <Link
                  to={`${clubPath}/news/${encodeURIComponent(item.id)}`}
                  className="block rounded-xl border bg-card p-3 transition-colors hover:border-primary/40"
                >
                  <span className="block font-semibold [overflow-wrap:anywhere]">{item.title}</span>
                  <span className="block text-xs text-muted-foreground">{formatDate(item.publishedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
