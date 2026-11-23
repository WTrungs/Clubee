import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { httpClient } from '@/api/httpClient'
import { db } from '@/api/mocks/db'
import { eventRepository } from '@/features/event/model/eventRepository'
import { financeReportRepository } from '@/features/finance/model/financeReportRepository'
import { signInAs } from '@/testUtils'
import { auditLogRepository } from '../model/auditLogRepository'
import { clubReportRepository } from '../model/clubReportRepository'
import { myReportRepository } from '../model/myReportRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const PERIOD = { period: 'CUSTOM' as const, from: '2025-06-01', to: '2027-06-01' }
const exportsLogged = () => db.auditLogs.filter((log) => log.action === 'EXPORT_REPORT').length

async function sheetNames(blob: Blob) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await blob.arrayBuffer())
  return workbook.worksheets.map((sheet) => sheet.name)
}

const isPdf = async (blob: Blob) => new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5)) === '%PDF-'

describe('xuất báo cáo Excel, PDF (FR-RPT-07)', () => {
  it('báo cáo CLB: số liệu gộp, không ghi nhật ký; định dạng sai thì 400', async () => {
    signInAs('u-anh')
    const before = exportsLogged()
    const file = await clubReportRepository.exportClubReport('c-guitar', PERIOD, 'xlsx')
    expect(file.fileName).toMatch(/^bao-cao-clb-clb-guitar-sinh-vien-.*\.xlsx$/)
    expect(await sheetNames(file.blob)).toEqual(['Tổng quan', 'Chuyên cần theo buổi', 'Sự kiện'])
    expect(exportsLogged()).toBe(before)
    expect(await fail(httpClient.download('/clubs/c-guitar/club-report/export', { query: { ...PERIOD, format: 'csv' } }))).toMatchObject({ status: 400 })
    signInAs('u-ha')
    expect(await fail(clubReportRepository.exportClubReport('c-guitar', PERIOD, 'xlsx'))).toMatchObject({ status: 403 })
  })

  it('báo cáo ban có tên thành viên: PDF hợp lệ và ghi nhật ký', async () => {
    signInAs('u-anh')
    const [department] = await clubReportRepository.departments('c-guitar')
    const file = await clubReportRepository.exportDepartmentReport('c-guitar', department?.id ?? '', PERIOD, 'pdf')
    expect(await isPdf(file.blob)).toBe(true)
    expect(db.auditLogs.at(-1)).toMatchObject({ action: 'EXPORT_REPORT', clubId: 'c-guitar', after: { report: `Báo cáo Ban ${department?.name ?? ''}`, format: 'PDF' } })
  })

  it('báo cáo cá nhân là dữ liệu của chính mình nên không ghi nhật ký', async () => {
    signInAs('u-ha')
    const before = exportsLogged()
    const file = await myReportRepository.exportReport({ clubId: 'c-guitar', ...PERIOD }, 'xlsx')
    expect(await sheetNames(file.blob)).toEqual(['Tổng quan', 'Đóng quỹ'])
    expect(exportsLogged()).toBe(before)
  })

  it('báo cáo sự kiện: Trưởng BTC có sheet nhân sự và ghi nhật ký; nhân sự thường không có sheet đó', async () => {
    signInAs('u-bao')
    const lead = await eventRepository.exportReport('c-guitar', 'e-winter', 'xlsx')
    expect(await sheetNames(lead.blob)).toContain('Nhân sự BTC')
    expect(db.auditLogs.at(-1)?.after).toMatchObject({ report: 'Báo cáo sự kiện Đêm nhạc Mùa đông' })

    signInAs('u-ha')
    const before = exportsLogged()
    const staff = await eventRepository.exportReport('c-guitar', 'e-winter', 'xlsx')
    expect(await sheetNames(staff.blob)).not.toContain('Nhân sự BTC')
    expect(exportsLogged()).toBe(before)
  })

  it('báo cáo thu chi kèm danh sách chưa nộp quỹ, chỉ ban chủ nhiệm; nhật ký thao tác xuất được PDF', async () => {
    signInAs('u-anh')
    const finance = await financeReportRepository.export('c-guitar', PERIOD, 'xlsx')
    expect(await sheetNames(finance.blob)).toEqual(expect.arrayContaining(['Tổng quan', 'Theo hạng mục', 'Chưa nộp quỹ']))
    expect(db.auditLogs.at(-1)?.after).toMatchObject({ report: 'Báo cáo thu chi', format: 'XLSX' })
    const log = await auditLogRepository.export('c-guitar', {}, 'pdf')
    expect(await isPdf(log.blob)).toBe(true)
    signInAs('u-ha')
    expect(await fail(financeReportRepository.export('c-guitar', PERIOD, 'xlsx'))).toMatchObject({ status: 403 })
    expect(await fail(auditLogRepository.export('c-guitar', {}, 'xlsx'))).toMatchObject({ status: 403 })
  })
})
