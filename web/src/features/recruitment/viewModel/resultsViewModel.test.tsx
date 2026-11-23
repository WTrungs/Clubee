import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db, type DbApplication } from '@/api/mocks/db'
import { nowIso, vnDayAt } from '@/api/mocks/mockTime'
import { createTestWrapper, signInAs } from '@/testUtils'
import { recruitmentRepository } from '../model/recruitmentRepository'
import { useResultsViewModel } from './useResultsViewModel'

/** Đợt đã đóng, hai đơn qua hết hai vòng; ban nhạc còn 1 chỉ tiêu. */
function closedWithTwoPassed() {
  const recruitment = db.recruitments.find((candidate) => candidate.id === 'rec-guitar-k1')
  if (recruitment) Object.assign(recruitment, { closesAt: vnDayAt(-1, 22), quotas: [{ departmentId: 'd-music', quota: 1 }, { departmentId: 'd-logistics', quota: 1 }, { departmentId: 'd-media', quota: 1 }] })
  for (const [id, total] of [['ap-tu', 80], ['ap-dat', 70]] as const) {
    const application = db.applications.find((candidate) => candidate.id === id) as DbApplication
    application.roundResults = ['rr-k1-screen', 'rr-k1-interview'].map((roundId) => ({ roundId, result: 'PASS' as const, score: total, note: '', by: 'u-anh', at: nowIso() }))
  }
}

async function render() {
  signInAs('u-anh')
  const detail = await recruitmentRepository.get('c-guitar', 'rec-guitar-k1')
  const { wrapper } = createTestWrapper()
  const view = renderHook(() => useResultsViewModel('c-guitar', detail, true), { wrapper })
  await waitFor(() => expect(view.result.current.loading).toBe(false))
  return view
}

describe('useResultsViewModel (FR-REC-07)', () => {
  it('starts from the proposal, keeps the sheet open on an over-quota answer and finalizes once fixed', async () => {
    closedWithTwoPassed()
    const { result } = await render()
    expect(result.current).toMatchObject({ canFinalize: true, blockers: [] })
    act(() => result.current.start())
    expect(result.current.days).toBe('7')
    expect(result.current.draftOf('ap-dat')).toMatchObject({ decision: 'ADMITTED', departmentId: 'd-logistics' })

    act(() => result.current.update('ap-dat', { departmentId: 'd-music' }))
    expect(result.current.usage.find((usage) => usage.departmentId === 'd-music')).toMatchObject({ admitted: 2, over: true })
    act(() => result.current.submit())
    await waitFor(() => expect(result.current.serverError).toContain('vượt chỉ tiêu'))
    expect(result.current.editing).toBe(true)

    act(() => result.current.update('ap-dat', { decision: 'RESERVE', reserveOrder: '' }))
    act(() => result.current.submit())
    expect(result.current.problems).toEqual(['Thứ tự dự bị là số nguyên từ 1.'])
    act(() => result.current.update('ap-dat', { reserveOrder: '1' }))
    act(() => result.current.submit())
    await waitFor(() => expect(result.current.editing).toBe(false))
    expect(db.applications.find((candidate) => candidate.id === 'ap-dat')).toMatchObject({ status: 'RESERVE', outcome: { departmentId: 'd-music', reserveOrder: 1 } })
  })
})
