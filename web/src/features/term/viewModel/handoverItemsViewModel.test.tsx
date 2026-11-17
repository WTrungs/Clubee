import { act, renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { db } from '@/api/mocks/db'
import { API } from '@/api/mocks/mockHttp'
import { server } from '@/api/mocks/server'
import { vnDate } from '@/api/mocks/mockTime'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import type { Handover, HandoverItem } from '../model/handoverTypes'
import { termRepository } from '../model/termRepository'
import { useEventLeadDecisionViewModel } from './useEventLeadDecisionViewModel'
import { useHandoverItemsViewModel } from './useHandoverItemsViewModel'

async function openHandover(): Promise<Handover> {
  signInAs('u-anh')
  const next = await termRepository.create('c-guitar', { name: 'Nhiệm kỳ 2027–2028', startOn: vnDate(301), endOn: vnDate(665) })
  const started = await termRepository.startHandover('c-guitar', { fromTermId: 't-guitar-2026', toTermId: next.id })
  const saved = await termRepository.saveAppointments('c-guitar', started.id, { appointments: [{ role: 'PRESIDENT', departmentId: null, userId: 'u-linh' }], version: started.version })
  signInAs('u-linh')
  return termRepository.handover('c-guitar', saved.id)
}

async function renderItems(handover: Handover, entry = '/') {
  const club = await clubRepository.getClub('c-guitar')
  const { wrapper: Base, queryClient } = createTestWrapper(entry)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
    </Base>
  )
  const view = renderHook(() => useHandoverItemsViewModel(handover), { wrapper })
  await waitFor(() => expect(view.result.current.loading).toBe(false))
  return { ...view, queryClient }
}

const eventItem = (overrides: Partial<HandoverItem>): HandoverItem => ({
  id: 'hi-event',
  kind: 'EVENT',
  status: 'PENDING',
  title: 'Đêm nhạc Mùa đông',
  fund: null,
  task: null,
  event: { status: 'REGISTRATION_OPEN', startAt: '2026-12-20T18:00:00+07:00', endAt: '2026-12-20T21:00:00+07:00', lead: { id: 'u-bao', fullName: 'Trần Quốc Bảo' }, openTaskCount: 0, needsLeadDecision: true },
  eventLead: null,
  note: null,
  confirmedBy: null,
  confirmedAt: null,
  allowedActions: ['CONFIRM'],
  version: 1,
  ...overrides,
})

async function renderDecision(item: HandoverItem) {
  signInAs('u-anh')
  const club = await clubRepository.getClub('c-guitar')
  const { wrapper: Base } = createTestWrapper()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
    </Base>
  )
  const view = renderHook(() => useEventLeadDecisionViewModel(item), { wrapper })
  await waitFor(() => expect(view.result.current.candidatesLoading).toBe(false))
  return view
}

describe('useEventLeadDecisionViewModel (FR-TERM-05, BR-ORG-01)', () => {
  it('keeps the current lead by default and leaves them out of the replacement list', async () => {
    const { result } = await renderDecision(eventItem({}))
    expect(result.current).toMatchObject({ action: 'KEEP', canKeep: true, canSubmit: true, previousGone: false })
    expect(result.current.options.some((candidate) => candidate.id === 'u-bao')).toBe(false)
    expect(result.current.request()).toEqual({ action: 'KEEP' })
    act(() => result.current.setAction('REPLACE'))
    expect(result.current.canSubmit).toBe(false)
    act(() => result.current.setUserId('u-tram'))
    expect(result.current.request()).toEqual({ action: 'REPLACE', userId: 'u-tram' })
  })

  it('starts on replace when the event has no lead, and cannot keep', async () => {
    const event = eventItem({}).event
    const { result } = await renderDecision(eventItem({ event: event && { ...event, lead: null } }))
    expect(result.current).toMatchObject({ action: 'REPLACE', canKeep: false, canSubmit: false })
  })

  it('asks to choose again when the previous replacement is no longer a candidate', async () => {
    const { result } = await renderDecision(eventItem({ status: 'CONFIRMED', eventLead: { action: 'REPLACE', person: { id: 'u-tu', fullName: 'Người ngoài CLB' } } }))
    expect(result.current).toMatchObject({ action: 'REPLACE', selected: '', previousGone: true, canSubmit: false })

    const kept = await renderDecision(eventItem({ status: 'CONFIRMED', eventLead: { action: 'REPLACE', person: { id: 'u-tram', fullName: 'Ngô Bảo Trâm' } } }))
    expect(kept.result.current).toMatchObject({ action: 'REPLACE', selected: 'u-tram', previousGone: false, canSubmit: true })
  })
})

