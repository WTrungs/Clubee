import { act, renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { problem } from '@/api/mocks/mockHttp'
import { server } from '@/api/mocks/server'
import { vnDate } from '@/api/mocks/mockTime'
import { formatDate } from '@/shared/format/formatDate'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { termRepository } from '@/features/term/model/termRepository'
import { createTestWrapper, signInAs } from '@/testUtils'
import { orgRepository } from '../model/orgRepository'
import { currentHead, positionEndNote, positionPeriod, positionStatusDisplay } from './orgDisplay'
import { usePositionsLookupViewModel } from './usePositionsLookupViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const OLD_TERM = 't-guitar-2025'

describe('looking up current positions (FR-ORG-06)', () => {
  it('lists only current and upcoming positions by default, in pages, without positions of closed terms', async () => {
    signInAs('u-ha')
    const page = await orgRepository.positions('c-guitar', {})
    expect(page).toMatchObject({ page: 0, size: 50 })
    expect(page.content.every((position) => position.status === 'ACTIVE')).toBe(true)
    expect(page.content.some((position) => position.id.startsWith('p-2025-'))).toBe(false)
    // Ban chủ nhiệm đứng trước, rồi tới trưởng ban theo tên ban.
    expect(page.content.slice(0, 3).map((position) => position.role)).toEqual(['PRESIDENT', 'VICE_PRESIDENT', 'TREASURER'])
    // Mở bằng mã nhiệm kỳ đang chạy cũng ra đúng danh sách đó.
    expect((await orgRepository.positions('c-guitar', { termId: 't-guitar-2026' })).totalElements).toBe(page.totalElements)

    const small = await orgRepository.positions('c-guitar', { size: 2, page: 1 })
    expect(small).toMatchObject({ page: 1, size: 2, totalElements: page.totalElements })
    expect(small.content.map((position) => position.id)).toEqual(page.content.slice(2, 4).map((position) => position.id))
  })

  it('filters by scope type and finds people or departments without diacritics', async () => {
    signInAs('u-ha')
    const events = await orgRepository.positions('c-guitar', { scopeType: 'EVENT' })
    expect(events.content.length).toBeGreaterThan(0)
    expect(events.content.every((position) => position.role === 'EVENT_LEAD' && position.scope.type === 'EVENT')).toBe(true)
    expect((await orgRepository.positions('c-guitar', { scopeType: 'SUBCOMMITTEE' })).content.every((position) => position.role === 'SUBCOMMITTEE_LEAD')).toBe(true)

    const linh = await orgRepository.positions('c-guitar', { q: 'khanh linh' })
    expect(linh.content.map((position) => position.holder.id)).toEqual(expect.arrayContaining(['u-linh']))
    expect(linh.content.every((position) => position.holder.id === 'u-linh')).toBe(true)
    expect((await orgRepository.positions('c-guitar', { q: 'hau can', scopeType: 'DEPARTMENT' })).content.map((position) => position.holder.id)).toEqual(['u-long'])

    expect(await fail(orgRepository.positions('c-guitar', { scopeType: 'TEAM' as never }))).toMatchObject({ status: 400, fieldErrors: [{ field: 'scopeType', message: 'Loại phạm vi không hợp lệ.' }] })
  })
})

describe('positions of a closed term (FR-ORG-06, BR-DATA-02)', () => {
  it('returns the standing positions held during that term with department names as they were', async () => {
    signInAs('u-ha')
    const old = await orgRepository.positions('c-guitar', { termId: OLD_TERM })
    expect(old.totalElements).toBe(7)
    expect(old.content.every((position) => position.status === 'ENDED')).toBe(true)
    expect(old.content.some((position) => position.scope.type === 'EVENT' || position.scope.type === 'SUBCOMMITTEE')).toBe(false)
    expect(old.content.find((position) => position.holder.id === 'u-linh')?.scope).toMatchObject({ id: 'd-media', name: 'Truyền thông và Sự kiện' })
    // Người đã rời CLB vẫn có trong lịch sử.
    expect(old.content.map((position) => position.holder.id)).toEqual(expect.arrayContaining(['u-dat', 'u-phuong']))

    const longVice = old.content.find((position) => position.holder.id === 'u-long')
    expect(longVice).toMatchObject({ role: 'DEPARTMENT_VICE_HEAD', endOn: vnDate(-201), revokedOn: vnDate(-200), revokeReason: null, allowedActions: [] })
    expect((await orgRepository.positions('c-guitar', { termId: OLD_TERM, scopeType: 'DEPARTMENT' })).totalElements).toBe(4)

    // Chỉ ban chủ nhiệm thấy lý do thu hồi (SRS 3.5); ngày thu hồi là ngày thao tác, ngày hiệu lực cuối là hôm trước.
    signInAs('u-anh')
    const seenByBoard = (await orgRepository.positions('c-guitar', { termId: OLD_TERM, q: 'long' })).content[0]
    expect(seenByBoard).toMatchObject({ endOn: vnDate(-201), revokedOn: vnDate(-200), revokeReason: 'Xin thôi chức để tập trung thi cuối kỳ.' })
    if (!seenByBoard) throw new Error('Thiếu chức cũ của Long')
    expect(positionEndNote(seenByBoard)).toBe(`Thu hồi ngày ${formatDate(vnDate(-200))}: Xin thôi chức để tập trung thi cuối kỳ.`)
  })

  it('keeps a position revoked with a future handover date active until its last day, with the action date as revokedOn', async () => {
    signInAs('u-anh')
    const linh = (await orgRepository.positions('c-guitar', { q: 'khanh linh', scopeType: 'DEPARTMENT' })).content[0]
    if (!linh) throw new Error('Thiếu Trưởng ban của Linh')
    await orgRepository.revoke('c-guitar', linh.id, { reason: 'Chuyển sang lo hậu cần cho sự kiện lớn.', handoverOn: vnDate(5), version: linh.version })
    const after = (await orgRepository.positions('c-guitar', { q: 'khanh linh', scopeType: 'DEPARTMENT' })).content[0]
    expect(after).toMatchObject({ id: linh.id, status: 'ACTIVE', endOn: vnDate(4), revokedOn: vnDate(0), revokeReason: 'Chuyển sang lo hậu cần cho sự kiện lớn.' })
  })

  it('refuses terms of other clubs, preparing terms and people outside the club', async () => {
    signInAs('u-anh')
    expect(await fail(orgRepository.positions('c-guitar', { termId: 't-english-2026' }))).toMatchObject({ status: 404, code: 'TERM_NOT_FOUND' })
    const preparing = await termRepository.create('c-guitar', { name: 'Nhiệm kỳ 2027–2028', startOn: vnDate(301), endOn: vnDate(665) })
    expect(await fail(orgRepository.positions('c-guitar', { termId: preparing.id }))).toMatchObject({ status: 400 })

    signInAs('u-tu')
    expect(await fail(orgRepository.positions('c-guitar', { termId: OLD_TERM }))).toMatchObject({ status: 403, code: 'NOT_A_MEMBER' })
  })
})

describe('position display', () => {
  it('describes the period, early end and status', () => {
    expect(positionPeriod({ startOn: '2026-09-01', endOn: '2027-08-31', untilHandover: false })).toBe('01/09/2026 – 31/08/2027')
    expect(positionPeriod({ startOn: '2026-09-01', endOn: '2027-08-31', untilHandover: true })).toBe('Từ 01/09/2026, đến khi bàn giao xong')
    expect(positionPeriod({ startOn: '2026-11-01', endOn: null, untilHandover: false })).toBe('Từ 01/11/2026, đến khi sự kiện đóng')
    expect(positionPeriod({ startOn: '2026-11-20', endOn: '2026-11-15', untilHandover: false })).toBe('Hủy trước ngày bắt đầu 20/11/2026')
    expect(positionEndNote({ revokedOn: '2026-03-02', revokeReason: 'Xin thôi chức.' })).toBe('Thu hồi ngày 02/03/2026: Xin thôi chức.')
    expect(positionEndNote({ revokedOn: '2026-03-02', revokeReason: null })).toBeNull()
    expect(positionStatusDisplay.ENDED.label).toBe('Đã kết thúc')
    expect(currentHead([{ role: 'DEPARTMENT_HEAD' as const, status: 'ENDED' as const }])).toBeUndefined()
  })
})

describe('usePositionsLookupViewModel', () => {
  async function renderLookup(path: string) {
    signInAs('u-ha')
    const club = await clubRepository.getClub('c-guitar')
    const { wrapper: Base } = createTestWrapper(path)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Base>
        <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
      </Base>
    )
    return renderHook(() => usePositionsLookupViewModel(true), { wrapper })
  }

  it('opens the closed term from the URL, offers it in the term picker and hides event scopes', async () => {
    const { result } = await renderLookup(`/clubs/c-guitar/structure?tab=positions&term=${OLD_TERM}`)
    await waitFor(() => expect(result.current.closedTerm?.id).toBe(OLD_TERM))
    await waitFor(() => expect(result.current.totalElements).toBe(7))
    expect(result.current.termOptions).toEqual([
      { value: '', label: 'Hiện tại · Nhiệm kỳ 2026–2027' },
      { value: OLD_TERM, label: 'Nhiệm kỳ 2025–2026 (đã đóng)' },
    ])
    expect(result.current.scopeFilters.map((filter) => filter.value)).toEqual(['', 'CLUB', 'DEPARTMENT'])
  })

  it('ignores an event scope in an old link to a closed term, and keeps every scope for the running term', async () => {
    const past = await renderLookup(`/clubs/c-guitar/structure?tab=positions&term=${OLD_TERM}&scope=EVENT`)
    expect(past.result.current.scopeType).toBe('')
    await waitFor(() => expect(past.result.current.totalElements).toBe(7))
    past.unmount()

    const running = await renderLookup('/clubs/c-guitar/structure?tab=positions&term=t-guitar-2026&scope=EVENT')
    expect(running.result.current.scopeType).toBe('EVENT')
    expect(running.result.current.scopeFilters).toHaveLength(5)
  })

  it('drops an event scope when switching to a closed term, since closed terms only list standing positions', async () => {
    const { result } = await renderLookup('/clubs/c-guitar/structure?tab=positions&scope=EVENT')
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.scopeType).toBe('EVENT')
    act(() => result.current.setTermId(OLD_TERM))
    await waitFor(() => expect(result.current.termId).toBe(OLD_TERM))
    expect(result.current.scopeType).toBe('')
  })

  it('reports a failed term list and keeps the chosen term in the picker instead of showing the current term', async () => {
    server.use(http.get('*/clubs/:clubId/terms', () => problem(503, 'Máy chủ đang bận.', 'UNAVAILABLE')))
    const { result } = await renderLookup(`/clubs/c-guitar/structure?tab=positions&term=${OLD_TERM}`)
    await waitFor(() => expect(result.current.termsError).not.toBeNull())
    expect(result.current.termOptions.at(-1)).toEqual({ value: OLD_TERM, label: 'Nhiệm kỳ đã chọn' })
    // Danh sách chức vụ vẫn tải được, chỉ thiếu dòng nêu tên nhiệm kỳ.
    await waitFor(() => expect(result.current.totalElements).toBe(7))
    expect(result.current.closedTerm).toBeNull()
  })
})
