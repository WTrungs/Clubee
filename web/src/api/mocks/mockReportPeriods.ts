import type { FieldError } from '@/api/apiError'
import type { ReportPeriodOption, ReportPeriods, ReportRange } from '@/features/report/model/reportPeriodTypes'
import { db, type DbClub } from './db'
import { isRealDate, shiftDate, vnToday } from './mockTime'

// Kỳ báo cáo dùng chung cho báo cáo thu chi (FR-FIN-12), báo cáo cá nhân, CLB, ban (FR-RPT-02..04).

/** Khoảng ngày tự chọn dài nhất. */
export const CUSTOM_MAX_YEARS = 5

const pad = (value: number) => String(value).padStart(2, '0')
const dateOf = (year: number, monthDay: string) => `${year}-${monthDay}`

/** Ngày cuối của tháng `yyyy-mm`. */
function monthEnd(month: string): string {
  const [year, value] = month.split('-').map(Number)
  const last = new Date(Date.UTC(year ?? 0, value ?? 1, 0)).getUTCDate()
  return `${month}-${pad(last)}`
}

/** 12 tháng gần nhất, mới nhất trước. */
export function monthPeriods(today = vnToday()): ReportPeriodOption[] {
  const [year, month] = today.split('-').map(Number)
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1 - index, 1))
    const key = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`
    return { kind: 'MONTH' as const, key, label: `Tháng ${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`, from: `${key}-01`, to: monthEnd(key) }
  })
}

type SemesterMarks = Pick<DbClub, 'semester1Start' | 'semester2Start' | 'summerStart' | 'foundedOn'>

/**
 * Học kỳ tính từ mốc `MM-DD` CLB khai: mỗi kỳ chạy tới hôm trước mốc kế tiếp. Năm học đặt theo năm có mốc học kỳ 1; học kỳ 2
 * và kỳ hè nằm trước mốc học kỳ 1 trong năm dương lịch thì thuộc năm học trước. Lùi về tới kỳ chứa ngày thành lập, mới nhất trước.
 */
export function semesterPeriods(club: SemesterMarks, today = vnToday()): ReportPeriodOption[] {
  const marks: Array<{ code: 'S1' | 'S2' | 'SUMMER'; monthDay: string }> = [
    { code: 'S1', monthDay: club.semester1Start },
    { code: 'S2', monthDay: club.semester2Start },
    ...(club.summerStart ? [{ code: 'SUMMER' as const, monthDay: club.summerStart }] : []),
  ]
  const firstYear = Number(club.foundedOn.slice(0, 4)) - 1
  const lastYear = Number(today.slice(0, 4)) + 1
  const starts: Array<{ code: 'S1' | 'S2' | 'SUMMER'; from: string; schoolYear: number }> = []
  for (let year = firstYear; year <= lastYear; year += 1) {
    for (const mark of marks) {
      const schoolYear = mark.code === 'S1' || mark.monthDay >= club.semester1Start ? year : year - 1
      starts.push({ code: mark.code, from: dateOf(year, mark.monthDay), schoolYear })
    }
  }
  starts.sort((a, b) => a.from.localeCompare(b.from))
  const names = { S1: 'Học kỳ 1', S2: 'Học kỳ 2', SUMMER: 'Học kỳ hè' }
  const periods: ReportPeriodOption[] = []
  for (let index = 0; index < starts.length - 1; index += 1) {
    const start = starts[index]
    const next = starts[index + 1]
    if (!start || !next) continue
    const to = shiftDate(next.from, -1)
    if (start.from > today || to < club.foundedOn) continue
    periods.push({
      kind: 'SEMESTER',
      key: `${start.schoolYear}-${start.code}`,
      label: `${names[start.code]} ${start.schoolYear}–${start.schoolYear + 1}`,
      from: start.from,
      to,
    })
  }
  return periods.reverse()
}

export function termPeriods(clubId: string): ReportPeriodOption[] {
  return db.terms
    .filter((term) => term.clubId === clubId)
    .toSorted((a, b) => b.startOn.localeCompare(a.startOn))
    .map((term) => ({ kind: 'TERM' as const, key: term.id, label: `Nhiệm kỳ ${term.name}`, from: term.startOn, to: term.endOn }))
}

export function reportPeriods(club: DbClub): ReportPeriods {
  return { months: monthPeriods(), semesters: semesterPeriods(club), terms: termPeriods(club.id) }
}

const shiftYears = (date: string, years: number) => `${Number(date.slice(0, 4)) + years}${date.slice(4)}`

/** Đọc `period`, `key`, `from`, `to` trên URL thành khoảng ngày; sai thì trả lỗi theo từng tham số (400). */
export function resolveReportRange(url: URL, club: DbClub): { ok: true; range: ReportRange } | { ok: false; errors: FieldError[] } {
  const period = url.searchParams.get('period')
  const key = url.searchParams.get('key')
  const errors: FieldError[] = []
  if (period === 'CUSTOM') {
    const from = url.searchParams.get('from') ?? ''
    const to = url.searchParams.get('to') ?? ''
    if (!isRealDate(from)) errors.push({ field: 'from', message: 'Ngày bắt đầu không hợp lệ.' })
    if (!isRealDate(to)) errors.push({ field: 'to', message: 'Ngày kết thúc không hợp lệ.' })
    else if (isRealDate(from) && from > to) errors.push({ field: 'to', message: 'Ngày kết thúc không trước ngày bắt đầu.' })
    else if (isRealDate(from) && to > shiftYears(from, CUSTOM_MAX_YEARS)) errors.push({ field: 'to', message: `Khoảng ngày tối đa ${CUSTOM_MAX_YEARS} năm.` })
    return errors.length > 0 ? { ok: false, errors } : { ok: true, range: { from, to, label: 'Khoảng ngày tự chọn' } }
  }
  if (period === 'MONTH' || period === 'SEMESTER' || period === 'TERM') {
    const periods = reportPeriods(club)
    const options = period === 'MONTH' ? periods.months : period === 'SEMESTER' ? periods.semesters : periods.terms
    const option = options.find((candidate) => candidate.key === key)
    return option ? { ok: true, range: { from: option.from, to: option.to, label: option.label } } : { ok: false, errors: [{ field: 'key', message: 'Kỳ không có trong danh sách chọn được.' }] }
  }
  return { ok: false, errors: [{ field: 'period', message: 'Chọn loại kỳ: tháng, học kỳ, nhiệm kỳ hoặc khoảng ngày.' }] }
}