describe('useHandoverItemsViewModel (FR-TERM-05, NFR-REL-01, NFR-REL-03)', () => {
  it('reads the kind tab from the URL and offers the pending page as one batch', async () => {
    const handover = await openHandover()
    const { result } = await renderItems(handover, '/?kind=TASK')
    expect(result.current.kind).toBe('TASK')
    expect(result.current.items.every((item) => item.kind === 'TASK')).toBe(true)
    expect(result.current.batch).toHaveLength(result.current.items.length)
    expect(result.current.kindTabs.find((tab) => tab.value === 'TASK')?.count).toBe(handover.counts.byKind.TASK.pending)
  })

  it('opens the lead dialog for running events instead of confirming straight away', async () => {
    const handover = await openHandover()
    const { result } = await renderItems(handover, '/?kind=EVENT')
    const running = result.current.items.find((item) => item.event?.needsLeadDecision)
    if (!running) throw new Error('Thiếu sự kiện cần quyết định')
    act(() => result.current.confirmItem(running))
    expect(result.current.decisionItem?.id).toBe(running.id)
    expect(result.current.batchSkipped).toBeGreaterThan(0)
  })

  it('locks the buttons while waiting and confirms only after the server answers', async () => {
    const handover = await openHandover()
    const { result } = await renderItems(handover, '/?kind=TASK')
    const first = result.current.items[0]
    if (!first) throw new Error('Thiếu việc')
    act(() => result.current.confirmItem(first))
    await waitFor(() => expect(result.current.locked).toBe(true))
    expect(result.current.isConfirming(first.id)).toBe(true)
    await waitFor(() => expect(result.current.locked).toBe(false))
    expect(db.handoverItems.find((item) => item.id === first.id)?.status).toBe('CONFIRMED')
    await waitFor(() => expect(result.current.items.find((item) => item.id === first.id)?.status).toBe('CONFIRMED'))
  })

  it('on 409 shows how many items changed and reloads the catalog without confirming anything', async () => {
    const handover = await openHandover()
    const { result } = await renderItems(handover, '/?kind=TASK')
    const loaded = result.current.items.length
    // Một việc vừa xong ở nơi khác sau khi trang đã tải.
    const target = result.current.items[0]
    const record = db.tasks.find((task) => task.title === target?.title)
    if (!record) throw new Error('Thiếu việc')
    record.status = 'DONE'

    act(() => result.current.openBatch())
    act(() => result.current.confirmBatch())
    await waitFor(() => expect(result.current.notice?.tone).toBe('warning'))
    expect(result.current.notice?.message).toMatch(/^Một mục vừa thay đổi/)
    expect(result.current.batchOpen).toBe(false)
    expect(db.handoverItems.filter((item) => item.status === 'CONFIRMED')).toHaveLength(0)
    await waitFor(() => expect(result.current.items.find((item) => item.id === target?.id)?.status).toBe('RESOLVED'))
    expect(result.current.items).toHaveLength(loaded)
  })

  it('keeps a decision error inside the dialog and shows other errors as a notice', async () => {
    const handover = await openHandover()
    const { result } = await renderItems(handover, '/?kind=EVENT')
    const running = result.current.items.find((item) => item.event?.needsLeadDecision)
    if (!running) throw new Error('Thiếu sự kiện cần quyết định')
    act(() => result.current.confirmItem(running))
    act(() => result.current.submitDecision({ action: 'REPLACE', userId: 'u-tu' }))
    await waitFor(() => expect(result.current.decisionError).toMatch(/không đủ điều kiện làm Trưởng BTC/))
    expect(result.current.notice).toBeNull()

    server.use(http.post(`${API}/clubs/:clubId/handovers/:handoverId/confirmations`, () => Response.error()))
    act(() => result.current.closeDecision())
    const plain = result.current.items.find((item) => !item.event?.needsLeadDecision && item.allowedActions.includes('CONFIRM'))
    if (!plain) throw new Error('Thiếu sự kiện không cần quyết định')
    act(() => result.current.confirmItem(plain))
    await waitFor(() => expect(result.current.notice?.tone).toBe('danger'))
  })
})
