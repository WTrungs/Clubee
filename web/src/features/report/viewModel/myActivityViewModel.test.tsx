import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/api/mocks/server'
import { vnDate } from '@/api/mocks/mockTime'
import { createTestWrapper, signInAs } from '@/testUtils'
import type { ReportPeriods } from '../model/reportPeriodTypes'
import { rateLabel, useMyActivityViewModel } from './useMyActivityViewModel'
import { useReportPeriodParams } from './useReportPeriodParams'

const periods: ReportPeriods = {
  months: [
    { kind: 'MONTH', key: '2026-11', label: 'Tháng 11/2026', from: '2026-11-01', to: '2026-11-30' },
    { kind: 'MONTH', key: '2026-10', label: 'Tháng 10/2026', from: '2026-10-01', to: '2026-10-31' },
  ],
  semesters: [],
  terms: [{ kind: 'TERM', key: 't-1', label: 'Nhiệm kỳ 2026', from: '2026-01-01', to: '2026-12-31' }],
}

describe('rateLabel', () => {
  it('shows a rounded percentage, or says there is nothing to count', () => {
    expect(rateLabel(2 / 3)).toBe('67%')
    expect(rateLabel(1)).toBe('100%')
    expect(rateLabel(null)).toBe('Chưa có số liệu')
  })
})

describe('useReportPeriodParams', () => {
  it('defaults to the newest month, switches kind and checks a custom range before using it', () => {
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useReportPeriodParams(periods), { wrapper })
    expect(result.current.query).toEqual({ period: 'MONTH', key: '2026-11' })
    expect(result.current.ready).toBe(true)
    act(() => result.current.setPeriod('TERM'))
    expect(result.current.query).toEqual({ period: 'TERM', key: 't-1' })
    act(() => result.current.setPeriod('CUSTOM'))
    expect(result.current.ready).toBe(false)
    act(() => {
      result.current.setCustomFrom('10/11/2026')
      result.current.setCustomTo('01/11/2026')
    })
    act(() => result.current.applyCustom())
    expect(result.current.customError).toEqual({ field: 'to', message: 'Ngày kết thúc không trước ngày bắt đầu.' })
    act(() => result.current.setCustomTo('20/11/2026'))
    act(() => result.current.applyCustom())
    expect(result.current.query).toEqual({ period: 'CUSTOM', from: '2026-11-10', to: '2026-11-20' })
  })
})

describe('useMyActivityViewModel (FR-ATT-10, FR-RPT-02)', () => {
  it('picks the first club, loads the report, then the attendance history on the other tab', async () => {
    signInAs('u-ha')
    const { wrapper } = createTestWrapper(`/me/activity?period=CUSTOM&from=${vnDate(-30)}&to=${vnDate(0)}`)
    const { result } = renderHook(() => useMyActivityViewModel(), { wrapper })
    await waitFor(() => expect(result.current.report).not.toBeNull())
    expect(result.current.club?.clubId).toBe('c-guitar')
    expect(result.current.report?.attendance.total).toBe(3)
    act(() => result.current.setTab('history'))
    await waitFor(() => expect(result.current.attendance?.content.length).toBe(3))
  })

  it('marks clubs that were left and shows server reasons for an invalid period', async () => {
    signInAs('u-dat')
    const { wrapper } = createTestWrapper('/me/activity?period=MONTH&key=1999-01')
    const { result } = renderHook(() => useMyActivityViewModel(), { wrapper })
    await waitFor(() => expect(result.current.club?.status).toBe('LEFT'))
    await waitFor(() => expect(result.current.invalidReasons).toEqual(['Kỳ không có trong danh sách chọn được.']))
    expect(result.current.error).toBeNull()
  })

  it('reports a failure to load the periods instead of showing an empty club', async () => {
    server.use(http.get('*/api/v1/me/report-periods', () => HttpResponse.json({ title: 'Lỗi máy chủ', status: 500 }, { status: 500 })))
    signInAs('u-ha')
    const { wrapper } = createTestWrapper('/me/activity')
    const { result } = renderHook(() => useMyActivityViewModel(), { wrapper })
    await waitFor(() => expect(result.current.periodsError).not.toBeNull())
    expect(result.current.waitingForPeriod).toBe(false)
    expect(result.current.report).toBeNull()
  })
})
