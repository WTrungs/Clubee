import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import type { ClubAction } from '@/features/club/model/clubTypes'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { clubReportRepository } from '../model/clubReportRepository'
import type { DepartmentMemberRow } from '../model/clubReportTypes'
import type { AttendanceTally, TaskTally } from '../model/myReportTypes'
import { periodErrorReasons } from './reportDisplay'
import { useReportPeriodParams } from './useReportPeriodParams'
import { useFileDownload } from '@/shared/hooks/useFileDownload'
import type { ExportFormat } from '@/shared/lib/exportFormat'

export type ClubReportTab = 'club' | 'department' | 'audit'

export const clubReportQueryKeys = {
  all: ['clubReport'] as const,
  periods: (clubId: string) => ['clubReport', 'periods', clubId] as const,
  departments: (clubId: string) => ['clubReport', 'departments', clubId] as const,
  club: (clubId: string, query: object) => ['clubReport', 'club', clubId, query] as const,
  department: (clubId: string, departmentId: string, query: object) => ['clubReport', 'department', clubId, departmentId, query] as const,
}

/** Các tab theo quyền máy chủ trả về; không có quyền nào thì rỗng. */
export function clubReportTabs(actions: readonly ClubAction[]): Array<{ value: ClubReportTab; label: string }> {
  return [
    ...(actions.includes('VIEW_CLUB_REPORT') ? [{ value: 'club' as const, label: 'Báo cáo CLB' }] : []),
    ...(actions.includes('VIEW_DEPARTMENT_REPORTS') ? [{ value: 'department' as const, label: 'Báo cáo ban' }] : []),
    ...(actions.includes('VIEW_AUDIT_LOG') ? [{ value: 'audit' as const, label: 'Nhật ký' }] : []),
  ]
}

/** Cộng đếm điểm danh của nhiều người rồi tính lại tỷ lệ theo cùng công thức (không lấy trung bình các tỷ lệ). */
export function sumAttendance(tallies: readonly AttendanceTally[]): AttendanceTally {
  const total = (key: 'present' | 'late' | 'excused' | 'absent' | 'total') => tallies.reduce((sum, tally) => sum + tally[key], 0)
  const present = total('present')
  const late = total('late')
  const excused = total('excused')
  const all = total('total')
  const base = all - excused
  return { present, late, excused, absent: total('absent'), total: all, rate: base > 0 ? (present + late) / base : null }
}

export function sumTasks(tallies: readonly TaskTally[]): TaskTally {
  const total = (key: keyof TaskTally) => tallies.reduce((sum, tally) => sum + tally[key], 0)
  return { doneOnTime: total('doneOnTime'), doneLate: total('doneLate'), open: total('open'), overdue: total('overdue') }
}

/** Tổng của cả ban cho dòng đầu báo cáo ban. */
export const departmentTotals = (rows: readonly DepartmentMemberRow[]) => ({
  tasks: sumTasks(rows.map((row) => row.tasks)),
  attendance: sumAttendance(rows.map((row) => row.attendance)),
})

/** FR-RPT-03 (phần ban), FR-RPT-04, FR-RPT-06: trang Báo cáo của CLB; tab, kỳ, ban nằm trên URL. */
export function useClubReportsViewModel() {
  const { clubId, club } = useCurrentClub()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabs = clubReportTabs(club.allowedActions)
  const requested = searchParams.get('tab')
  const tab = tabs.find((item) => item.value === requested)?.value ?? tabs[0]?.value ?? null
  // Tab Nhật ký có bộ lọc riêng, không dùng kỳ báo cáo.
  const usesPeriod = tab === 'club' || tab === 'department'

  const periods = useQuery({ queryKey: clubReportQueryKeys.periods(clubId), queryFn: () => clubReportRepository.periods(clubId), enabled: usesPeriod })
  const periodParams = useReportPeriodParams(periods.data)
  const departments = useQuery({
    queryKey: clubReportQueryKeys.departments(clubId),
    queryFn: () => clubReportRepository.departments(clubId),
    enabled: tab === 'department',
  })
  const options = departments.data ?? []
  const department = options.find((option) => option.id === searchParams.get('department')) ?? options[0] ?? null
  const query = periodParams.query

  const clubReport = useQuery({
    queryKey: clubReportQueryKeys.club(clubId, query),
    queryFn: () => clubReportRepository.clubReport(clubId, query),
    enabled: tab === 'club' && periodParams.ready,
    placeholderData: keepPreviousData,
  })
  const departmentReport = useQuery({
    queryKey: clubReportQueryKeys.department(clubId, department?.id ?? '', query),
    queryFn: () => clubReportRepository.departmentReport(clubId, department?.id ?? '', query),
    enabled: tab === 'department' && department !== null && periodParams.ready,
    placeholderData: keepPreviousData,
  })
  const active = tab === 'department' ? departmentReport : clubReport
  const exporter = useFileDownload('bao-cao')
  const reasons = periodErrorReasons(active.error)
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setSearchParams(next, { replace: true })
  }

  return {
    clubId,
    tabs,
    tab,
    setTab: (value: string) => update({ tab: value }),
    periodParams,
    usesPeriod,
    periodsLoading: periods.isPending && usesPeriod,
    periodsError: periods.error,
    retryPeriods: () => void periods.refetch(),
    waitingForPeriod: usesPeriod && !periods.isPending && !periods.error && !periodParams.ready,
    departments: options,
    department,
    setDepartment: (value: string) => update({ department: value }),
    departmentsLoading: tab === 'department' && departments.isPending,
    noDepartments: tab === 'department' && !departments.isPending && !departments.error && options.length === 0,
    clubReport: clubReport.data ?? null,
    departmentReport: departmentReport.data ?? null,
    /** Đang tải kỳ hoặc ban mới mà vẫn hiện số cũ: làm mờ để không đọc nhầm. */
    refreshing: active.isPlaceholderData,
    loading: usesPeriod && periodParams.ready && active.isPending && (tab === 'club' || department !== null),
    error: reasons ? null : (active.error ?? departments.error),
    invalidReasons: reasons,
    refetch: () => void (departments.error ? departments.refetch() : active.refetch()),
    /** FR-RPT-07: xuất báo cáo đang xem theo kỳ đang chọn. */
    canExport: periodParams.ready && (tab === 'club' ? clubReport.data !== undefined : tab === 'department' && departmentReport.data !== undefined),
    exportReport: (format: ExportFormat) =>
      exporter.download(() =>
        tab === 'department' && department
          ? clubReportRepository.exportDepartmentReport(clubId, department.id, query, format)
          : clubReportRepository.exportClubReport(clubId, query, format),
      ),
    exporting: exporter.pending,
  }
}

export type ClubReportsViewModel = ReturnType<typeof useClubReportsViewModel>
