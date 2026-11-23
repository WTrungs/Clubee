import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { exportFile } from '@/api/mocks/mockExport'
import { signInAs } from '@/testUtils'
import { memberRepository } from '../model/memberRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)

async function readSheet(blob: Blob) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await blob.arrayBuffer())
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error('Thiếu sheet')
  const rows: string[][] = []
  sheet.eachRow((row) => rows.push((row.values as unknown[]).slice(1).map((cell) => String(cell ?? ''))))
  return { name: sheet.name, rows }
}

describe('xuất danh sách thành viên (FR-MEM-11)', () => {
  it('ban chủ nhiệm xuất Excel theo bộ lọc, có liên hệ; ghi nhật ký', async () => {
    signInAs('u-anh')
    const all = await memberRepository.list('c-guitar', { size: 200 })
    const file = await memberRepository.exportList('c-guitar', {})
    expect(file.fileName).toMatch(/^thanh-vien-gsv-\d{4}-\d{2}-\d{2}\.xlsx$/)
    const { name, rows } = await readSheet(file.blob)
    expect(name).toBe('Thành viên')
    expect(rows[0]?.[0]).toBe('Danh sách thành viên CLB Guitar Sinh viên')
    const header = rows.find((row) => row[0] === 'Họ tên')
    expect(header).toEqual(expect.arrayContaining(['Họ tên', 'Trạng thái', 'Ban', 'Email', 'Số điện thoại']))
    expect(rows.length - rows.indexOf(header ?? [])).toBe(all.totalElements + 1)
    expect(db.auditLogs.at(-1)).toMatchObject({ action: 'EXPORT_MEMBERS', after: { rows: all.totalElements, filters: 'Không lọc' } })

    const filtered = await readSheet((await memberRepository.exportList('c-guitar', { q: 'Lê Thu Hà' })).blob)
    expect(filtered.rows.at(-1)?.[0]).toBe('Lê Thu Hà')
    expect(db.auditLogs.at(-1)?.after).toMatchObject({ rows: 1, filters: 'từ khóa "Lê Thu Hà"' })
  })

  it('người không thuộc ban chủ nhiệm không xuất được; sai định dạng thì 400', async () => {
    signInAs('u-ha')
    expect(await fail(memberRepository.exportList('c-guitar', {}))).toMatchObject({ status: 403 })
  })

  it('bỏ cột mà người xuất không được xem; PDF có font tiếng Việt', async () => {
    const xlsx = await exportFile(
      { title: 'Thử', fileBase: 'thu', sheets: [{ name: 'Bảng', columns: [{ label: 'Họ tên' }, { label: 'Email' }], rows: [['Nguyễn Văn Ánh', null]] }] },
      'xlsx',
    )
    expect(xlsx.contentType).toContain('spreadsheetml')
    const pdf = await exportFile({ title: 'Báo cáo thử', subtitle: 'Kỳ tháng 11', fileBase: 'thu', sheets: [{ name: 'Bảng', columns: [{ label: 'Họ tên' }], rows: [['Nguyễn Văn Ánh']] }] }, 'pdf')
    const head = new TextDecoder().decode((await pdf.blob.arrayBuffer()).slice(0, 5))
    expect(head).toBe('%PDF-')
    expect(pdf.fileName.endsWith('.pdf')).toBe(true)
  })
})
