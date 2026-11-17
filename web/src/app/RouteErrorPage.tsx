import { TriangleAlert } from 'lucide-react'
import { Button } from '@/shared/ui/Button'

/** Lỗi không lường trước khi render; không hiện chi tiết kỹ thuật cho người dùng. */
export function RouteErrorPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-md space-y-4 text-center" role="alert">
        <span className="mx-auto inline-flex size-14 items-center justify-center rounded-2xl bg-status-danger-soft text-status-danger">
          <TriangleAlert aria-hidden className="size-7" />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight">Đã có lỗi xảy ra</h1>
        <p className="text-muted-foreground">Trang gặp sự cố ngoài ý muốn. Tải lại trang để thử lại.</p>
        <Button onClick={() => window.location.reload()}>Tải lại trang</Button>
      </div>
    </div>
  )
}
