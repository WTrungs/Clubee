import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { vnDayAt } from '@/api/mocks/mockTime'
import { createTestWrapper, signInAs } from '@/testUtils'
import { isMonth, itemDays, itemPath, itemsByDay, monthGridDays, monthLabel, shiftMonth } from './calendarDisplay'
import { useCalendarViewModel } from './useCalendarViewModel'

describe('calendar display (FR-ATT-09)', () => {
  it('builds whole Monday-first weeks around the month', () => {
    const november = monthGridDays('2026-11')
    expect(november[0]).toBe('2026-10-26')
    expect(november.at(-1)).toBe('2026-12-06')
    expect(november).toHaveLength(42)
    // Tháng 2/2027 bắt đầu thứ Hai, kết thúc Chủ nhật: đúng 4 tuần.
    expect(monthGridDays('2027-02')).toHaveLength(28)
    expect(monthGridDays('2027-02')[0]).toBe('2027-02-01')
  })

  it('moves between months across years and reads only real months', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(monthLabel('2026-03')).toBe('Tháng 3/2026')
    expect(isMonth('2026-13')).toBe(false)
    expect(isMonth('2026-07')).toBe(true)
    expect(isMonth(null)).toBe(false)
  })

  it('puts a multi-day event on each of its days, and an item ending at midnight only on its first day', () => {
    expect(itemDays({ startAt: '2026-11-20T18:00:00+07:00', endAt: '2026-11-22T12:00:00+07:00' })).toEqual(['2026-11-20', '2026-11-21', '2026-11-22'])
    expect(itemDays({ startAt: '2026-11-20T20:00:00+07:00', endAt: '2026-11-21T00:00:00+07:00' })).toEqual(['2026-11-20'])
    const item = { type: 'EVENT' as const, id: 'e-1', clubId: 'c-1', clubName: 'CLB', title: 'Trại', startAt: '2026-11-20T18:00:00+07:00', endAt: '2026-11-21T12:00:00+07:00', location: 'A', relations: ['STAFF' as const], cancelled: false }
    expect([...itemsByDay([item]).keys()]).toEqual(['2026-11-20', '2026-11-21'])
    expect(itemPath(item)).toBe('/clubs/c-1/events/e-1')
    expect(itemPath({ ...item, type: 'SESSION' })).toBe('/clubs/c-1/sessions/e-1')
  })
})

describe('useCalendarViewModel', () => {
  it('loads this month, lists days with items for narrow screens and moves month by month', async () => {
    signInAs('u-linh')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useCalendarViewModel(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isCurrentMonth).toBe(true)
    const planDay = vnDayAt(3, 18).slice(0, 10)
    expect(result.current.byDay.get(planDay)?.map((item) => item.id)).toContain('s-media-plan')
    expect(result.current.agenda.every(({ day }) => day.startsWith(result.current.month))).toBe(true)
    const month = result.current.month
    act(() => result.current.next())
    await waitFor(() => expect(result.current.month).toBe(shiftMonth(month, 1)))
    expect(result.current.isCurrentMonth).toBe(false)
    act(() => result.current.goToday())
    await waitFor(() => expect(result.current.month).toBe(month))
  })

  it('filters by club', async () => {
    signInAs('u-ha')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useCalendarViewModel(), { wrapper })
    await waitFor(() => expect(result.current.clubs.length).toBeGreaterThan(1))
    act(() => result.current.setClubId('c-english'))
    await waitFor(() => expect(result.current.clubId).toBe('c-english'))
    await waitFor(() => expect([...result.current.byDay.values()].flat().every((item) => item.clubId === 'c-english')).toBe(true))
  })
})
