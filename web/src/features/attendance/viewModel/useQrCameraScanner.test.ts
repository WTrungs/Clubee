import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cameraErrorStatus, useQrCameraScanner } from './useQrCameraScanner'

const decode = vi.hoisted(() => vi.fn())
vi.mock('jsqr', () => ({ default: decode }))

const PAYLOAD = 'clubee://attendance?type=SESSION&club=c-guitar&id=s-1&code=abc'

function fakeStream() {
  const track = { stop: vi.fn() }
  return { track, stream: { active: true, getTracks: () => [track] } as unknown as MediaStream }
}

/** Video giả đủ cho hook: jsdom không phát được video. */
function fakeVideo() {
  return { srcObject: null, readyState: 4, videoWidth: 640, videoHeight: 480, play: vi.fn().mockResolvedValue(undefined) } as unknown as HTMLVideoElement
}

let getUserMedia: ReturnType<typeof vi.fn>
let hidden = false

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  getUserMedia = vi.fn()
  hidden = false
  decode.mockReset().mockReturnValue(null)
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  } as unknown as RenderingContext)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'mediaDevices')
  Reflect.deleteProperty(window, 'isSecureContext')
  Reflect.deleteProperty(document, 'hidden')
})

function renderScanner(onDetected = vi.fn()) {
  const videoRef = { current: fakeVideo() }
  const view = renderHook(() => useQrCameraScanner(videoRef, onDetected))
  return { ...view, videoRef, onDetected }
}

async function startCamera(result: { current: ReturnType<typeof useQrCameraScanner> }) {
  await act(async () => {
    await result.current.start()
  })
}

describe('camera error mapping', () => {
  it('tells denied permission, missing camera and unsupported browsers apart', () => {
    expect(cameraErrorStatus(new DOMException('', 'NotAllowedError'))).toBe('denied')
    expect(cameraErrorStatus(new DOMException('', 'SecurityError'))).toBe('denied')
    expect(cameraErrorStatus(new DOMException('', 'NotFoundError'))).toBe('noCamera')
    expect(cameraErrorStatus(new DOMException('', 'OverconstrainedError'))).toBe('noCamera')
    expect(cameraErrorStatus(new DOMException('', 'NotSupportedError'))).toBe('unsupported')
    expect(cameraErrorStatus(new Error('busy'))).toBe('error')
  })
})

describe('useQrCameraScanner (FR-ATT-06)', () => {
  it('does not ask for the camera on an insecure page or a browser without camera access', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })
    const insecure = renderScanner()
    await startCamera(insecure.result)
    expect(insecure.result.current.status).toBe('insecure')

    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    const old = renderScanner()
    await startCamera(old.result)
    expect(old.result.current.status).toBe('unsupported')
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('opens the back camera, then turns it off as soon as a code is read', async () => {
    const { track, stream } = fakeStream()
    getUserMedia.mockResolvedValue(stream)
    const { result, videoRef, onDetected } = renderScanner()
    await startCamera(result)
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    expect(result.current.status).toBe('scanning')
    expect(videoRef.current.srcObject).toBe(stream)

    act(() => vi.advanceTimersByTime(200))
    expect(onDetected).not.toHaveBeenCalled()
    decode.mockReturnValue({ data: PAYLOAD })
    act(() => vi.advanceTimersByTime(200))
    expect(onDetected).toHaveBeenCalledExactlyOnceWith(PAYLOAD)
    expect(track.stop).toHaveBeenCalled()
    expect(result.current.status).toBe('paused')
    act(() => vi.advanceTimersByTime(1000))
    expect(onDetected).toHaveBeenCalledOnce()
  })

  it('turns the camera off while the tab is hidden and back on when it shows again', async () => {
    const first = fakeStream()
    const second = fakeStream()
    getUserMedia.mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream)
    const { result } = renderScanner()
    await startCamera(result)

    hidden = true
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(first.track.stop).toHaveBeenCalled()
    expect(result.current.status).toBe('idle')

    hidden = false
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })
    await act(async () => {})
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('scanning')
  })

  it('turns the camera off when leaving the page, including a camera that opens only after leaving', async () => {
    const { track, stream } = fakeStream()
    getUserMedia.mockResolvedValue(stream)
    const open = renderScanner()
    await startCamera(open.result)
    open.unmount()
    expect(track.stop).toHaveBeenCalled()

    const late = fakeStream()
    let resolve: (value: MediaStream) => void = () => {}
    getUserMedia.mockReturnValue(new Promise<MediaStream>((done) => (resolve = done)))
    const slow = renderScanner()
    let pending: Promise<void> = Promise.resolve()
    await act(async () => {
      pending = slow.result.current.start()
      await Promise.resolve()
    })
    slow.unmount()
    await act(async () => {
      resolve(late.stream)
      await pending
    })
    expect(late.track.stop).toHaveBeenCalled()
  })

  it('reports a denied permission', async () => {
    getUserMedia.mockRejectedValue(new DOMException('', 'NotAllowedError'))
    const { result } = renderScanner()
    await startCamera(result)
    expect(result.current.status).toBe('denied')
  })
})
