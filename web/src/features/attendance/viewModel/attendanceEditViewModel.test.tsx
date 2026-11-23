import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { createTestWrapper, signInAs } from '@/testUtils'
import { useAttendanceViewModel } from './useAttendanceViewModel'

const PHOTO = { type: 'SESSION' as const, clubId: 'c-guitar', id: 's-media-photo' }
const vyRecord = () => db.attendance.find((record) => record.activityId === 's-media-photo' && record.userId === 'u-vy')

afterEach(() => vi.restoreAllMocks())

async function openedForVy() {
  signInAs('u-anh')
  const { wrapper } = createTestWrapper()
  const hook = renderHook(() => useAttendanceViewModel(PHOTO), { wrapper })
  await waitFor(() => expect(hook.result.current.sheet).not.toBeNull())
  const row = hook.result.current.sheet?.rows.content.find((candidate) => candidate.person.id === 'u-vy')
  if (!row) throw new Error('Thiếu dòng của Vy')
  act(() => hook.result.current.openEdit({ userId: 'u-vy', fullName: row.person.fullName, record: row.record }))
  return hook
}

describe('editing a closed sheet (FR-ATT-08)', () => {
  it('offers editing only after closing, saves with the reason and closes the dialog', async () => {
    const success = vi.spyOn(toast, 'success')
    const { result } = await openedForVy()
    expect(result.current.canEdit).toBe(true)
    expect(result.current.canMark).toBe(false)
    expect(result.current.editTarget?.userId).toBe('u-vy')
    act(() => result.current.submitEdit('EXCUSED', 'Vy đã báo ốm qua tin nhắn trước buổi.'))
    await waitFor(() => expect(result.current.editTarget).toBeNull())
    expect(success).toHaveBeenCalledWith('Đã sửa thành Vắng có phép cho Hoàng Thảo Vy.')
    expect(vyRecord()?.changes).toHaveLength(1)
    await waitFor(() => expect(result.current.sheet?.rows.content.find((row) => row.person.id === 'u-vy')?.record?.changes).toHaveLength(1))
  })

  it('keeps the dialog open with the server reason when the edit is refused', async () => {
    const { result } = await openedForVy()
    act(() => result.current.submitEdit('ABSENT', 'Giữ nguyên để kiểm thử.'))
    await waitFor(() => expect(result.current.editError).toBe('Trạng thái mới trùng trạng thái đang ghi.'))
    expect(result.current.editTarget?.userId).toBe('u-vy')
    expect(result.current.conflict).toBe(false)
  })

  it('closes the dialog and shows the conflict banner when someone else edited first', async () => {
    const { result } = await openedForVy()
    const record = vyRecord()
    if (record) record.version += 1
    act(() => result.current.submitEdit('EXCUSED', 'Vy đã báo ốm qua tin nhắn trước buổi.'))
    await waitFor(() => expect(result.current.conflict).toBe(true))
    expect(result.current.editTarget).toBeNull()
    expect(result.current.editError).toBeNull()
  })
})
