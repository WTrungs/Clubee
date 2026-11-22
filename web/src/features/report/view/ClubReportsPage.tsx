import { CalendarCheck2, CalendarDays, ClipboardList, Lock, UsersRound, Wallet } from 'lucide-react'
import { Link } from 'react-router'
import { memberStatusDisplay } from '@/features/account/viewModel/memberStatus'
import { eventStatusDisplay } from '@/features/event/viewModel/eventDisplay'
import { formatDate } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import { Badge } from '@/shared/ui/Badge'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { NativeSelect } from '@/shared/ui/Input'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { Tabs, TabsBar, TabsContent } from '@/shared/ui/Tabs'
import type { ClubReport, DepartmentReport } from '../model/clubReportTypes'
import { rateLabel } from '../viewModel/reportDisplay'
import { departmentTotals, useClubReportsViewModel, type ClubReportsViewModel } from '../viewModel/useClubReportsViewModel'
import { AttendanceStats, ReportSection, Stat } from './ReportBlocks'
import { ReportPeriodPicker } from './ReportPeriodPicker'

const icon = 'size-5 text-muted-foreground'
const dayLabel = (day: string) => formatDate(`${day}T12:00:00+07:00`)

function RangeNote({ range }: { range: ClubReport['range'] }) {
  return (
    <p className="text-sm text-muted-foreground">
      {range.label}: {dayLabel(range.from)} – {dayLabel(range.to)}. Tỷ lệ chuyên cần = (Có mặt + Đi muộn) / (số lượt được ghi − Vắng có phép).
    </p>
  )
}

