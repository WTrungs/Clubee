import { AnimatePresence, motion } from 'motion/react'
import { CameraOff, CircleAlert, CircleCheck, RefreshCw, ScanLine, TriangleAlert } from 'lucide-react'
import { useRef } from 'react'
import { formatDate } from '@/shared/format/formatDate'
import { cn } from '@/shared/lib/cn'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Spinner } from '@/shared/ui/Spinner'
import type { AttendanceCheckIn } from '../model/attendanceTypes'
import { attendanceStatusDisplay } from '../viewModel/attendanceDisplay'
import { useAttendanceScanViewModel, type ScanOutcome } from '../viewModel/useAttendanceScanViewModel'

const fade = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.2 } }

function ResultCard({ result, outcome, onScanAgain }: { result: AttendanceCheckIn; outcome: ScanOutcome; onScanAgain: () => void }) {
  const status = attendanceStatusDisplay[result.status]
  const warning = outcome.tone === 'warning'
  return (
    <motion.section {...fade} className={cn('space-y-4 rounded-2xl border p-5 shadow-sm', warning ? 'border-status-warning/40 bg-status-warning-soft' : 'bg-card')}>
      <div className="flex items-start gap-3">
        {warning ? (
          <TriangleAlert aria-hidden className="mt-0.5 size-6 shrink-0 text-status-warning" />
        ) : (
          <CircleCheck aria-hidden className="mt-0.5 size-6 shrink-0 text-status-success" />
        )}
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-bold">{outcome.title}</h2>
          <p className={cn('text-sm', !warning && 'text-muted-foreground')}>{outcome.message}</p>
        </div>
      </div>
      <dl className="space-y-3 rounded-xl border bg-muted/40 p-4 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">{result.activity.type === 'EVENT' ? 'Sự kiện' : 'Buổi sinh hoạt'}</dt>
          <dd className="mt-0.5 font-semibold break-words">{result.activity.name}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">CLB</dt>
          <dd className="mt-0.5 font-medium break-words">{result.clubName}</dd>
        </div>
        {result.day && (
          <div>
            <dt className="text-xs text-muted-foreground">Ngày</dt>
            <dd className="mt-0.5 font-medium">{formatDate(result.day)}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-muted-foreground">Trạng thái</dt>
          <dd className="mt-1">
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
          </dd>
        </div>
      </dl>
      <Button variant="outline" className="w-full" onClick={onScanAgain}>
        <ScanLine aria-hidden />
        Quét mã khác
      </Button>
    </motion.section>
  )
}

/** FR-ATT-06: người tham gia quét mã QR đang chiếu bằng camera của điện thoại hoặc máy tính. */
export function AttendanceScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const vm = useAttendanceScanViewModel(videoRef)
  const { phase } = vm
  const scanning = phase.kind === 'scanning'
  const cameraLive = scanning && (vm.cameraStatus === 'scanning' || vm.cameraStatus === 'starting')

  return (
    <div className="mx-auto w-full max-w-md space-y-5">
      <p aria-live="polite" className="sr-only">
        {vm.announcement}
      </p>
      <PageHeader title="Quét mã điểm danh" description="Hướng camera vào mã QR ban tổ chức đang chiếu. Mã đổi sau mỗi chu kỳ ngắn, nên quét mã đang hiện trên màn hình." />

      <div className={cn('relative aspect-square overflow-hidden rounded-2xl border bg-brand', !cameraLive && 'hidden')}>
        <video ref={videoRef} playsInline muted autoPlay aria-label="Hình từ camera" className="size-full object-cover" />
        <div aria-hidden className="pointer-events-none absolute inset-[14%] rounded-2xl border-2 border-brand-foreground/80" />
        {vm.cameraStatus === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-brand-foreground">
            <Spinner className="mr-2 size-4" />
            Đang mở camera…
          </div>
        )}
      </div>
      {cameraLive && (
        <p role="status" className="text-center text-sm text-muted-foreground">
          {vm.cameraStatus === 'scanning' ? 'Đưa mã QR vào khung và giữ yên máy.' : 'Trình duyệt có thể hỏi quyền dùng camera, hãy chọn Cho phép.'}
        </p>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {scanning && vm.cameraProblem && (
          <motion.section key="camera" {...fade} role="alert" className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <CameraOff aria-hidden className="mt-0.5 size-6 shrink-0 text-muted-foreground" />
              <p className="text-sm leading-relaxed">{vm.cameraProblem}</p>
            </div>
            {vm.canRetryCamera && (
              <Button variant="outline" className="w-full" onClick={vm.retryCamera}>
                <RefreshCw aria-hidden />
                Thử lại
              </Button>
            )}
          </motion.section>
        )}
        {phase.kind === 'submitting' && (
          <motion.p key="submitting" {...fade} className="flex items-center justify-center gap-2 rounded-2xl border bg-card p-5 text-sm font-medium">
            <Spinner className="size-4" />
            Đang ghi nhận điểm danh…
          </motion.p>
        )}
        {phase.kind === 'done' && vm.outcome && <ResultCard key="done" result={phase.result} outcome={vm.outcome} onScanAgain={vm.scanAgain} />}
        {phase.kind === 'failed' && (
          <motion.section key="failed" {...fade} role="alert" className="space-y-4 rounded-2xl border border-destructive/30 bg-status-danger-soft p-5">
            <div className="flex items-start gap-3">
              <CircleAlert aria-hidden className="mt-0.5 size-6 shrink-0 text-status-danger" />
              <div className="min-w-0 space-y-1">
                <h2 className="font-bold text-status-danger">Chưa điểm danh được</h2>
                <p className="text-sm break-words">{phase.message}</p>
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={vm.scanAgain}>
              <ScanLine aria-hidden />
              Quét lại
            </Button>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}
