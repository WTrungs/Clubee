import { CalendarCheck2, ClipboardList, HandCoins, History, UserRoundX } from 'lucide-react'
import { Link } from 'react-router'
import { memberStatusDisplay } from '@/features/account/viewModel/memberStatus'
import { attendanceStatusDisplay } from '@/features/attendance/viewModel/attendanceDisplay'
import { duesItemStatusDisplay } from '@/features/finance/viewModel/duesDisplay'
import { formatDate } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import { Badge } from '@/shared/ui/Badge'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { NativeSelect } from '@/shared/ui/Input'
import { Pagination } from '@/shared/ui/ListControls'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { Tabs, TabsBar, TabsContent } from '@/shared/ui/Tabs'
import type { AttendanceTally, MyReport } from '../model/myReportTypes'
import { rateLabel } from '../viewModel/reportDisplay'
import { useMyActivityViewModel, type MyActivityViewModel } from '../viewModel/useMyActivityViewModel'
import { ReportSection as Section, Stat } from './ReportBlocks'
import { ReportPeriodPicker } from './ReportPeriodPicker'

function AttendanceStats({ tally }: { tally: AttendanceTally }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Stat label="Tỷ lệ chuyên cần" value={rateLabel(tally.rate)} />
      <Stat label="Có mặt" value={tally.present} />
      <Stat label="Đi muộn" value={tally.late} />
      <Stat label="Vắng có phép" value={tally.excused} />
      <Stat label="Vắng không phép" value={tally.absent} tone={tally.absent > 0 ? 'danger' : undefined} />
    </div>
  )
}

