import { memberStatusDisplay } from '@/features/account/viewModel/memberStatus'
import type { EventReport } from '@/features/event/model/eventTypes'
import { eventStatusDisplay } from '@/features/event/viewModel/eventDisplay'
import type { FinanceReport, UnpaidDuesRow } from '@/features/finance/model/financeReportTypes'
import { financeCategoryLabel } from '@/features/finance/viewModel/financeDisplay'
import type { AuditLogEntry } from '@/features/report/model/auditLogTypes'
import type { ClubReport, DepartmentReport } from '@/features/report/model/clubReportTypes'
import type { AttendanceTally, MyReport, TaskTally } from '@/features/report/model/myReportTypes'
import { auditActionLabel, auditChanges, auditObjectTypeLabel } from '@/features/report/viewModel/auditDisplay'
import { formatDate, formatDateTime } from '@/shared/format/formatDate'
import { audit } from './mockAudit'
import { dropEmptyColumns, exportFile, type ExportDocument, type ExportFormat, type ExportSheet } from './mockExport'
import { downloadResponse, problem } from './mockHttp'

// FR-RPT-07: mỗi báo cáo xuất được Excel, PDF từ đúng dữ liệu người xuất đang xem (phần không được xem là null nên không có trong tệp).

export const rate = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`)
const money = (value: number | null) => (value === null ? null : value)
const pairs = (rows: Array<[string, string | number | null]>): ExportSheet => ({ name: 'Tổng quan', columns: [{ label: 'Chỉ số' }, { label: 'Giá trị' }], rows })

const attendanceColumns = [{ label: 'Có mặt' }, { label: 'Đi muộn' }, { label: 'Có phép' }, { label: 'Vắng' }, { label: 'Tỉ lệ chuyên cần' }]
const attendanceCells = (tally: AttendanceTally) => [tally.present, tally.late, tally.excused, tally.absent, rate(tally.rate)]
const taskCells = (tally: TaskTally) => [tally.doneOnTime, tally.doneLate, tally.open, tally.overdue]
const taskColumns = [{ label: 'Xong đúng hạn' }, { label: 'Xong trễ' }, { label: 'Đang làm' }, { label: 'Quá hạn' }]

/** Định dạng hợp lệ; sai thì 400 như mọi tham số khác. */
export function formatOf(url: URL): ExportFormat | Response {
  const format = url.searchParams.get('format')
  if (format === 'xlsx' || format === 'pdf') return format
  return problem(400, 'Chọn định dạng xuất Excel hoặc PDF.', 'VALIDATION', [{ field: 'format', message: 'Chọn xlsx hoặc pdf.' }])
}

/** BR-DATA-03: xuất có dữ liệu cá nhân của người khác thì ghi nhật ký. */
export function auditExport(actorId: string, clubId: string, report: string, format: ExportFormat, rows: number): void {
  audit({ actorId, clubId, action: 'EXPORT_REPORT', objectType: 'CLUB', objectId: clubId, objectLabel: report, before: null, after: { report, format: format.toUpperCase(), rows }, reason: null })
}

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export function clubReportDocument(report: ClubReport): ExportDocument {
  return {
    title: `Báo cáo CLB ${report.club.name}`,
    subtitle: `Kỳ ${report.range.label} (${formatDate(report.range.from)} – ${formatDate(report.range.to)})`,
    fileBase: `bao-cao-clb-${slug(report.club.name)}`,
    sheets: [
      pairs([
        ['Thử việc', report.members.probation],
        ['Chính thức', report.members.active],
        ['Tạm nghỉ', report.members.onLeave],
        ['Vào trong kỳ', report.members.joined],
        ['Rời trong kỳ', report.members.left],
        ['Chuyên cần chung', rate(report.attendance.overall.rate)],
        ['Số sự kiện', report.events.total],
        ['Tổng thu', report.finance.income],
        ['Tổng chi', report.finance.expense],
        ['Chênh lệch', report.finance.net],
        ['Số dư Quỹ chung', report.finance.generalBalance],
        ['Số dư quỹ sự kiện', report.finance.eventFundsBalance],
      ]),
      {
        name: 'Chuyên cần theo buổi',
        columns: [{ label: 'Buổi' }, { label: 'Ngày' }, { label: 'Ban' }, { label: 'Đã chốt' }, ...attendanceColumns],
        rows: report.attendance.sessions.map((session) => [session.title, formatDate(session.date), session.departmentName ?? 'Toàn CLB', session.closed ? 'Có' : 'Chưa', ...attendanceCells(session.tally)]),
      },
      { name: 'Sự kiện', columns: [{ label: 'Trạng thái' }, { label: 'Số sự kiện' }], rows: report.events.byStatus.map((row) => [eventStatusDisplay[row.status].label, row.count]) },
    ],
  }
}

export function departmentReportDocument(report: DepartmentReport, clubName: string): ExportDocument {
  return {
    title: `Báo cáo Ban ${report.department.name} · ${clubName}`,
    subtitle: `Kỳ ${report.range.label} (${formatDate(report.range.from)} – ${formatDate(report.range.to)})`,
    fileBase: `bao-cao-ban-${slug(report.department.name)}`,
    sheets: [
      {
        name: 'Thành viên',
        columns: [{ label: 'Họ tên' }, { label: 'Trạng thái' }, { label: 'Chức vụ' }, ...taskColumns, ...attendanceColumns],
        rows: report.rows.map((row) => [row.person.fullName, memberStatusDisplay[row.status].label, row.positionTitle, ...taskCells(row.tasks), ...attendanceCells(row.attendance)]),
      },
    ],
  }
}

export function myReportDocument(report: MyReport, fullName: string): ExportDocument {
  return {
    title: `Báo cáo cá nhân · ${fullName}`,
    subtitle: `${report.club.name} · kỳ ${report.range.label} (${formatDate(report.range.from)} – ${formatDate(report.range.to)})`,
    fileBase: `bao-cao-ca-nhan-${slug(report.club.name)}`,
    sheets: [
      pairs([
        ['Có mặt', report.attendance.present],
        ['Đi muộn', report.attendance.late],
        ['Vắng có phép', report.attendance.excused],
        ['Vắng không phép', report.attendance.absent],
        ['Tỉ lệ chuyên cần', rate(report.attendance.rate)],
        ['Việc xong đúng hạn', report.tasks.doneOnTime],
        ['Việc xong trễ', report.tasks.doneLate],
        ['Việc đang làm', report.tasks.open],
        ['Việc quá hạn', report.tasks.overdue],
      ]),
      {
        name: 'Đóng quỹ',
        columns: [{ label: 'Đợt' }, { label: 'Hạn nộp' }, { label: 'Phải nộp' }, { label: 'Đã nộp' }],
        rows: report.dues.map((row) => [row.name, formatDate(row.dueOn), row.amountDue, row.paid]),
      },
    ],
  }
}

export function eventReportDocument(report: EventReport, eventName: string): ExportDocument {
  const stats = report.registrations
  const sheets: ExportSheet[] = [
    pairs([
      ['Số chỗ', stats.capacity ?? 'Không giới hạn'],
      ['Nhận chỗ', stats.confirmed],
      ['Danh sách chờ', stats.waitlisted],
      ['Chờ xác nhận lại', stats.reconfirmPending],
      ['Đã hủy', stats.cancelled],
      ['Khách mời', stats.guests],
      ['Khách mời đã có mặt', stats.guestsCheckedIn],
      ['Việc của BTC', report.tasks.total.total],
      ['Việc xong', report.tasks.total.done],
      ['Việc quá hạn', report.tasks.total.overdue],
      ['Số dư quỹ', money(report.fund?.balance ?? null)],
      ['Thu của quỹ', money(report.fund?.income ?? null)],
      ['Chi của quỹ', money(report.fund?.expense ?? null)],
    ]),
    {
      name: 'Điểm danh',
      columns: [{ label: 'Ngày' }, { label: 'Đã chốt' }, { label: 'Đối tượng' }, ...attendanceColumns],
      rows: report.attendance.map((day) => [formatDate(day.day), day.closed ? 'Có' : 'Chưa', day.expected, ...attendanceCells(day.tally)]),
    },
    {
      name: 'Việc theo tiểu ban',
      columns: [{ label: 'Tiểu ban' }, { label: 'Tổng' }, { label: 'Mới giao' }, { label: 'Đang làm' }, { label: 'Chờ nghiệm thu' }, { label: 'Hoàn thành' }, { label: 'Quá hạn' }],
      rows: report.tasks.subcommittees.map((row) => [row.name, row.counts.total, row.counts.assigned, row.counts.inProgress, row.counts.pendingReview, row.counts.done, row.counts.overdue]),
    },
  ]
  // Thống kê nhân sự chỉ Trưởng BTC, ban chủ nhiệm CLB chủ trì xem được (FR-RPT-05): không có thì không có sheet.
  if (report.staff) {
    sheets.push({
      name: 'Nhân sự BTC',
      columns: [{ label: 'Họ tên' }, { label: 'Tiểu ban' }, { label: 'Đang làm' }, { label: 'Hoàn thành' }, { label: 'Quá hạn' }, { label: 'Ngày có mặt' }],
      rows: report.staff.map((row) => [row.person.fullName, row.subcommitteeName, row.open, row.done, row.overdue, `${row.presentDays}/${row.days}`]),
    })
  }
  return { title: `Báo cáo sự kiện ${eventName}`, subtitle: `Xuất lúc ${formatDateTime(new Date().toISOString())}`, fileBase: `bao-cao-su-kien-${slug(eventName)}`, sheets: sheets.map(dropEmptyRowsOfPairs) }
}

/** Sheet tổng quan: bỏ dòng mà người xuất không được xem (giá trị null, ví dụ quỹ sự kiện). */
function dropEmptyRowsOfPairs(sheet: ExportSheet): ExportSheet {
  return sheet.name === 'Tổng quan' ? { ...sheet, rows: sheet.rows.filter((row) => row[1] !== null) } : sheet
}

export function financeReportDocument(report: FinanceReport, clubName: string, unpaid: UnpaidDuesRow[]): ExportDocument {
  const filters = [report.category ? `hạng mục ${financeCategoryLabel[report.category]}` : null, report.event ? `sự kiện ${report.event.name}` : null].filter(Boolean).join(', ')
  return {
    title: `Báo cáo thu chi ${clubName}`,
    subtitle: `Kỳ ${report.label} (${formatDate(report.from)} – ${formatDate(report.to)})${filters ? ` · ${filters}` : ''}`,
    fileBase: `bao-cao-thu-chi-${slug(clubName)}`,
    sheets: [
      pairs([
        ['Tổng thu', report.totalIncome],
        ['Tổng chi', report.totalExpense],
        ['Chênh lệch', report.net],
        ['Tạm ứng quá hạn', report.overdueAdvanceCount],
        ['Người còn thiếu quỹ', report.unpaidDuesCount],
      ]),
      { name: 'Theo hạng mục', columns: [{ label: 'Hạng mục' }, { label: 'Thu' }, { label: 'Chi' }], rows: report.byCategory.map((row) => [financeCategoryLabel[row.category], row.income, row.expense]) },
      { name: 'Theo quỹ', columns: [{ label: 'Quỹ' }, { label: 'Thu' }, { label: 'Chi' }], rows: report.byFund.map((row) => [row.fundName, row.income, row.expense]) },
      { name: 'Theo tháng', columns: [{ label: 'Tháng' }, { label: 'Thu' }, { label: 'Chi' }], rows: report.byMonth.map((row) => [row.month, row.income, row.expense]) },
      {
        name: 'Cùng người duyệt và ghi sổ',
        columns: [{ label: 'Ngày' }, { label: 'Nội dung' }, { label: 'Số tiền' }, { label: 'Quỹ' }, { label: 'Người' }],
        rows: report.flagged.map((row) => [formatDate(row.occurredOn), row.description, row.amount, row.fundName, row.person.fullName]),
      },
      {
        name: 'Chưa nộp quỹ',
        columns: [{ label: 'Đợt' }, { label: 'Thành viên' }, { label: 'Còn thiếu' }, { label: 'Hạn' }, { label: 'Quá hạn' }],
        rows: unpaid.map((row) => [row.campaignName, row.member.fullName, row.owed, formatDate(row.dueOn), row.overdue ? 'Có' : 'Không']),
      },
    ],
  }
}

export function auditLogDocument(entries: AuditLogEntry[], clubName: string, filterText: string): ExportDocument {
  return {
    title: `Nhật ký thao tác ${clubName}`,
    subtitle: filterText,
    fileBase: `nhat-ky-${slug(clubName)}`,
    sheets: [
      {
        name: 'Nhật ký',
        columns: [{ label: 'Thời điểm' }, { label: 'Người làm' }, { label: 'Thao tác' }, { label: 'Đối tượng' }, { label: 'Thay đổi' }, { label: 'Lý do' }],
        rows: entries.map((entry) => [
          formatDateTime(entry.at),
          entry.actor.fullName,
          auditActionLabel(entry.action),
          `${auditObjectTypeLabel[entry.objectType]}: ${entry.objectLabel}`,
          auditChanges(entry)
            .map((change) => `${change.label}: ${change.before} → ${change.after}`)
            .join('; ') || null,
          entry.reason,
        ]),
      },
    ],
  }
}

/** Số dòng có dữ liệu cá nhân của người khác trong tài liệu (để quyết định ghi nhật ký). */
export const personalRowsOf = (document: ExportDocument, sheetNames: string[]) =>
  document.sheets.filter((sheet) => sheetNames.includes(sheet.name)).reduce((sum, sheet) => sum + sheet.rows.length, 0)

/** Bỏ cột trống ở mọi sheet, sinh tệp và trả về như tải tệp. */
export async function reportFileResponse(document: ExportDocument, format: ExportFormat): Promise<Response> {
  const file = await exportFile({ ...document, sheets: document.sheets.map(dropEmptyColumns) }, format)
  return downloadResponse(file.blob, file.fileName, file.contentType)
}
