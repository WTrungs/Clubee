import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db } from '@/api/mocks/db'
import { formatDateTime } from '@/shared/format/formatDate'
import { createTestWrapper, signInAs } from '@/testUtils'
import { attendanceRepository } from '../model/attendanceRepository'
import { cameraProblem, canRetryCamera, scanOutcome, useAttendanceScanViewModel } from './useAttendanceScanViewModel'

const weekly = { type: 'SESSION' as const, clubId: 'c-guitar', id: 's-weekly-now' }
const videoRef = { current: null }

async function shownPayload() {
  signInAs('u-anh')
  return (await attendanceRepository.code(weekly, null)).payload
}

function renderScan() {
  const { wrapper } = createTestWrapper('/scan')
  return renderHook(() => useAttendanceScanViewModel(videoRef), { wrapper })
}

describe('scan page view model (FR-ATT-06)', () => {
  it('sends one code, shows the result, and ignores further frames until Scan again', async () => {
    const payload = await shownPayload()
    signInAs('u-hieu')
    const { result } = renderScan()
    act(() => result.current.handleCode(payload))
    expect(result.current.phase.kind).toBe('submitting')
    act(() => result.current.handleCode(payload))
    await waitFor(() => expect(result.current.phase.kind).toBe('done'))
    expect(result.current.phase).toMatchObject({ result: { status: 'LATE', alreadyRecorded: false } })
    expect(db.attendance.filter((record) => record.activityId === 's-weekly-now' && record.userId === 'u-hieu')).toHaveLength(1)

    act(() => result.current.scanAgain())
    expect(result.current.phase.kind).toBe('scanning')
    act(() => result.current.handleCode(payload))
    await waitFor(() => expect(result.current.phase).toMatchObject({ kind: 'done', result: { alreadyRecorded: true } }))
  })

  it('says when the code is not a Clubee attendance code, without calling the server', () => {
    signInAs('u-hieu')
    const { result } = renderScan()
    act(() => result.current.handleCode('https://example.com/menu'))
    expect(result.current.phase).toEqual({ kind: 'failed', message: 'Đây không phải mã điểm danh Clubee.' })
  })

  it('shows the reason from the server when the check-in is refused', async () => {
    const payload = await shownPayload()
    signInAs('u-tu')
    const { result } = renderScan()
    act(() => result.current.handleCode(payload))
    await waitFor(() => expect(result.current.phase).toEqual({ kind: 'failed', message: 'Chỉ thành viên CLB tự điểm danh được bằng mã QR.' }))
  })

  it('explains each camera problem, offers a retry only when it can help, and stays silent while the camera works', () => {
    expect(cameraProblem('denied')).toContain('cho phép Camera')
    expect(cameraProblem('insecure')).toContain('https')
    expect(cameraProblem('noCamera')).toBe('Không tìm thấy camera trên thiết bị này.')
    expect(cameraProblem('loadFailed')).toContain('bộ đọc mã QR')
    expect(cameraProblem('scanning')).toBeNull()
    expect(cameraProblem('paused')).toBeNull()
    expect(canRetryCamera('denied')).toBe(true)
    expect(canRetryCamera('loadFailed')).toBe(true)
    expect(canRetryCamera('insecure')).toBe(false)
    expect(canRetryCamera('unsupported')).toBe(false)
    expect(canRetryCamera('scanning')).toBe(false)
  })

  it('reports success for a new or repeated check-in, and a warning when the existing record is an absence', () => {
    const at = '2026-11-18T18:05:00+07:00'
    expect(scanOutcome({ status: 'LATE', recordedAt: at, alreadyRecorded: false })).toEqual({ tone: 'success', title: 'Đã điểm danh', message: `Ghi nhận Đi muộn lúc ${formatDateTime(at)}.` })
    expect(scanOutcome({ status: 'PRESENT', recordedAt: at, alreadyRecorded: true })).toMatchObject({ tone: 'success', title: 'Bạn đã điểm danh trước đó' })
    expect(scanOutcome({ status: 'EXCUSED', recordedAt: at, alreadyRecorded: true })).toEqual({
      tone: 'warning',
      title: 'Chưa ghi bạn có mặt',
      message: `Bạn đang được ghi Vắng có phép từ ${formatDateTime(at)}. Nếu bạn có mặt, báo người phụ trách để sửa điểm danh.`,
    })
    expect(scanOutcome({ status: 'ABSENT', recordedAt: at, alreadyRecorded: true }).tone).toBe('warning')
  })
})
