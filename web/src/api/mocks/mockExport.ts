import { vnToday } from './mockTime'

// Mock tự sinh tệp để thử luồng tải về; máy chủ thật dùng Apache POI (Excel) và OpenPDF (PDF). Thư viện chỉ nạp khi xuất.

export type ExportFormat = 'xlsx' | 'pdf'

export type ExportCell = string | number | null

export interface ExportSheet {
  name: string
  columns: Array<{ label: string; width?: number }>
  rows: ExportCell[][]
}

export interface ExportDocument {
  title: string
  subtitle?: string
  /** Tên tệp không đuôi, ví dụ `thanh-vien-gsv`; thêm ngày xuất và đuôi theo định dạng. */
  fileBase: string
  sheets: ExportSheet[]
}

export interface ExportedFile {
  blob: Blob
  fileName: string
  contentType: string
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
}

export const isExportFormat = (value: unknown): value is ExportFormat => value === 'xlsx' || value === 'pdf'

/** Bỏ cột mà mọi dòng đều trống: người xuất không được xem trường đó (FR-MEM-11, FR-RPT-07). */
export function dropEmptyColumns(sheet: ExportSheet): ExportSheet {
  const keep = sheet.columns.map((_, index) => sheet.rows.length === 0 || sheet.rows.some((row) => row[index] !== null && row[index] !== ''))
  return { ...sheet, columns: sheet.columns.filter((_, index) => keep[index]), rows: sheet.rows.map((row) => row.filter((_, index) => keep[index])) }
}

/** Tên sheet Excel tối đa 31 ký tự, không có ký tự cấm. */
const sheetName = (name: string, index: number) => (name.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || `Sheet ${index + 1}`)

async function toXlsx(document: ExportDocument): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Clubee'
  document.sheets.forEach((sheet, index) => {
    const worksheet = workbook.addWorksheet(sheetName(sheet.name, index))
    worksheet.addRow([document.title]).font = { bold: true, size: 14 }
    if (document.subtitle) worksheet.addRow([document.subtitle]).font = { italic: true, color: { argb: 'FF555555' } }
    worksheet.addRow([])
    const header = worksheet.addRow(sheet.columns.map((column) => column.label))
    header.font = { bold: true }
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } }
    })
    for (const row of sheet.rows) worksheet.addRow(row.map((cell) => cell ?? ''))
    sheet.columns.forEach((column, columnIndex) => {
      const longest = Math.max(column.label.length, ...sheet.rows.map((row) => String(row[columnIndex] ?? '').length))
      worksheet.getColumn(columnIndex + 1).width = column.width ?? Math.min(Math.max(longest + 2, 10), 50)
    })
  })
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: CONTENT_TYPES.xlsx })
}

/** Font có đủ dấu tiếng Việt, nhúng dạng tập con cho nhẹ. */
async function fontBytes(): Promise<{ regular: Uint8Array; semiBold: Uint8Array }> {
  const [{ default: regular }, { default: semiBold }] = await Promise.all([
    import('./assets/fonts/beVietnamProRegular.ttf?inline'),
    import('./assets/fonts/beVietnamProSemiBold.ttf?inline'),
  ])
  const decode = (dataUrl: string) => Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (char) => char.charCodeAt(0))
  return { regular: decode(regular), semiBold: decode(semiBold) }
}

async function toPdf(document: ExportDocument): Promise<Blob> {
  const [{ PDFDocument, rgb }, { default: fontkit }, fonts] = await Promise.all([import('pdf-lib'), import('@pdf-lib/fontkit'), fontBytes()])
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  pdf.setTitle(document.title)
  const regular = await pdf.embedFont(fonts.regular, { subset: true })
  const bold = await pdf.embedFont(fonts.semiBold, { subset: true })
  const margin = 36
  const rowHeight = 16
  const fontSize = 8.5
  const fit = (text: string, width: number, font = regular) => {
    if (font.widthOfTextAtSize(text, fontSize) <= width) return text
    let cut = text
    while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, fontSize) > width) cut = cut.slice(0, -1)
    return `${cut}…`
  }
  for (const sheet of document.sheets) {
    // Nhiều cột thì quay ngang A4 để đủ chỗ.
    const [pageWidth, pageHeight] = sheet.columns.length > 5 ? [841.89, 595.28] : [595.28, 841.89]
    const usable = pageWidth - margin * 2
    const weights = sheet.columns.map((column, index) => Math.min(Math.max(column.label.length, ...sheet.rows.map((row) => String(row[index] ?? '').length), 4), 40))
    const total = weights.reduce((sum, weight) => sum + weight, 0) || 1
    const widths = weights.map((weight) => (usable * weight) / total)
    let page = pdf.addPage([pageWidth, pageHeight])
    let y = pageHeight - margin
    const drawHeader = () => {
      page.drawRectangle({ x: margin, y: y - rowHeight + 4, width: usable, height: rowHeight, color: rgb(0.91, 0.93, 0.97) })
      let x = margin
      sheet.columns.forEach((column, index) => {
        page.drawText(fit(column.label, (widths[index] ?? 0) - 6, bold), { x: x + 3, y: y - 8, size: fontSize, font: bold })
        x += widths[index] ?? 0
      })
      y -= rowHeight
    }
    page.drawText(document.title, { x: margin, y: y - 14, size: 15, font: bold })
    y -= 22
    if (document.subtitle) {
      page.drawText(document.subtitle, { x: margin, y: y - 10, size: 9.5, font: regular, color: rgb(0.35, 0.35, 0.35) })
      y -= 16
    }
    page.drawText(sheet.name, { x: margin, y: y - 14, size: 11, font: bold })
    y -= 22
    drawHeader()
    if (sheet.rows.length === 0) page.drawText('Không có dữ liệu.', { x: margin + 3, y: y - 8, size: fontSize, font: regular })
    for (const row of sheet.rows) {
      if (y - rowHeight < margin) {
        page = pdf.addPage([pageWidth, pageHeight])
        y = pageHeight - margin
        drawHeader()
      }
      let x = margin
      row.forEach((cell, index) => {
        page.drawText(fit(String(cell ?? ''), (widths[index] ?? 0) - 6), { x: x + 3, y: y - 8, size: fontSize, font: regular })
        x += widths[index] ?? 0
      })
      page.drawLine({ start: { x: margin, y: y - rowHeight + 4 }, end: { x: margin + usable, y: y - rowHeight + 4 }, thickness: 0.4, color: rgb(0.85, 0.85, 0.85) })
      y -= rowHeight
    }
  }
  const bytes = await pdf.save()
  return new Blob([new Uint8Array(bytes)], { type: CONTENT_TYPES.pdf })
}

export async function exportFile(document: ExportDocument, format: ExportFormat): Promise<ExportedFile> {
  const blob = format === 'xlsx' ? await toXlsx(document) : await toPdf(document)
  return { blob, fileName: `${document.fileBase}-${vnToday()}.${format}`, contentType: CONTENT_TYPES[format] }
}
