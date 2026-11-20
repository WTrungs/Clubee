import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { getErrorMessage } from '@/api/apiError'
import { formatDateTime } from '@/shared/format/formatDate'
import { attendanceRepository } from '../model/attendanceRepository'
import type { AttendanceCheckIn } from '../model/attendanceTypes'
import { attendanceStatusDisplay } from './attendanceDisplay'
import { parseAttendancePayload, type ParsedAttendancePayload } from './attendancePayload'
import { attendanceQueryKeys } from './attendanceQueryKeys'
import { useQrCameraScanner, type CameraStatus } from './useQrCameraScanner'

export type ScanPhase = { kind: 'scanning' } | { kind: 'submitting' } | { kind: 'done'; result: AttendanceCheckIn } | { kind: 'failed'; message: string }

/** Câu hướng dẫn khi camera không chạy được; null khi camera đang mở hoặc đang quét. */
export function cameraProblem(status: CameraStatus): string | null {
  switch (status) {
    case 'insecure':
      return 'Trình duyệt chỉ cho mở camera trên trang bảo mật (https://). Mở Clubee bằng địa chỉ https rồi thử lại.'
    case 'unsupported':
      return 'Trình duyệt này không mở được camera. Dùng Chrome hoặc Safari bản mới, hoặc quét bằng ứng dụng Android.'
    case 'denied':
      return 'Clubee chưa được phép dùng camera. Mở cài đặt trang của trình duyệt, cho phép Camera rồi bấm Thử lại.'
    case 'noCamera':
      return 'Không tìm thấy camera trên thiết bị này.'
    case 'loadFailed':
      return 'Không tải được bộ đọc mã QR. Kiểm tra kết nối mạng rồi bấm Thử lại.'
    case 'error':
      return 'Không mở được camera. Đóng ứng dụng khác đang dùng camera rồi bấm Thử lại.'
    default:
      return null
  }
}

/** Trình duyệt không hỗ trợ hoặc trang không bảo mật thì thử lại cũng vô ích. */
export const canRetryCamera = (status: CameraStatus) => cameraProblem(status) !== null && status !== 'insecure' && status !== 'unsupported'

export interface ScanOutcome {
  tone: 'success' | 'warning'
  title: string
  message: string
}

/** Đã có bản ghi vắng (người phụ trách ghi trước) thì quét không đổi được (BR-ATT-01): báo rõ để người đó nhờ sửa, không báo thành công. */
export function scanOutcome(result: Pick<AttendanceCheckIn, 'status' | 'recordedAt' | 'alreadyRecorded'>): ScanOutcome {
  const at = formatDateTime(result.recordedAt)
  if (!result.alreadyRecorded) return { tone: 'success', title: 'Đã điểm danh', message: `Ghi nhận ${attendanceStatusDisplay[result.status].label} lúc ${at}.` }
  if (result.status === 'PRESENT' || result.status === 'LATE') return { tone: 'success', title: 'Bạn đã điểm danh trước đó', message: `Bạn đã điểm danh lúc ${at}.` }
  return {
    tone: 'warning',
    title: 'Chưa ghi bạn có mặt',
    message: `Bạn đang được ghi ${attendanceStatusDisplay[result.status].label} từ ${at}. Nếu bạn có mặt, báo người phụ trách để sửa điểm danh.`,
  }
}

/** Câu cho vùng đọc màn hình luôn có sẵn trên trang, để trình đọc màn hình đọc được khi kết quả đổi. */
function announcementOf(phase: ScanPhase): string {
  if (phase.kind === 'submitting') return 'Đang ghi nhận điểm danh.'
  if (phase.kind === 'done') {
    const outcome = scanOutcome(phase.result)
    return `${outcome.title}. ${outcome.message}`
  }
  return ''
}

/** FR-ATT-06: quét → gửi → kết quả hoặc lỗi; mỗi lần quét chỉ gửi một mã, muốn quét tiếp thì bấm Quét lại. */
export function useAttendanceScanViewModel(videoRef: RefObject<HTMLVideoElement | null>) {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<ScanPhase>({ kind: 'scanning' })
  // Khóa ngay khi nhận mã, trước cả khi state kịp đổi, để hai khung hình liền nhau không gửi trùng.
  const lockedRef = useRef(false)
  const { mutate } = useMutation({
    mutationFn: (parsed: Extract<ParsedAttendancePayload, { ok: true }>) => attendanceRepository.checkIn(parsed.activity, { code: parsed.code, day: parsed.day }),
    meta: { silentError: true },
  })

  const handleCode = useCallback(
    (text: string) => {
      if (lockedRef.current) return
      lockedRef.current = true
      const parsed = parseAttendancePayload(text)
      if (!parsed.ok) {
        setPhase({ kind: 'failed', message: parsed.message })
        return
      }
      setPhase({ kind: 'submitting' })
      mutate(parsed, {
        onSuccess: (result) => {
          setPhase({ kind: 'done', result })
          void queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.attendance })
        },
        onError: (error) => setPhase({ kind: 'failed', message: getErrorMessage(error) }),
      })
    },
    [mutate, queryClient],
  )

  const scanner = useQrCameraScanner(videoRef, handleCode)
  const { start } = scanner

  useEffect(() => {
    void start()
  }, [start])

  return {
    phase,
    cameraStatus: scanner.status,
    cameraProblem: cameraProblem(scanner.status),
    canRetryCamera: canRetryCamera(scanner.status),
    outcome: phase.kind === 'done' ? scanOutcome(phase.result) : null,
    announcement: announcementOf(phase),
    /** Nhận một mã đọc được; trang quét gọi qua camera, test gọi thẳng. */
    handleCode,
    scanAgain: () => {
      if (phase.kind === 'submitting') return
      lockedRef.current = false
      setPhase({ kind: 'scanning' })
      void start()
    },
    retryCamera: () => void start(),
  }
}
