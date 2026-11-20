import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/** Trạng thái camera khi quét; `paused` là đã đọc được một mã, camera đã tắt và chờ quét tiếp. */
export type CameraStatus = 'idle' | 'starting' | 'scanning' | 'paused' | 'denied' | 'noCamera' | 'insecure' | 'unsupported' | 'loadFailed' | 'error'

type Decode = (typeof import('jsqr'))['default']

const SCAN_INTERVAL_MS = 200
/** Thu nhỏ khung hình trước khi giải mã cho nhẹ máy; mã chiếu trên màn hình vẫn đủ rõ ở cỡ này. */
const MAX_FRAME_WIDTH = 640

export function cameraErrorStatus(error: unknown): CameraStatus {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'noCamera'
  if (name === 'NotSupportedError') return 'unsupported'
  return 'error'
}

/** FR-ATT-06: camera sau qua getUserMedia, giải mã bằng jsQR (chạy cả Safari iPhone), khoảng 5 khung hình mỗi giây; tắt camera khi rời trang hoặc ẩn tab. */
export function useQrCameraScanner(videoRef: RefObject<HTMLVideoElement | null>, onDetected: (text: string) => void) {
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const decodeRef = useRef<Decode | null>(null)
  // Mỗi lần mở camera một số mới, để lần mở cũ xong muộn (đã rời trang, đã mở lại) tự tắt luồng của nó.
  const attemptRef = useRef(0)
  const onDetectedRef = useRef(onDetected)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const statusRef = useRef<CameraStatus>('idle')

  const changeStatus = useCallback((next: CameraStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  const stopLoop = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  const releaseCamera = useCallback(() => {
    attemptRef.current += 1
    stopLoop()
    for (const track of streamRef.current?.getTracks() ?? []) track.stop()
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [stopLoop, videoRef])

  const scanFrame = useCallback(() => {
    const video = videoRef.current
    const decode = decodeRef.current
    if (!video || !decode || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) return
    const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth)
    const width = Math.round(video.videoWidth * scale)
    const height = Math.round(video.videoHeight * scale)
    canvasRef.current ??= document.createElement('canvas')
    const canvas = canvasRef.current
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return
    context.drawImage(video, 0, 0, width, height)
    const found = decode(context.getImageData(0, 0, width, height).data, width, height, { inversionAttempts: 'dontInvert' })
    if (!found?.data) return
    // Đọc được mã thì tắt camera ngay, không để đèn camera sáng trong lúc xem kết quả.
    releaseCamera()
    changeStatus('paused')
    onDetectedRef.current(found.data)
  }, [changeStatus, releaseCamera, videoRef])

  const startLoop = useCallback(() => {
    stopLoop()
    timerRef.current = window.setInterval(scanFrame, SCAN_INTERVAL_MS)
  }, [scanFrame, stopLoop])

  const start = useCallback(async () => {
    releaseCamera()
    if (!window.isSecureContext) return changeStatus('insecure')
    if (!navigator.mediaDevices?.getUserMedia) return changeStatus('unsupported')
    const attempt = attemptRef.current
    changeStatus('starting')
    // Nạp bộ đọc mã trước khi mở camera, để tải lỗi thì không còn luồng camera nào bị bỏ quên.
    if (!decodeRef.current) {
      try {
        decodeRef.current = (await import('jsqr')).default
      } catch {
        if (attempt === attemptRef.current) changeStatus('loadFailed')
        return
      }
      if (attempt !== attemptRef.current) return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      if (attempt !== attemptRef.current) {
        for (const track of stream.getTracks()) track.stop()
        return
      }
      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        // iOS cần video tắt tiếng, phát trong trang (playsInline) mới tự chạy; lỗi phát không chặn việc quét.
        await video.play().catch(() => undefined)
      }
      if (attempt !== attemptRef.current) return
      changeStatus('scanning')
      startLoop()
    } catch (error) {
      if (attempt === attemptRef.current) changeStatus(cameraErrorStatus(error))
    }
  }, [changeStatus, releaseCamera, startLoop, videoRef])

  useEffect(() => {
    let resumeOnShow = false
    const onVisibility = () => {
      if (document.hidden) {
        resumeOnShow = statusRef.current === 'scanning' || statusRef.current === 'starting'
        if (resumeOnShow) {
          releaseCamera()
          changeStatus('idle')
        }
      } else if (resumeOnShow) {
        resumeOnShow = false
        void start()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      releaseCamera()
    }
  }, [changeStatus, releaseCamera, start])

  return { status, start }
}
