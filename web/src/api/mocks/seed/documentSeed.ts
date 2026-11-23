import type { DocumentOwnerType, DocumentVisibility } from '@/features/document/model/documentTypes'
import { vnDayAt } from '../mockTime'

/** Tài liệu của CLB (FR-DOC-01); dữ liệu tổng hợp. Nội dung tệp giữ riêng ở `db.documentFiles`. */
export interface DbDocument {
  id: string
  clubId: string
  title: string
  description: string
  fileName: string
  fileSize: number
  contentType: string
  ownerType: DocumentOwnerType
  /** Bằng `null` khi nơi sở hữu là CLB. */
  ownerId: string | null
  termId: string | null
  tags: string[]
  visibility: DocumentVisibility
  uploadedBy: string
  /** Họ tên chụp lúc tải lên (BR-DATA-02). */
  uploaderName: string
  uploadedAt: string
}

/** Nội dung tệp tải lên lúc chạy; tài liệu mẫu không có bản ghi ở đây thì tạo nội dung tạm khi tải. */
export interface DbDocumentFile {
  documentId: string
  file: Blob
}

const PDF = 'application/pdf'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function createDocumentSeed(): DbDocument[] {
  const doc = (fields: Omit<DbDocument, 'clubId' | 'description'> & Partial<Pick<DbDocument, 'description'>>): DbDocument => ({
    clubId: 'c-guitar',
    description: '',
    ...fields,
  })
  return [
    doc({
      id: 'doc-rules',
      title: 'Nội quy CLB Guitar 2026',
      description: 'Bản nội quy được thông qua ở buổi họp đầu nhiệm kỳ.',
      fileName: 'noi-quy-2026.pdf',
      fileSize: 182_000,
      contentType: PDF,
      ownerType: 'CLUB',
      ownerId: null,
      termId: 't-guitar-2026',
      tags: ['nội quy', 'nhiệm kỳ'],
      visibility: 'CLUB',
      uploadedBy: 'u-anh',
      uploaderName: 'Nguyễn Minh Anh',
      uploadedAt: vnDayAt(-60, 9),
    }),
    doc({
      id: 'doc-media-plan',
      title: 'Kế hoạch truyền thông Đêm nhạc Mùa đông',
      fileName: 'ke-hoach-truyen-thong.docx',
      fileSize: 64_000,
      contentType: DOCX,
      ownerType: 'DEPARTMENT',
      ownerId: 'd-media',
      termId: 't-guitar-2026',
      tags: ['truyền thông', 'đêm nhạc'],
      visibility: 'OWNER',
      uploadedBy: 'u-linh',
      uploaderName: 'Đặng Khánh Linh',
      uploadedAt: vnDayAt(-5, 21),
    }),
    doc({
      id: 'doc-winter-budget',
      title: 'Dự toán Đêm nhạc Mùa đông',
      fileName: 'du-toan-dem-nhac.xlsx',
      fileSize: 23_000,
      contentType: XLSX,
      ownerType: 'EVENT',
      ownerId: 'e-winter',
      termId: 't-guitar-2026',
      tags: ['dự toán', 'đêm nhạc'],
      visibility: 'OWNER',
      uploadedBy: 'u-bao',
      uploaderName: 'Trần Quốc Bảo',
      uploadedAt: vnDayAt(-8, 20),
    }),
    doc({
      id: 'doc-handover-2025',
      title: 'Biên bản bàn giao nhiệm kỳ 2025–2026',
      fileName: 'bien-ban-ban-giao-2025.pdf',
      fileSize: 240_000,
      contentType: PDF,
      ownerType: 'CLUB',
      ownerId: null,
      termId: 't-guitar-2025',
      tags: ['bàn giao'],
      visibility: 'BOARD',
      uploadedBy: 'u-dat',
      uploaderName: 'Hồ Tấn Đạt',
      uploadedAt: vnDayAt(-66, 15),
    }),
  ]
}
