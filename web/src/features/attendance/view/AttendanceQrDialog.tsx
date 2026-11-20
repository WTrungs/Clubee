import { Lock, Maximize, Minimize } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useRef } from 'react'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { useFullscreen } from '@/shared/hooks/useFullscreen'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import type { AttendanceActivityRef } from '../model/attendanceTypes'
import { attendanceNotice, dayLabel, qrProgressText } from '../viewModel/attendanceDisplay'
import { useAttendanceQrViewModel } from '../viewModel/useAttendanceQrViewModel'
import type { AttendanceViewModel } from '../viewModel/useAttendanceViewModel'

interface AttendanceQrDialogProps {
  activity: AttendanceActivityRef
  vm: AttendanceViewModel
}

/** FR-ATT-05: chiếu mã QR cho người tham gia quét bằng ứng dụng Android hoặc trang quét trên web; màn hẹp phủ kín màn hình. */
export function AttendanceQrDialog({ activity, vm }: AttendanceQrDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const fullscreen = useFullscreen(contentRef)
  // Hộp thoại che đầu trang, nên tự nêu tên CLB hiện hành (FR-ACC-06) để người quét biết đúng CLB.
  const { club } = useCurrentClub()
  const sheet = vm.sheet
  if (!sheet) return null
  const dayIndex = sheet.day ? sheet.days.indexOf(sheet.day) : -1
  const day = dayIndex >= 0 && sheet.day && sheet.days.length > 1 ? ` · ${dayLabel(sheet.day, dayIndex)}` : ''
  const subtitle = `${club.name} · ${sheet.activity.name}${day}`

  return (
    <Dialog open={vm.qrOpen} onOpenChange={vm.setQrOpen}>
      <DialogContent
        ref={contentRef}
        title="Mã QR điểm danh"
        description={subtitle}
        // Trình duyệt chỉ bỏ `transform` khi toàn màn hình, nên phải tự bỏ `translate` dùng để căn giữa.
        className="h-dvh max-h-dvh w-screen max-w-none rounded-none border-0 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:rounded-2xl sm:border [&:fullscreen]:translate-none [&:fullscreen]:rounded-none [&:fullscreen]:border-0"
        footer={
          fullscreen.supported && (
            <Button variant="outline" onClick={fullscreen.toggle}>
              {fullscreen.active ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
              {fullscreen.active ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
            </Button>
          )
        }
      >
        <QrBody activity={activity} vm={vm} name={sheet.activity.name} large={fullscreen.active} />
      </DialogContent>
    </Dialog>
  )
}

interface QrBodyProps extends AttendanceQrDialogProps {
  name: string
  large: boolean
}

/** Chỉ gắn khi hộp thoại mở, nên mã chỉ được tải và đếm ngược khi có người xem. */
function QrBody({ activity, vm, name, large }: QrBodyProps) {
  const qr = useAttendanceQrViewModel(activity, vm.day)
  const sheet = vm.sheet
  // Danh sách tải lại mỗi 10 giây nên biết sớm khi có người chốt, sự kiện bị đóng hoặc người chiếu mất quyền.
  const stopped =
    sheet && (sheet.closedAt || sheet.readOnlyReason)
      ? attendanceNotice(sheet, vm.now)
      : !vm.canShowQr
        ? 'Bạn không còn quyền mở mã QR điểm danh.'
        : qr.blockedReason

  if (stopped) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm font-medium text-muted-foreground">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
        {stopped}
      </p>
    )
  }
  if (qr.loadError) return <ErrorState error={qr.loadError} onRetry={qr.retry} />

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 py-2">
      <div
        role="img"
        aria-label={`Mã QR điểm danh ${name}`}
        className={cn(
          'overflow-hidden rounded-lg bg-qr-surface text-qr-ink',
          large ? 'size-[min(85vw,70vh)]' : 'size-[min(80vw,58vh)] sm:size-[min(420px,58vh)]',
        )}
      >
        {qr.code ? (
          <QRCodeSVG value={qr.code.payload} size={256} level="M" marginSize={4} fgColor="currentColor" bgColor="transparent" aria-hidden className="size-full" />
        ) : (
          <Skeleton className="size-full rounded-none" />
        )}
      </div>

      <div className="w-full max-w-sm space-y-2">
        <p className="text-center text-sm font-semibold tabular-nums">{qr.code ? (qr.renewing ? 'Đang đổi mã…' : `Đổi mã sau ${qr.secondsLeft} giây`) : 'Đang lấy mã…'}</p>
        <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted-foreground/20">
          <div className="h-full origin-left rounded-full bg-primary transition-transform duration-300 ease-out" style={{ transform: `scaleX(${qr.remainingRatio})` }} />
        </div>
      </div>

      <p className="text-center text-sm text-muted-foreground">Quét bằng ứng dụng Android hoặc mục Quét mã điểm danh trên web.</p>

      {sheet && (
        <p role="status" className="text-center text-sm text-muted-foreground">
          {qrProgressText(sheet.counts)}
        </p>
      )}
    </div>
  )
}
