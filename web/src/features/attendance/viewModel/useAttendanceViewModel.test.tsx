import { act, renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it } from 'vitest'
import { db } from '@/api/mocks/db'
import { problem } from '@/api/mocks/mockHttp'
import { server } from '@/api/mocks/server'
import { createTestWrapper, signInAs } from '@/testUtils'
import type { AttendanceActivityRef } from '../model/attendanceTypes'
import { useAttendanceViewModel } from './useAttendanceViewModel'

const weekly: AttendanceActivityRef = { type: 'SESSION', clubId: 'c-guitar', id: 's-weekly-now' }
const RECORD_URL = '*/api/v1/clubs/:clubId/sessions/:sessionId/attendance/records/:userId'
const SHEET_URL = '*/api/v1/clubs/:clubId/sessions/:sessionId/attendance'
const rowOf = (vm: ReturnType<typeof useAttendanceViewModel>, userId: string) => vm.sheet?.rows.content.find((row) => row.person.id === userId)

function renderViewModel() {
  signInAs('u-anh')
  const { wrapper } = createTestWrapper()
  return renderHook(() => useAttendanceViewModel(weekly), { wrapper })
}

describe('useAttendanceViewModel', () => {
  it('locks the row while saving and shows only what the server stored (NFR-REL-01, 04)', async () => {
    const { result } = renderViewModel()
    await waitFor(() => expect(result.current.sheet).not.toBeNull())
    expect(rowOf(result.current, 'u-long')?.record).toBeNull()

    // Giữ request lại cho tới khi đã thấy dòng bị khóa; handler không trả gì nên request đi tiếp xuống handler thật.
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.put(RECORD_URL, async () => {
        await gate
      }),
    )
    let saving: Promise<unknown> = Promise.resolve()
    act(() => {
      saving = result.current.markStatus({ userId: 'u-long', fullName: 'Long', status: 'PRESENT', version: 0 })
    })
    await waitFor(() => expect(result.current.pendingUserIds.has('u-long')).toBe(true))
    expect(rowOf(result.current, 'u-long')?.record).toBeNull()

    release()
    await act(() => saving)
    await waitFor(() => expect(result.current.pendingUserIds.has('u-long')).toBe(false))
    expect(rowOf(result.current, 'u-long')?.record?.status).toBe('PRESENT')
    expect(result.current.announcement).toBe('Đã ghi Có mặt cho Long.')
  })

  it('shows both rows as stored when two people are marked back to back', async () => {
    const { result } = renderViewModel()
    await waitFor(() => expect(result.current.sheet).not.toBeNull())

    await act(() =>
      Promise.all([
        result.current.markStatus({ userId: 'u-long', fullName: 'Long', status: 'PRESENT', version: 0 }),
        result.current.markStatus({ userId: 'u-khoa', fullName: 'Khoa', status: 'LATE', version: 0 }),
      ]),
    )
    await waitFor(() => expect(result.current.pendingUserIds.size).toBe(0))
    expect(rowOf(result.current, 'u-long')?.record).toMatchObject({ status: 'PRESENT', version: 1 })
    expect(rowOf(result.current, 'u-khoa')?.record).toMatchObject({ status: 'LATE', version: 1 })
  })

  it('shows the stored row even when reloading the list afterwards fails', async () => {
    const { result } = renderViewModel()
    await waitFor(() => expect(result.current.sheet).not.toBeNull())
    server.use(http.get(SHEET_URL, () => problem(500, 'Máy chủ đang bận.', 'INTERNAL')))

    await act(() => result.current.markStatus({ userId: 'u-long', fullName: 'Long', status: 'PRESENT', version: 0 }))
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.pendingUserIds.size).toBe(0)
    expect(rowOf(result.current, 'u-long')?.record).toMatchObject({ status: 'PRESENT', version: 1 })
  })

  it('keeps the extra dialog open with the reason when someone else marked that person first (409)', async () => {
    const { result } = renderViewModel()
    await waitFor(() => expect(result.current.sheet).not.toBeNull())
    act(() => result.current.setExtraOpen(true))
    // Người khác vừa ghi Trịnh Hải Yến trước.
    db.attendance.push({
      id: 'a-other',
      activityType: 'SESSION',
      activityId: 's-weekly-now',
      day: null,
      userId: 'u-yen',
      status: 'PRESENT',
      method: 'MANUAL',
      extra: true,
      recordedBy: 'u-huy',
      recordedAt: '2026-11-07T18:00:00+07:00',
      version: 1,
    })

    act(() => result.current.addExtra('u-yen', 'Yến'))
    await waitFor(() => expect(result.current.extraError).toBe('Người này vừa được điểm danh ở nơi khác. Danh sách đã được tải lại.'))
    expect(result.current.extraOpen).toBe(true)
    await waitFor(() => expect(result.current.sheet?.counts.extra).toBe(1))
  })

  it('closes the extra dialog once the server stored the extra person', async () => {
    const { result } = renderViewModel()
    await waitFor(() => expect(result.current.sheet).not.toBeNull())
    act(() => result.current.setExtraOpen(true))
    act(() => result.current.addExtra('u-yen', 'Yến'))
    await waitFor(() => expect(result.current.extraOpen).toBe(false))
    await waitFor(() => expect(result.current.sheet?.counts.extra).toBe(1))
    expect(result.current.announcement).toBe('Đã thêm Yến và ghi Có mặt.')
  })

  it('leaves the row untouched when the server fails', async () => {
    server.use(http.put(RECORD_URL, () => problem(500, 'Máy chủ đang bận.', 'INTERNAL')))
    const { result } = renderViewModel()
    await waitFor(() => expect(result.current.sheet).not.toBeNull())

    await act(() => result.current.markStatus({ userId: 'u-long', fullName: 'Long', status: 'PRESENT', version: 0 }))
    await waitFor(() => expect(result.current.pendingUserIds.size).toBe(0))
    expect(rowOf(result.current, 'u-long')?.record).toBeNull()
    expect(result.current.announcement).toBe('')
  })

  it('raises the conflict banner when someone else marked the person meanwhile (409)', async () => {
    const { result } = renderViewModel()
    await waitFor(() => expect(result.current.sheet).not.toBeNull())
    const stored = db.attendance.find((record) => record.activityId === 's-weekly-now' && record.userId === 'u-bao')
    if (stored) stored.version += 1

    await act(() => result.current.markStatus({ userId: 'u-bao', fullName: 'Bảo', status: 'LATE', version: 1 }))
    expect(result.current.conflict).toBe(true)
    expect(stored?.status).toBe('PRESENT')
  })

  it('keeps the close dialog open with a notice when the list changed before closing', async () => {
    const { result } = renderViewModel()
    await waitFor(() => expect(result.current.sheet).not.toBeNull())
    const sheet = db.attendanceSheets.find((candidate) => candidate.activityId === 's-weekly-now')
    if (sheet) sheet.version += 1

    act(() => result.current.openClose())
    act(() => result.current.confirmClose())
    await waitFor(() => expect(result.current.closeError).toBe('Danh sách vừa thay đổi. Kiểm tra lại số người trước khi chốt.'))
    expect(result.current.closeOpen).toBe(true)
    expect(sheet?.closedAt).toBeNull()
  })
})
