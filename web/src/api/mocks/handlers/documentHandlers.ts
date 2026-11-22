import { http, HttpResponse } from 'msw'
import type { FieldError } from '@/api/apiError'
import type { DocumentOwnerType, DocumentVisibility } from '@/features/document/model/documentTypes'
import { DOCUMENT_TAG_MAX_LENGTH, DOCUMENT_TAGS_MAX } from '@/shared/lib/documentRules'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { matchesKeyword } from '@/shared/lib/searchText'
import { validateUploadFile } from '@/shared/lib/validateUploadFile'
import { db, type DbDocument, type DbDocumentVersion } from '../db'
import { canUploadVersion, canViewDocument, documentScopesFor, ownerOf, toDocumentDetail, toDocumentSummary } from '../mockDocuments'
import { API, currentUser, networkDelay, newId, paginate, problem, writer } from '../mockHttp'
import { canAccessClub, personRef } from '../mockMembers'
import { currentTermOf } from '../mockPermissions'
import { nowIso } from '../mockTime'

// FR-DOC-01, 02, 03: tải lên theo quyền `MANAGE_DOCUMENTS`; mọi lần đọc và tải xuống đều kiểm lại quyền xem.

const OWNER_TYPES: DocumentOwnerType[] = ['CLUB', 'DEPARTMENT', 'EVENT']
const VISIBILITIES: DocumentVisibility[] = ['CLUB', 'OWNER', 'BOARD']
const notMember = () => problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')

function findDocument(params: Record<string, string | readonly string[] | undefined>) {
  return db.documents.find((candidate) => candidate.id === params.documentId && candidate.clubId === String(params.clubId))
}

/** Nhãn: bỏ khoảng trắng thừa, trùng thì giữ một; mỗi nhãn 1–30 ký tự. */
const normalizeTags = (raw: string[]) => [...new Set(raw.map((tag) => tag.trim().replace(/\s+/g, ' ')).filter((tag) => tag !== ''))]

/** Tệp của một bản; tệp mẫu chưa có nội dung thật thì tạo nội dung chữ tạm để tải xuống được. */
function fileOf(document: DbDocument, version: Pick<DbDocumentVersion, 'number' | 'contentType'>): Blob {
  const stored = db.documentFiles.find((candidate) => candidate.documentId === document.id && candidate.version === version.number)
  return stored?.file ?? new Blob([`Tài liệu mẫu: ${document.title} (bản ${version.number})\n`], { type: version.contentType })
}

