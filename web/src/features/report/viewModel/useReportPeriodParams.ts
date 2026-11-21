import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { formatDate, parseVnDate } from '@/shared/format/formatDate'
import type { ReportPeriodKind, ReportPeriodOption, ReportPeriodQuery, ReportPeriods } from '../model/reportPeriodTypes'
import { CUSTOM_MAX_YEARS, REPORT_PERIOD_KINDS } from './reportPeriodDisplay'

const PERIOD_KEYS = ['period', 'key', 'from', 'to'] as const

/** Kỳ báo cáo trên URL (`period`, `key`, `from`, `to`) để gửi lại được; mặc định kỳ đầu (mới nhất) của loại Tháng. */
export function useReportPeriodParams(periods: ReportPeriods | undefined) {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('period') as ReportPeriodKind | null
  const period: ReportPeriodKind = requested && REPORT_PERIOD_KINDS.includes(requested) ? requested : 'MONTH'
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''
  const [customFrom, setCustomFrom] = useState(from ? formatDate(from) : '')
  const [customTo, setCustomTo] = useState(to ? formatDate(to) : '')
  const [customError, setCustomError] = useState<{ field: 'from' | 'to'; message: string } | null>(null)

  const options: ReportPeriodOption[] =
    period === 'MONTH' ? (periods?.months ?? []) : period === 'SEMESTER' ? (periods?.semesters ?? []) : period === 'TERM' ? (periods?.terms ?? []) : []
  const key = period === 'CUSTOM' ? undefined : (searchParams.get('key') ?? options[0]?.key)
  const query: ReportPeriodQuery = period === 'CUSTOM' ? { period, from, to } : { period, key }

  const write = (patch: Partial<Record<(typeof PERIOD_KEYS)[number], string | undefined>>) => {
    const next = new URLSearchParams(searchParams)
    for (const name of PERIOD_KEYS) {
      if (!(name in patch)) continue
      const value = patch[name]
      if (value) next.set(name, value)
      else next.delete(name)
    }
    setSearchParams(next, { replace: true })
  }

  return {
    period,
    setPeriod: (value: ReportPeriodKind) => {
      setCustomError(null)
      write({ period: value === 'MONTH' ? undefined : value, key: undefined, from: undefined, to: undefined })
    },
    options,
    key,
    setKey: (value: string) => write({ key: value }),
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    customError,
    applyCustom: () => {
      const start = parseVnDate(customFrom)
      const end = parseVnDate(customTo)
      if (!start) return setCustomError({ field: 'from', message: 'Nhập ngày dạng dd/mm/yyyy.' })
      if (!end) return setCustomError({ field: 'to', message: 'Nhập ngày dạng dd/mm/yyyy.' })
      if (start > end) return setCustomError({ field: 'to', message: 'Ngày kết thúc không trước ngày bắt đầu.' })
      const limit = `${Number(start.slice(0, 4)) + CUSTOM_MAX_YEARS}${start.slice(4)}`
      if (end > limit) return setCustomError({ field: 'to', message: `Khoảng ngày tối đa ${CUSTOM_MAX_YEARS} năm.` })
      setCustomError(null)
      write({ from: start, to: end })
    },
    query,
    /** Đã đủ điều kiện gọi báo cáo: có kỳ đang chọn, hoặc đã nhập khoảng ngày. */
    ready: period === 'CUSTOM' ? from !== '' && to !== '' : key !== undefined,
  }
}

export type ReportPeriodParams = ReturnType<typeof useReportPeriodParams>
