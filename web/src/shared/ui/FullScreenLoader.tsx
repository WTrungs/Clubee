import { LogoMark } from './Logo'
import { Spinner } from './Spinner'

/** Màn chờ phủ kín trang, dùng khi chưa biết phiên đăng nhập hoặc trang đầu tiên chưa tải xong. */
export function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status">
      <span className="flex flex-col items-center gap-4">
        <LogoMark className="size-12" />
        <Spinner />
      </span>
      <span className="sr-only">Đang tải…</span>
    </div>
  )
}
