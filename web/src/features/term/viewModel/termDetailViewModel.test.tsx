import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { db } from '@/api/mocks/db'
import { vnDate } from '@/api/mocks/mockTime'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { holderPeriodText, parseTermDetailTab, useTermDetailViewModel } from './useTermDetailViewModel'

async function renderDetail(entry: string) {
  signInAs('u-ha')
  const club = await clubRepository.getClub('c-guitar')
  const { wrapper: Base } = createTestWrapper(entry)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>
        <Routes>
          <Route path="/clubs/:clubId/terms/:termId" element={children} />
        </Routes>
      </ClubContext.Provider>
    </Base>
  )
  const view = renderHook(() => useTermDetailViewModel(), { wrapper })
  await waitFor(() => expect(view.result.current.loading).toBe(false))
  return view
}

describe('term detail texts (FR-TERM-08)', () => {
  it('falls back to the structure tab and describes how long someone held a position', () => {
    expect(parseTermDetailTab('ledger')).toBe('ledger')
    expect(parseTermDetailTab('khac')).toBe('structure')
    expect(parseTermDetailTab(null)).toBe('structure')
    expect(holderPeriodText({ role: 'DEPARTMENT_HEAD', startOn: '2025-09-01', endOn: '2026-08-31', revoked: false })).toBe('Trưởng ban · 01/09/2025 – 31/08/2026')
    expect(holderPeriodText({ role: 'TREASURER', startOn: '2025-09-01', endOn: null, revoked: true })).toBe('Thủ quỹ · 01/09/2025 – tới khi bàn giao xong · đã thu hồi')
  })
})

describe('useTermDetailViewModel (FR-TERM-08)', () => {
  it('loads the term from the address and only fetches the ledger once its tab opens', async () => {
    const template = db.transactions.find((transaction) => transaction.id === 'tx-dues-s1')
    if (!template) throw new Error('Thiếu giao dịch seed')
    db.transactions.push({ ...template, id: 'tx-old-dues', occurredOn: vnDate(-200) }, { ...template, id: 'tx-before-term', occurredOn: vnDate(-500) })
    const { result } = await renderDetail('/clubs/c-guitar/terms/t-guitar-2025')
    expect(result.current).toMatchObject({ tab: 'structure', term: { name: 'Nhiệm kỳ 2025–2026' } })
    expect(result.current.ledger.fundId).not.toBeNull()
    expect(result.current.ledger.rows).toHaveLength(0)

    act(() => result.current.setTab('ledger'))
    await waitFor(() => expect(result.current.ledger.loading).toBe(false))
    expect(result.current.ledger.rows.map((row) => row.id)).toEqual(['tx-old-dues'])
  })

  it('opens the tab named on the address', async () => {
    const { result } = await renderDetail('/clubs/c-guitar/terms/t-guitar-2026?tab=events')
    expect(result.current.tab).toBe('events')
    await waitFor(() => expect(result.current.events.loading).toBe(false))
    expect(result.current.events.rows.length).toBeGreaterThan(0)
  })
})
