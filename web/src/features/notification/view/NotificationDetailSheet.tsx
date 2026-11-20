import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { formatDateTime } from '@/shared/format/formatDate'
import { Button } from '@/shared/ui/Button'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import { notificationCategoryDisplay, notificationPath } from '../viewModel/notificationDisplay'
import { useNotificationDetail } from '../viewModel/useNotificationInboxViewModel'

function DetailBody({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = useNotificationDetail(id)
  // Lần hỏi lại bị từ chối thì không hiện nội dung cũ (BR-SEC-02).
  const data = detail.isSuccess ? detail.data : undefined
  const path = data ? notificationPath(data.target) : null
  return (
    <SheetContent
      title={data?.title ?? 'Thông báo'}
      description={data ? `${notificationCategoryDisplay[data.category].label}${data.clubName ? ` · ${data.clubName}` : ''}` : undefined}
      footer={
        path ? (
          <Button asChild>
            <Link to={path} onClick={onClose}>
              Mở trang liên quan
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4 p-5">
        {detail.isPending && (
          <div className="space-y-2" role="status" aria-label="Đang tải thông báo">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {detail.isError && <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />}
        {data && (
          <>
            <p className="text-xs text-muted-foreground">
              {data.sender ? `${data.sender.fullName} gửi lúc ` : 'Hệ thống gửi lúc '}
              {formatDateTime(data.createdAt)}
            </p>
            {data.body ? (
              <p className="text-sm leading-relaxed break-words whitespace-pre-line">{data.body}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Thông báo không có nội dung thêm.</p>
            )}
          </>
        )}
      </div>
    </SheetContent>
  )
}

/** Nội dung thông báo; máy chủ kiểm tra lại tư cách lúc mở và trả lý do nếu không còn quyền (BR-SEC-02). */
export function NotificationDetailSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      {id && <DetailBody id={id} onClose={onClose} />}
    </Sheet>
  )
}