function ReportTab({ report }: { report: MyReport }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {report.range.label}: {formatDate(`${report.range.from}T12:00:00+07:00`)} – {formatDate(`${report.range.to}T12:00:00+07:00`)}. Tỷ lệ chuyên cần = (Có mặt + Đi muộn)
        / (số buổi được ghi − Vắng có phép).
      </p>
      <Section title="Chuyên cần" icon={<CalendarCheck2 aria-hidden className="size-5 text-muted-foreground" />}>
        <AttendanceStats tally={report.attendance} />
      </Section>
      <Section title="Công việc" icon={<ClipboardList aria-hidden className="size-5 text-muted-foreground" />}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Xong đúng hạn" value={report.tasks.doneOnTime} tone="success" />
          <Stat label="Xong trễ hạn" value={report.tasks.doneLate} tone={report.tasks.doneLate > 0 ? 'warning' : undefined} />
          <Stat label="Còn mở" value={report.tasks.open} />
          <Stat label="Đang quá hạn" value={report.tasks.overdue} tone={report.tasks.overdue > 0 ? 'danger' : undefined} />
        </div>
      </Section>
      <Section title="Đóng quỹ" icon={<HandCoins aria-hidden className="size-5 text-muted-foreground" />}>
        {report.dues.length === 0 ? (
          <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground shadow-sm">Không có đợt đóng quỹ nào hạn nộp trong kỳ này.</p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
            {report.dues.map((row) => (
              <li key={row.campaignId} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <span className="block font-semibold break-words">{row.name}</span>
                  <span className="block text-xs text-muted-foreground">Hạn nộp {formatDate(`${row.dueOn}T12:00:00+07:00`)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-3 text-sm tabular-nums">
                  <span>
                    Đã nộp {formatMoney(row.paid)} / {formatMoney(row.amountDue)}
                  </span>
                  <Badge tone={duesItemStatusDisplay[row.status].tone}>{duesItemStatusDisplay[row.status].label}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function HistoryTab({ vm }: { vm: MyActivityViewModel }) {
  const page = vm.attendance
  if (!page) return null
  const left = vm.club?.status === 'LEFT'
  return (
    <div className="space-y-4">
      <AttendanceStats tally={page.tally} />
      {page.content.length === 0 ? (
        <EmptyState icon={History} title="Chưa có bản ghi điểm danh trong kỳ này" description="Đổi kỳ để xem các buổi trước." />
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
          {page.content.map((row) => {
            const display = attendanceStatusDisplay[row.status]
            const title = <span className="block font-semibold break-words">{row.activity.title}</span>
            return (
              <li key={row.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  {/* Người đã rời không còn vào được trang của CLB nên chỉ hiện tên. */}
                  {left || !vm.club ? (
                    title
                  ) : (
                    <Link to={`/clubs/${vm.club.clubId}/${row.activity.type === 'SESSION' ? 'sessions' : 'events'}/${row.activity.id}`} className="hover:text-primary">
                      {title}
                    </Link>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {row.activity.type === 'SESSION' ? 'Sinh hoạt' : 'Sự kiện'} · {formatDate(`${row.date}T12:00:00+07:00`)}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {row.edited && <Badge tone="info">Đã sửa</Badge>}
                  <Badge tone={display.tone} dot>
                    {display.label}
                  </Badge>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <Pagination page={vm.page} totalPages={page.totalPages} totalElements={page.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />
    </div>
  )
}

/** FR-ATT-10, FR-RPT-02: báo cáo cá nhân và lịch sử tham gia, kể cả ở CLB đã rời. */
export function MyActivityPage() {
  const vm = useMyActivityViewModel()

  return (
    <div>
      <PageHeader title="Hoạt động của tôi" description="Chuyên cần, công việc, đóng quỹ và lịch sử tham gia của bạn ở từng CLB." />
      {vm.historyLoading ? (
        <div role="status" aria-label="Đang tải danh sách CLB">
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : vm.historyError ? (
        <ErrorState error={vm.historyError} onRetry={vm.retryHistory} />
      ) : vm.noClubs ? (
        <EmptyState icon={UserRoundX} title="Bạn chưa tham gia CLB nào" description="Khi được nhận vào CLB, báo cáo của bạn sẽ hiện ở đây." />
      ) : (
        <div className="space-y-5">
          <ReportPeriodPicker params={vm.periodParams} loading={vm.periodsLoading}>
            <FormField label="CLB" className="sm:w-64">
              <NativeSelect value={vm.club?.clubId ?? ''} onChange={(event) => vm.setClubId(event.target.value)}>
                {vm.clubs.map((entry) => (
                  <option key={entry.clubId} value={entry.clubId}>
                    {entry.clubName}
                    {entry.status === 'LEFT' ? ' (Đã rời)' : ''}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </ReportPeriodPicker>
          {vm.club && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge tone={memberStatusDisplay[vm.club.status].tone}>{memberStatusDisplay[vm.club.status].label}</Badge>
              {vm.club.departmentName && <span>Ban {vm.club.departmentName}</span>}
              {vm.club.joinedOn && <span>· Gia nhập {formatDate(`${vm.club.joinedOn}T12:00:00+07:00`)}</span>}
              {vm.club.leftOn && <span>· Rời {formatDate(`${vm.club.leftOn}T12:00:00+07:00`)}</span>}
            </p>
          )}
          {vm.periodsError && <ErrorState error={vm.periodsError} onRetry={vm.retryPeriods} />}
          <Tabs value={vm.tab} onValueChange={vm.setTab}>
            <TabsBar
              items={[
                { value: 'report', label: 'Báo cáo' },
                { value: 'history', label: 'Lịch sử tham gia' },
              ]}
              active={vm.tab}
              aria-label="Nội dung hoạt động"
            />
            <div className="pt-5">
              {vm.invalidReasons ? (
                <FormAlert message={vm.invalidReasons.join(' ')} />
              ) : vm.waitingForPeriod ? (
                <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground shadow-sm">Chọn kỳ để xem; với khoảng ngày, nhập ngày rồi bấm Xem.</p>
              ) : vm.loading || vm.periodsLoading ? (
                <div role="status" aria-label="Đang tải báo cáo">
                  <Skeleton className="h-64 w-full rounded-2xl" />
                </div>
              ) : vm.error ? (
                <ErrorState error={vm.error} onRetry={vm.refetch} />
              ) : (
                <>
                  <TabsContent value="report">{vm.report && <ReportTab report={vm.report} />}</TabsContent>
                  <TabsContent value="history">
                    <HistoryTab vm={vm} />
                  </TabsContent>
                </>
              )}
            </div>
          </Tabs>
        </div>
      )}
    </div>
  )
}