/** Trả tệp kèm tên gốc (UTF-8); không lưu đệm vì quyền xem kiểm lại mỗi lần. */
function fileResponse(document: DbDocument, version: Pick<DbDocumentVersion, 'number' | 'contentType' | 'fileName'>): Response {
  const ascii = version.fileName.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/"/g, '') || 'tai-lieu'
  return new HttpResponse(fileOf(document, version), {
    headers: {
      'Content-Type': version.contentType,
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(version.fileName)}`,
      'Cache-Control': 'no-store',
    },
  })
}

export const documentHandlers = [
  http.get(`${API}/clubs/:clubId/document-scopes`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    return HttpResponse.json(documentScopesFor(user.value.id, clubId))
  }),

  http.get(`${API}/clubs/:clubId/documents/facets`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const visible = db.documents.filter((document) => document.clubId === clubId && canViewDocument(user.value.id, document))
    const terms = new Map(visible.map((document) => toDocumentSummary(document, user.value.id)).flatMap((summary) => (summary.term ? [[summary.term.id, summary.term] as const] : [])))
    const owners = new Map(visible.map((document) => [`${document.ownerType}:${document.ownerId ?? ''}`, ownerOf(document)] as const))
    return HttpResponse.json({
      tags: [...new Set(visible.flatMap((document) => document.tags))].toSorted((a, b) => a.localeCompare(b, 'vi')),
      terms: [...terms.values()].toSorted((a, b) => b.name.localeCompare(a.name, 'vi')),
      owners: [...owners.values()].toSorted((a, b) => OWNER_TYPES.indexOf(a.type) - OWNER_TYPES.indexOf(b.type) || a.name.localeCompare(b.name, 'vi')),
    })
  }),

  http.get(`${API}/clubs/:clubId/documents`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const url = new URL(request.url)
    const keyword = url.searchParams.get('q')
    const tag = url.searchParams.get('tag')
    const termId = url.searchParams.get('termId')
    const ownerType = url.searchParams.get('ownerType')
    const ownerId = url.searchParams.get('ownerId')
    const rows = db.documents
      .filter((document) => document.clubId === clubId && canViewDocument(user.value.id, document))
      .filter((document) => matchesKeyword(`${document.title} ${document.fileName} ${document.tags.join(' ')}`, keyword))
      .filter((document) => !tag || document.tags.includes(tag))
      .filter((document) => !termId || document.termId === termId)
      .filter((document) => !ownerType || (document.ownerType === ownerType && (!ownerId || document.ownerId === ownerId)))
      .toSorted((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt))
      .map((document) => toDocumentSummary(document, user.value.id))
    return HttpResponse.json(paginate(rows, url, 50))
  }),

  http.get(`${API}/clubs/:clubId/documents/:documentId`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    if (!canAccessClub(user.value.id, String(params.clubId))) return notMember()
    const document = findDocument(params)
    if (!document) return problem(404, 'Không tìm thấy tài liệu.', 'DOCUMENT_NOT_FOUND')
    if (!canViewDocument(user.value.id, document)) return problem(403, 'Bạn không có quyền xem tài liệu này.', 'FORBIDDEN')
    return HttpResponse.json(toDocumentDetail(document, user.value.id))
  }),

  http.get(`${API}/clubs/:clubId/documents/:documentId/file`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    if (!canAccessClub(user.value.id, String(params.clubId))) return notMember()
    const document = findDocument(params)
    if (!document) return problem(404, 'Không tìm thấy tài liệu.', 'DOCUMENT_NOT_FOUND')
    if (!canViewDocument(user.value.id, document)) return problem(403, 'Bạn không còn quyền xem tài liệu này.', 'FORBIDDEN')
    return fileResponse(document, { number: document.currentVersion, contentType: document.contentType, fileName: document.fileName })
  }),

  http.get(`${API}/clubs/:clubId/documents/:documentId/versions/:versionNumber/file`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    if (!canAccessClub(user.value.id, String(params.clubId))) return notMember()
    const document = findDocument(params)
    if (!document) return problem(404, 'Không tìm thấy tài liệu.', 'DOCUMENT_NOT_FOUND')
    if (!canViewDocument(user.value.id, document)) return problem(403, 'Bạn không còn quyền xem tài liệu này.', 'FORBIDDEN')
    const version = db.documentVersions.find((candidate) => candidate.documentId === document.id && candidate.number === Number(params.versionNumber))
    if (!version) return problem(404, 'Không tìm thấy phiên bản này của tài liệu.', 'VERSION_NOT_FOUND')
    return fileResponse(document, version)
  }),

  http.post(`${API}/clubs/:clubId/documents/:documentId/versions`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const userId = user.value.id
    if (!canAccessClub(userId, String(params.clubId))) return notMember()
    const document = findDocument(params)
    if (!document || !canViewDocument(userId, document)) return problem(404, 'Không tìm thấy tài liệu.', 'DOCUMENT_NOT_FOUND')
    // Kiểm quyền trước khi đọc tệp.
    if (!canUploadVersion(userId, document)) {
      return problem(403, 'Chỉ người tạo tài liệu hoặc người có quyền Quản lý tài liệu ở nơi sở hữu được tải phiên bản mới.', 'FORBIDDEN')
    }
    const form = await request.formData()
    if (Number(form.get('version')) !== document.version) {
      return problem(409, 'Tài liệu vừa được người khác cập nhật. Tải lại để xem phiên bản mới nhất.', 'VERSION_CONFLICT')
    }
    const file = form.get('file')
    const rawNote = form.get('note')
    const note = typeof rawNote === 'string' ? rawNote.trim() : ''
    const errors: FieldError[] = []
    if (!(file instanceof File)) errors.push({ field: 'file', message: 'Chọn tệp của phiên bản mới.' })
    else {
      const check = validateUploadFile(file)
      if (!check.ok) errors.push({ field: 'file', message: check.message })
    }
    if (note.length < REASON_MIN || note.length > REASON_MAX) errors.push({ field: 'note', message: `Ghi chú thay đổi cần từ ${REASON_MIN} đến ${REASON_MAX} ký tự.` })
    if (errors.length > 0 || !(file instanceof File)) return problem(400, 'Phiên bản mới chưa hợp lệ.', 'VALIDATION', errors)

    const uploaderName = personRef(userId).fullName
    const number = document.currentVersion + 1
    const uploadedAt = nowIso()
    const contentType = file.type || 'application/octet-stream'
    db.documentVersions.push({ documentId: document.id, number, fileName: file.name, fileSize: file.size, contentType, note, uploadedBy: userId, uploaderName, uploadedAt })
    db.documentFiles.push({ documentId: document.id, version: number, file })
    Object.assign(document, { fileName: file.name, fileSize: file.size, contentType, uploadedBy: userId, uploaderName, uploadedAt, currentVersion: number, version: document.version + 1 })
    return HttpResponse.json(toDocumentDetail(document, userId), { status: 201 })
  }),

  http.post(`${API}/clubs/:clubId/documents`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const userId = user.value.id
    const clubId = String(params.clubId)
    if (!canAccessClub(userId, clubId)) return notMember()
    const form = await request.formData()
    const text = (name: string) => {
      const value = form.get(name)
      return typeof value === 'string' ? value.trim() : ''
    }
    const scopes = documentScopesFor(userId, clubId)
    if (scopes.length === 0) return problem(403, 'Bạn chưa có quyền Quản lý tài liệu ở CLB, ban hay sự kiện nào.', 'FORBIDDEN')
    const ownerType = text('ownerType') as DocumentOwnerType
    const ownerId = ownerType === 'CLUB' ? null : text('ownerId') || null
    if (!OWNER_TYPES.includes(ownerType)) {
      return problem(400, 'Chọn nơi sở hữu tài liệu.', 'VALIDATION', [{ field: 'ownerType', message: 'Chọn CLB, ban hoặc sự kiện.' }])
    }
    const allowed = scopes.some((scope) => scope.type === ownerType && scope.id === ownerId)
    if (!allowed) return problem(403, 'Bạn không có quyền tải tài liệu lên nơi này (Quản lý tài liệu trong bảng phân quyền).', 'FORBIDDEN')

    const title = text('title')
    const description = text('description')
    const visibility = text('visibility') as DocumentVisibility
    const termId = text('termId') || currentTermOf(clubId)?.id || null
    const tags = normalizeTags(form.getAll('tags').filter((value): value is string => typeof value === 'string'))
    const file = form.get('file')
    const errors: FieldError[] = []
    if (!(file instanceof File)) errors.push({ field: 'file', message: 'Chọn tệp để tải lên.' })
    else {
      const check = validateUploadFile(file)
      if (!check.ok) errors.push({ field: 'file', message: check.message })
    }
    if (title.length < 3 || title.length > 150) errors.push({ field: 'title', message: 'Tên tài liệu cần từ 3 đến 150 ký tự.' })
    if (description.length > 1000) errors.push({ field: 'description', message: 'Mô tả tối đa 1000 ký tự.' })
    if (!VISIBILITIES.includes(visibility)) errors.push({ field: 'visibility', message: 'Chọn ai được xem.' })
    if (termId && !db.terms.some((term) => term.id === termId && term.clubId === clubId)) errors.push({ field: 'termId', message: 'Nhiệm kỳ không thuộc CLB.' })
    if (tags.length > DOCUMENT_TAGS_MAX) errors.push({ field: 'tags', message: `Tối đa ${DOCUMENT_TAGS_MAX} nhãn.` })
    else if (tags.some((tag) => tag.length > DOCUMENT_TAG_MAX_LENGTH)) errors.push({ field: 'tags', message: `Mỗi nhãn tối đa ${DOCUMENT_TAG_MAX_LENGTH} ký tự.` })
    if (errors.length > 0 || !(file instanceof File)) return problem(400, 'Thông tin tài liệu chưa hợp lệ.', 'VALIDATION', errors)

    const document: DbDocument = {
      id: newId('doc'),
      clubId,
      title,
      description,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type || 'application/octet-stream',
      ownerType,
      ownerId,
      termId,
      tags,
      visibility,
      uploadedBy: userId,
      uploaderName: personRef(userId).fullName,
      uploadedAt: nowIso(),
      createdBy: userId,
      currentVersion: 1,
      version: 1,
    }
    db.documents.push(document)
    db.documentVersions.push({
      documentId: document.id,
      number: 1,
      fileName: document.fileName,
      fileSize: document.fileSize,
      contentType: document.contentType,
      note: 'Bản đầu tiên.',
      uploadedBy: userId,
      uploaderName: document.uploaderName,
      uploadedAt: document.uploadedAt,
    })
    db.documentFiles.push({ documentId: document.id, version: 1, file })
    return HttpResponse.json(toDocumentDetail(document, userId), { status: 201 })
  }),
]
