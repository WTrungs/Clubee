import { AlertTriangle, CalendarCheck2, ClipboardList, HandCoins, Ticket, UsersRound } from 'lucide-react'
import { ReportSection, Stat } from '@/features/report/view/ReportBlocks'
import { rateLabel } from '@/features/report/viewModel/reportDisplay'
import { formatDate } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import { Badge } from '@/shared/ui/Badge'
import { ProgressBar } from '@/shared/ui/ProgressBar'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import type { EventAttendanceDay, EventProgress, EventReport, EventStaffStats, TaskProgressCounts } from '../model/eventTypes'
import { capacityLabel, donePercent, presentDaysLabel, progressSummary, staffRoleLabel, useEventReportViewModel } from '../viewModel/useEventReportViewModel'

const icon = 'size-5 text-muted-foreground'
const dayLabel = (day: string) => formatDate(`${day}T12:00:00+07:00`)

function CountRow({ counts }: { counts: TaskProgressCounts }) {
  const items = [
    { label: 'Đã giao', value: counts.assigned },
    { label: 'Đang làm', value: counts.inProgress },
    { label: 'Chờ nghiệm thu', value: counts.pendingReview },
    { label: 'Hoàn thành', value: counts.done },
  ]
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl bg-muted/50 px-3 py-2">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="font-bold tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Registrations({ stats }: { stats: EventReport['registrations'] }) {
  return (
    <ReportSection title="Đăng ký" icon={<Ticket aria-hidden className={icon} />}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Số chỗ" value={capacityLabel(stats.capacity)} />
        <Stat label="Nhận chỗ" value={stats.confirmed} tone="success" />
        <Stat label="Danh sách chờ" value={stats.waitlisted} />
        <Stat label="Chờ xác nhận lại" value={stats.reconfirmPending} tone={stats.reconfirmPending > 0 ? 'warning' : undefined} />
        <Stat label="Đã hủy" value={stats.cancelled} />
      </div>
    </ReportSection>
  )
}

function Attendance({ days }: { days: EventAttendanceDay[] }) {
  return (
    <ReportSection
      title="Điểm danh"
      icon={<CalendarCheck2 aria-hidden className={icon} />}
      description="Tỷ lệ = (Có mặt + Đi muộn) / (số người được ghi − Vắng có phép). Trước khi chốt, người chưa được ghi chưa tính vào tỷ lệ."
    >
      {days.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Sự kiện chưa được duyệt hoặc đã hủy nên chưa có điểm danh.</p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-sm md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Ngày</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Đối tượng</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Có mặt</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Đi muộn</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Vắng có phép</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Vắng không phép</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Tỷ lệ</th>
                </tr>
              </thead>
              <tbody className="divide-y tabular-nums">
                {days.map((row) => (
                  <tr key={row.day}>
                    <td className="px-4 py-3 font-semibold">
                      {dayLabel(row.day)} {!row.closed && <Badge tone="neutral">Chưa chốt</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right">{row.expected}</td>
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
            {days.map((row) => (
              <li key={row.day} className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold">{dayLabel(row.day)}</h3>
                  {!row.closed && <Badge tone="neutral">Chưa chốt</Badge>}
                </div>
                <p className="text-sm">
                  Tỷ lệ <span className="font-bold">{rateLabel(row.tally.rate)}</span> · {row.expected} đối tượng
                </p>
                <p className="text-sm text-muted-foreground">
                  Có mặt {row.tally.present} · Đi muộn {row.tally.late} · Vắng có phép {row.tally.excused} · Vắng không phép {row.tally.absent}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </ReportSection>
  )
}

function Tasks({ progress }: { progress: EventProgress }) {
  const { total, subcommittees } = progress
  const overall = donePercent(total)
  return (
    <ReportSection title="Công việc" icon={<ClipboardList aria-hidden className={icon} />} description="Chỉ số việc theo trạng thái, không hiện nội dung việc.">
      {subcommittees.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Chưa có tiểu ban. Công việc tính theo việc của từng tiểu ban.</p>
      ) : (
        <>
          <section aria-label="Tiến độ chung" className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-bold">Toàn sự kiện</h3>
              <p className="text-sm text-muted-foreground">{progressSummary(total)}</p>
            </div>
            {overall !== null && <ProgressBar value={total.done} max={total.total} label={`Hoàn thành ${overall}% việc của sự kiện`} tone="success" />}
            <CountRow counts={total} />
          </section>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {subcommittees.map((subcommittee) => {
              const percent = donePercent(subcommittee.counts)
              return (
                <li key={subcommittee.id} className="min-w-0 space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold [overflow-wrap:anywhere]">Tiểu ban {subcommittee.name}</h3>
                    {subcommittee.counts.overdue > 0 && (
                      <Badge tone="danger">
                        <AlertTriangle aria-hidden className="mr-1 inline size-3" />
                        {subcommittee.counts.overdue} quá hạn
                      </Badge>
                    )}
                  </div>
                  {percent !== null && (
                    <ProgressBar value={subcommittee.counts.done} max={subcommittee.counts.total} label={`Tiểu ban ${subcommittee.name} hoàn thành ${percent}%`} tone="success" />
                  )}
                  <p className="text-sm text-muted-foreground">{progressSummary(subcommittee.counts)}</p>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </ReportSection>
  )
}

function Staff({ rows }: { rows: EventStaffStats[] }) {
  return (
    <ReportSection
      title="Theo người"
      icon={<UsersRound aria-hidden className={icon} />}
      description="Việc mình làm chính trong các tiểu ban; số ngày có mặt lấy từ điểm danh các ngày sự kiện. Chỉ Trưởng BTC và ban chủ nhiệm xem."
    >
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Sự kiện chưa có Trưởng BTC hay nhân sự nào.</p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-sm md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Họ tên</th>
                  <th className="px-4 py-2.5 font-semibold">Vai trò</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Đang làm</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Xong</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Quá hạn</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Có mặt</th>
                </tr>
              </thead>
              <tbody className="divide-y tabular-nums">
                {rows.map((row) => (
                  <tr key={row.person.id}>
                    <td className="max-w-0 px-4 py-3 font-semibold [overflow-wrap:anywhere] lg:w-1/4">{row.person.fullName}</td>
                    <td className="max-w-0 px-4 py-3 text-muted-foreground [overflow-wrap:anywhere]">{staffRoleLabel(row)}</td>
                    <td className="px-4 py-3 text-right">{row.open}</td>
                    <td className="px-4 py-3 text-right">{row.done}</td>
                    <td className={row.overdue > 0 ? 'px-4 py-3 text-right font-semibold text-status-danger' : 'px-4 py-3 text-right'}>{row.overdue}</td>
                    <td className="px-4 py-3 text-right">{presentDaysLabel(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden">
            {rows.map((row) => (
              <li key={row.person.id} className="space-y-1 rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold [overflow-wrap:anywhere]">{row.person.fullName}</h3>
                  {row.overdue > 0 && <Badge tone="danger">{row.overdue} quá hạn</Badge>}
                </div>
                <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{staffRoleLabel(row)}</p>
                <p className="text-sm">
                  Đang làm {row.open} · Xong {row.done} · Có mặt {presentDaysLabel(row)}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </ReportSection>
  )
}

function Fund({ fund }: { fund: NonNullable<EventReport['fund']> }) {
  return (
    <ReportSection title="Quỹ sự kiện" icon={<HandCoins aria-hidden className={icon} />} description="Tính theo giao dịch đã ghi sổ.">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Số dư" value={formatMoney(fund.balance)} />
        <Stat label="Đã thu" value={formatMoney(fund.income)} tone="success" />
        <Stat label="Đã chi" value={formatMoney(fund.expense)} />
        {fund.pendingCount !== null && (
          <Stat label="Khoản chờ ghi sổ" value={fund.pendingCount} hint={fund.pendingCount > 0 && fund.pendingAmount !== null ? formatMoney(fund.pendingAmount) : undefined} />
        )}
        <Stat label="Tạm ứng còn mở" value={fund.openAdvanceCount} tone={fund.openAdvanceCount > 0 ? 'warning' : undefined} />
      </div>
    </ReportSection>
  )
}

/** FR-RPT-05: đăng ký, điểm danh từng ngày, công việc theo tiểu ban; theo người và quỹ chỉ hiện khi máy chủ trả về. */
export function EventReportTab({ clubId, eventId }: { clubId: string; eventId: string }) {
  const vm = useEventReportViewModel(clubId, eventId)
  if (vm.loading) {
    return (
      <div className="space-y-4" role="status" aria-label="Đang tải báo cáo">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    )
  }
  if (vm.error || !vm.report) return <ErrorState error={vm.error} onRetry={vm.refetch} />
  const { report } = vm
  return (
    <div className="space-y-8">
      <Registrations stats={report.registrations} />
      <Attendance days={report.attendance} />
      <Tasks progress={report.tasks} />
      {report.staff && <Staff rows={report.staff} />}
      {report.fund && <Fund fund={report.fund} />}
    </div>
  )
}
