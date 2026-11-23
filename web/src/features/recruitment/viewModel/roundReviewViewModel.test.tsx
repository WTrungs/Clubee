import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { createTestWrapper, signInAs } from '@/testUtils'
import { recruitmentRepository } from '../model/recruitmentRepository'
import type { ApplicationDetail } from '../model/recruitmentTypes'
import { recruitmentQueryKeys } from './recruitmentQueryKeys'
import { useRoundReviewViewModel } from './useRoundReviewViewModel'

afterEach(() => vi.restoreAllMocks())

async function render() {
  signInAs('u-anh')
  const detail = await recruitmentRepository.get('c-guitar', 'rec-guitar-k1')
  const { wrapper } = createTestWrapper()
  const view = renderHook(() => useRoundReviewViewModel('c-guitar', detail, true), { wrapper })
  await waitFor(() => expect(view.result.current.loading).toBe(false))
  return view
}

describe('useRoundReviewViewModel (FR-REC-03, NFR-REL-03)', () => {
  it('starts on the first round pending list and records a pass with a score', async () => {
    const { result } = await render()
    expect(result.current.rounds.map((round) => [round.label, round.pending])).toEqual([
      ['Vòng 1: Lọc đơn', 1],
      ['Vòng 2: Phỏng vấn', 1],
    ])
    expect(result.current.rows.map((row) => row.id)).toEqual(['ap-dat'])
    const [dat] = result.current.rows
    if (!dat) throw new Error('Thiếu đơn')
    expect(result.current.actionsOf(dat)).toEqual(['PASS', 'FAIL'])
    act(() => result.current.open(dat, 'PASS'))
    act(() => result.current.submit('PASS', 72, ''))
    await waitFor(() => expect(result.current.target).toBeNull())
    expect(db.applications.find((application) => application.id === 'ap-dat')?.roundResults[0]).toMatchObject({ result: 'PASS', score: 72 })
  })

  it('refreshes an open application detail after a review', async () => {
    signInAs('u-anh')
    const detail = await recruitmentRepository.get('c-guitar', 'rec-guitar-k1')
    const { wrapper, queryClient } = createTestWrapper()
    const before = await recruitmentRepository.application('c-guitar', 'rec-guitar-k1', 'ap-dat')
    queryClient.setQueryData(recruitmentQueryKeys.application('c-guitar', 'ap-dat'), before)
    const { result } = renderHook(() => useRoundReviewViewModel('c-guitar', detail, true), { wrapper })
    await waitFor(() => expect(result.current.rows.length).toBe(1))
    const [dat] = result.current.rows
    if (!dat) throw new Error('Thiếu đơn')
    act(() => result.current.open(dat, 'PASS'))
    expect(result.current.target).toMatchObject({ roundId: 'rr-k1-screen', roundName: 'Lọc đơn' })
    act(() => result.current.submit('PASS', 64, ''))
    await waitFor(() => expect(result.current.target).toBeNull())
    expect(queryClient.getQueryData<ApplicationDetail>(recruitmentQueryKeys.application('c-guitar', 'ap-dat'))?.roundResults[0]).toMatchObject({ score: 64 })
  })

  it('closes and reloads when someone else reviewed the application first', async () => {
    const { result } = await render()
    const [dat] = result.current.rows
    if (!dat) throw new Error('Thiếu đơn')
    const stored = db.applications.find((application) => application.id === 'ap-dat')
    if (stored) stored.version += 1
    const failure = vi.spyOn(toast, 'error')
    act(() => result.current.open(dat, 'FAIL'))
    act(() => result.current.submit('FAIL', null, 'Chưa phù hợp lịch.'))
    await waitFor(() => expect(failure).toHaveBeenCalledWith(expect.stringContaining('vừa được người khác xét')))
    expect(result.current.target).toBeNull()
  })
})
