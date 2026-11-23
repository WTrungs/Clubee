import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db, type DbApplication } from '@/api/mocks/db'
import { nowIso, vnDayAt } from '@/api/mocks/mockTime'
import { createTestWrapper, signInAs } from '@/testUtils'
import { recruitmentRepository } from '../model/recruitmentRepository'
import { useMyApplicationsViewModel } from './useApplicationViewModels'
import { useResultActionsViewModel } from './useResultsViewModel'

afterEach(() => vi.restoreAllMocks())

const application = (id: string) => db.applications.find((candidate) => candidate.id === id) as DbApplication

async function finalized() {
  Object.assign(db.recruitments.find((candidate) => candidate.id === 'rec-guitar-k1') ?? {}, { closesAt: vnDayAt(-1, 22) })
  for (const [id, score] of [['ap-tu', 90], ['ap-dat', 70]] as const) {
    application(id).roundResults = ['rr-k1-screen', 'rr-k1-interview'].map((roundId) => ({ roundId, result: 'PASS' as const, score, note: '', by: 'u-anh', at: nowIso() }))
  }
  signInAs('u-anh')
  const proposal = await recruitmentRepository.proposal('c-guitar', 'rec-guitar-k1')
  const decisions = proposal.rows.map((row) => ({ applicationId: row.application.id, decision: row.decision, departmentId: row.departmentId, reserveOrder: row.reserveOrder }))
  return recruitmentRepository.finalize('c-guitar', 'rec-guitar-k1', { decisions, responseDays: 7, version: proposal.version })
}

describe('admission view models (FR-REC-08)', () => {
  it('lets the applicant accept from My applications', async () => {
    await finalized()
    signInAs('u-tu')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useMyApplicationsViewModel(true), { wrapper })
    await waitFor(() => expect(result.current.rows[0]?.allowedActions).toEqual(['RESPOND']))
    const [mine] = result.current.rows
    if (!mine) throw new Error('Thiếu đơn')
    const success = vi.spyOn(toast, 'success')
    act(() => result.current.askRespond(mine, 'ACCEPT'))
    expect(result.current.respondTarget?.decision).toBe('ACCEPT')
    act(() => result.current.confirmRespond())
    await waitFor(() => expect(result.current.rows[0]?.status).toBe('ACCEPTED'))
    expect(success).toHaveBeenCalledWith('Đã nhận kết quả. Bạn đã là thành viên CLB Guitar Sinh viên.')
  })

  it('offers a reserve call only where a seat is free and someone waits, and reports a refused closing', async () => {
    const saved = await finalized()
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useResultActionsViewModel('c-guitar', saved), { wrapper })
    expect(result.current.canCallFor('d-music')).toBe(false)
    expect(result.current.waiting).toBe(2)
    const failure = vi.spyOn(toast, 'error')
    act(() => result.current.openClose())
    act(() => result.current.confirmClose())
    await waitFor(() => expect(failure).toHaveBeenCalledWith('Còn 2 người trúng tuyển chưa trả lời.'))
    expect(result.current.closeOpen).toBe(false)
  })
})