function ClubTab({ report, clubId }: { report: ClubReport; clubId: string }) {
  const { members, attendance, events, finance } = report
  return (
    <div className="space-y-8">
      <RangeNote range={report.range} />
      <ReportSection title="Thành viên" icon={<UsersRound aria-hidden className={icon} />} description="Sĩ số là hiện tại; số vào, số rời tính trong kỳ.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Chính thức" value={members.active} />
          <Stat label="Thử việc" value={members.probation} />
          <Stat label="Tạm nghỉ" value={members.onLeave} />
          <Stat label="Vào trong kỳ" value={members.joined} tone={members.joined > 0 ? 'success' : undefined} />
          <Stat label="Rời trong kỳ" value={members.left} tone={members.left > 0 ? 'warning' : undefined} />
        </div>
      </ReportSection>

      <ReportSection title="Chuyên cần" icon={<CalendarCheck2 aria-hidden className={icon} />} description="Các buổi sinh hoạt đã bắt đầu trong kỳ, không tính buổi đã hủy.">
        <AttendanceStats tally={attendance.overall} />
        {attendance.sessions.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Không có buổi sinh hoạt nào trong kỳ này.</p>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-sm md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Buổi</th>
                    <th className="px-4 py-2.5 font-semibold">Ngày</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Có mặt</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Đi muộn</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Vắng có phép</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Vắng không phép</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Tỷ lệ</th>
                  </tr>
                </thead>
                <tbody className="divide-y tabular-nums">
                  {attendance.sessions.map((row) => (
                    <tr key={row.sessionId}>
                      <td className="max-w-0 px-4 py-3 lg:w-2/5">
                        <Link to={`/clubs/${clubId}/sessions/${row.sessionId}`} className="font-semibold [overflow-wrap:anywhere] hover:text-primary">
                          {row.title}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {row.departmentName ? `Ban ${row.departmentName}` : 'Toàn CLB'}
                          {!row.closed && ' · Chưa chốt'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{dayLabel(row.date)}</td>
                      <td className="px-4 py-3 text-right">{row.tally.present}</td>
                      <td className="px-4 py-3 text-right">{row.tally.late}</td>
                      <td className="px-4 py-3 text-right">{row.tally.excused}</td>
                      <td className="px-4 py-3 text-right">{row.tally.absent}</td>
                      <td className="px-4 py-3 text-right font-semibold">{rateLabel(row.tally.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-3 md:hidden">
              {attendance.sessions.map((row) => (
                <li key={row.sessionId} className="space-y-1 rounded-2xl border bg-card p-4 shadow-sm">
                  <Link to={`/clubs/${clubId}/sessions/${row.sessionId}`} className="block font-bold [overflow-wrap:anywhere] hover:text-primary">
                    {row.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {dayLabel(row.date)} · {row.departmentName ? `Ban ${row.departmentName}` : 'Toàn CLB'}
                    {!row.closed && ' · Chưa chốt'}
                  </p>
                  <p className="text-sm">
                    Tỷ lệ <span className="font-bold">{rateLabel(row.tally.rate)}</span> · Có mặt {row.tally.present} · Đi muộn {row.tally.late} · Vắng có phép{' '}
                    {row.tally.excused} · Vắng không phép {row.tally.absent}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </ReportSection>

      <ReportSection title="Sự kiện" icon={<CalendarDays aria-hidden className={icon} />} description="Sự kiện bắt đầu trong kỳ, không tính bản dự thảo.">
        {events.total === 0 ? (
          <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Không có sự kiện nào trong kỳ này.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-4 shadow-sm">
            <span className="mr-2 text-sm font-semibold">{events.total} sự kiện</span>
            {events.byStatus.map((row) => (
              <Badge key={row.status} tone={eventStatusDisplay[row.status].tone}>
                {eventStatusDisplay[row.status].label}: {row.count}
              </Badge>
            ))}
          </div>
        )}
      </ReportSection>

      <ReportSection
        title="Thu chi"
        icon={<Wallet aria-hidden className={icon} />}
        description={
          <>
            Thu chi đã ghi sổ trong kỳ, không tính chuyển quỹ; số dư là hiện tại.{' '}
            <Link to={`/clubs/${clubId}/finance?view=report`} className="font-semibold text-primary hover:underline">
              Xem báo cáo thu chi
            </Link>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Tổng thu" value={formatMoney(finance.income)} tone="success" />
          <Stat label="Tổng chi" value={formatMoney(finance.expense)} />
          <Stat label="Chênh lệch" value={formatMoney(finance.net)} tone={finance.net < 0 ? 'danger' : undefined} />
          <Stat label="Quỹ chung hiện tại" value={formatMoney(finance.generalBalance)} />
          <Stat label="Các quỹ sự kiện" value={formatMoney(finance.eventFundsBalance)} />
        </div>
      </ReportSection>
    </div>
  )
}

function DepartmentTab({ report }: { report: DepartmentReport }) {
  const totals = departmentTotals(report.rows)
  return (
    <div className="space-y-8">
      <RangeNote range={report.range} />
      <ReportSection
        title={`Ban ${report.department.name}`}
        icon={<ClipboardList aria-hidden className={icon} />}
        description="Việc mình làm chính: xong trong kỳ (đúng hạn, trễ hạn); đang làm và quá hạn tính tới hiện tại."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Thành viên" value={report.rows.length} />
          <Stat label="Xong đúng hạn" value={totals.tasks.doneOnTime} tone="success" />
          <Stat label="Xong trễ hạn" value={totals.tasks.doneLate} tone={totals.tasks.doneLate > 0 ? 'warning' : undefined} />
          <Stat label="Đang quá hạn" value={totals.tasks.overdue} tone={totals.tasks.overdue > 0 ? 'danger' : undefined} />
          <Stat label="Chuyên cần cả ban" value={rateLabel(totals.attendance.rate)} />
        </div>
        {report.rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Ban chưa có thành viên.</p>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-sm md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Thành viên</th>
                    <th className="px-4 py-2.5 font-semibold">Trạng thái</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Đang làm</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Xong đúng hạn</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Xong trễ</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Quá hạn</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Chuyên cần</th>
                  </tr>
                </thead>
                <tbody className="divide-y tabular-nums">
                  {report.rows.map((row) => (
                    <tr key={row.person.id}>
                      <td className="max-w-0 px-4 py-3 lg:w-1/4">
                        <span className="block font-semibold [overflow-wrap:anywhere]">{row.person.fullName}</span>
                        {row.positionTitle && <span className="block text-xs text-muted-foreground">{row.positionTitle}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={memberStatusDisplay[row.status].tone}>{memberStatusDisplay[row.status].label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">{row.tasks.open}</td>
                      <td className="px-4 py-3 text-right">{row.tasks.doneOnTime}</td>
                      <td className="px-4 py-3 text-right">{row.tasks.doneLate}</td>
                      <td className={row.tasks.overdue > 0 ? 'px-4 py-3 text-right font-semibold text-status-danger' : 'px-4 py-3 text-right'}>{row.tasks.overdue}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold">{rateLabel(row.attendance.rate)}</span>
                        <span className="block text-xs text-muted-foreground">{row.attendance.total} lượt</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-3 md:hidden">
              {report.rows.map((row) => (
                <li key={row.person.id} className="space-y-1 rounded-2xl border bg-card p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold [overflow-wrap:anywhere]">{row.person.fullName}</h3>
                    <Badge tone={memberStatusDisplay[row.status].tone}>{memberStatusDisplay[row.status].label}</Badge>
                  </div>
                  {row.positionTitle && <p className="text-xs text-muted-foreground">{row.positionTitle}</p>}
                  <p className="text-sm">
                    Đang làm {row.tasks.open} · Xong {row.tasks.doneOnTime + row.tasks.doneLate} (trễ {row.tasks.doneLate}) · Quá hạn {row.tasks.overdue}
                  </p>
                  <p className="text-sm">
                    Chuyên cần <span className="font-semibold">{rateLabel(row.attendance.rate)}</span> · {row.attendance.total} lượt
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </ReportSection>
    </div>
  )
}

function Body({ vm }: { vm: ClubReportsViewModel }) {
  if (vm.invalidReasons) return <FormAlert message={vm.invalidReasons.join(' ')} />
  if (vm.periodsError) return <ErrorState error={vm.periodsError} onRetry={vm.retryPeriods} />
  if (vm.noDepartments) return <EmptyState icon={ClipboardList} title="Chưa có ban nào" description="Báo cáo ban hiện khi CLB có ban đang hoạt động." />
  if (vm.waitingForPeriod) {
    return <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground shadow-sm">Chọn kỳ để xem; với khoảng ngày, nhập ngày rồi bấm Xem.</p>
  }
  if (vm.loading || vm.periodsLoading || vm.departmentsLoading) {
    return (
      <div role="status" aria-label="Đang tải báo cáo">
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }
  if (vm.error) return <ErrorState error={vm.error} onRetry={vm.refetch} />
  return (
    <div aria-busy={vm.refreshing} className={vm.refreshing ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
      <TabsContent value="club">{vm.clubReport && <ClubTab report={vm.clubReport} clubId={vm.clubId} />}</TabsContent>
      <TabsContent value="department">{vm.departmentReport && <DepartmentTab report={vm.departmentReport} />}</TabsContent>
    </div>
  )
}

/** FR-RPT-03 (phần ban), FR-RPT-04: báo cáo CLB cho ban chủ nhiệm, báo cáo ban cho ban chủ nhiệm và trưởng, phó ban. */
export function ClubReportsPage() {
  const vm = useClubReportsViewModel()
  if (!vm.tab) {
    return (
      <div>
        <PageHeader title="Báo cáo" />
        <EmptyState icon={Lock} title="Bạn chưa xem được báo cáo nào" description="Báo cáo CLB dành cho ban chủ nhiệm; báo cáo ban dành cho trưởng, phó ban." />
      </div>
    )
  }
  return (
    <div>
      <PageHeader title="Báo cáo" description="Sĩ số, chuyên cần, sự kiện, thu chi của CLB và tình hình từng ban theo kỳ." />
      <Tabs value={vm.tab} onValueChange={vm.setTab}>
        <TabsBar items={vm.tabs} active={vm.tab} aria-label="Loại báo cáo" />
        <div className="space-y-5 pt-5">
          <ReportPeriodPicker params={vm.periodParams} loading={vm.periodsLoading}>
            {vm.tab === 'department' && vm.departments.length > 1 && (
              <FormField label="Ban" className="sm:w-56">
                <NativeSelect value={vm.department?.id ?? ''} onChange={(event) => vm.setDepartment(event.target.value)}>
                  {vm.departments.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            )}
          </ReportPeriodPicker>
          <Body vm={vm} />
        </div>
      </Tabs>
    </div>
  )
}

