import type { DocumentAction, DocumentDetail, DocumentOwner, DocumentScopeOption, DocumentSummary, DocumentVersion } from '@/features/document/model/documentTypes'
import { db, type DbDocument } from './db'
import { can, type AccessScope } from './mockAccess'
import { canAccessClub, personRef } from './mockMembers'
import { EVENT_STAFF_ACTIVE, isBoardMember } from './mockPermissions'
import { isEventLead, isEventStaff } from './mockStaffEvents'

export function ownerOf(document: Pick<DbDocument, 'clubId' | 'ownerType' | 'ownerId'>): DocumentOwner {
  if (document.ownerType === 'DEPARTMENT') {
    const department = db.departments.find((candidate) => candidate.id === document.ownerId)
    return { type: 'DEPARTMENT', id: document.ownerId, name: department ? `Ban ${department.name}` : 'Ban không còn tồn tại' }
  }
  if (document.ownerType === 'EVENT') {
    const event = db.events.find((candidate) => candidate.id === document.ownerId)
    return { type: 'EVENT', id: document.ownerId, name: event ? `Sự kiện ${event.name}` : 'Sự kiện không còn tồn tại' }
  }
  return { type: 'CLUB', id: null, name: 'Toàn CLB' }
}

/** Người thuộc nơi sở hữu: thành viên có ban chính là ban đó, hoặc BTC sự kiện đó. */
function belongsToOwner(userId: string, document: DbDocument): boolean {
  if (document.ownerType === 'DEPARTMENT') {
    return db.memberships.some(
      (membership) => membership.userId === userId && membership.clubId === document.clubId && membership.departmentId === document.ownerId && membership.status !== 'LEFT',
    )
  }
  if (document.ownerType === 'EVENT') {
    const event = db.events.find((candidate) => candidate.id === document.ownerId)
    return event !== undefined && (isEventLead(userId, event) || isEventStaff(userId, event))
  }
  return false
}

/** FR-DOC-04: tài liệu đã ẩn chỉ còn ban chủ nhiệm thấy. */
export const hiddenFrom = (userId: string, document: DbDocument) => document.hidden !== null && !isBoardMember(userId, document.clubId)

/** FR-DOC-02: quyền xem tính lại mỗi lần đọc; ban chủ nhiệm xem mọi tài liệu của CLB mình. */
export function canViewDocument(userId: string, document: DbDocument): boolean {
  if (!canAccessClub(userId, document.clubId)) return false
  if (isBoardMember(userId, document.clubId)) return true
  if (document.hidden) return false
  if (document.visibility === 'CLUB') return true
  if (document.visibility === 'OWNER') return belongsToOwner(userId, document)
  return false
}

/** Những nơi người dùng được tải lên theo quyền `MANAGE_DOCUMENTS` (bảng phân quyền, SRS 3.3). */
export function documentScopesFor(userId: string, clubId: string): DocumentScopeOption[] {
  if (!canAccessClub(userId, clubId)) return []
  const scopes: DocumentScopeOption[] = []
  if (can(userId, clubId, 'MANAGE_DOCUMENTS')) scopes.push({ type: 'CLUB', id: null, name: 'Toàn CLB' })
  for (const department of db.departments.filter((candidate) => candidate.clubId === clubId && candidate.status === 'ACTIVE').toSorted((a, b) => a.name.localeCompare(b.name, 'vi'))) {
    if (can(userId, clubId, 'MANAGE_DOCUMENTS', { type: 'DEPARTMENT', id: department.id })) scopes.push({ type: 'DEPARTMENT', id: department.id, name: `Ban ${department.name}` })
  }
  for (const event of db.events.filter((candidate) => candidate.clubId === clubId && EVENT_STAFF_ACTIVE.includes(candidate.status))) {
    if (can(userId, clubId, 'MANAGE_DOCUMENTS', { type: 'EVENT', id: event.id })) scopes.push({ type: 'EVENT', id: event.id, name: `Sự kiện ${event.name}` })
  }
  return scopes
}

/** Phạm vi của nơi sở hữu, để xét quyền Quản lý tài liệu theo bảng phân quyền (quyền phạm vi cha phủ xuống). */
export function ownerScopeOf(document: Pick<DbDocument, 'ownerType' | 'ownerId'>): AccessScope {
  if (document.ownerType === 'DEPARTMENT') return { type: 'DEPARTMENT', id: document.ownerId ?? '' }
  if (document.ownerType === 'EVENT') return { type: 'EVENT', id: document.ownerId ?? '' }
  return { type: 'CLUB' }
}

/** Người quản lý nơi sở hữu: có `MANAGE_DOCUMENTS` ở phạm vi đó (ban chủ nhiệm phủ mọi nơi). */
export const managesDocument = (userId: string, document: DbDocument) => can(userId, document.clubId, 'MANAGE_DOCUMENTS', ownerScopeOf(document))

/** FR-DOC-03: người tạo tài liệu còn xem được, hoặc người quản lý nơi sở hữu, được tải phiên bản mới. */
export function canUploadVersion(userId: string, document: DbDocument): boolean {
  if (!canViewDocument(userId, document)) return false
  return document.createdBy === userId || managesDocument(userId, document)
}

export function documentActions(userId: string, document: DbDocument): DocumentAction[] {
  if (document.hidden) return isBoardMember(userId, document.clubId) ? ['RESTORE'] : []
  return [...(canUploadVersion(userId, document) ? (['UPLOAD_VERSION'] as const) : []), ...(managesDocument(userId, document) ? (['HIDE'] as const) : [])]
}

export const versionsOf = (documentId: string) =>
  db.documentVersions.filter((version) => version.documentId === documentId).toSorted((a, b) => b.number - a.number)

export function toDocumentSummary(document: DbDocument, viewerId: string): DocumentSummary {
  const term = db.terms.find((candidate) => candidate.id === document.termId)
  return {
    id: document.id,
    title: document.title,
    fileName: document.fileName,
    fileSize: document.fileSize,
    contentType: document.contentType,
    owner: ownerOf(document),
    term: term ? { id: term.id, name: term.name } : null,
    tags: document.tags,
    visibility: document.visibility,
    uploadedBy: { ...personRef(document.uploadedBy), fullName: document.uploaderName },
    uploadedAt: document.uploadedAt,
    currentVersion: document.currentVersion,
    allowedActions: documentActions(viewerId, document),
    hidden: document.hidden ? { by: { ...personRef(document.hidden.by), fullName: document.hidden.byName }, at: document.hidden.at, reason: document.hidden.reason } : null,
    version: document.version,
  }
}

export const toDocumentDetail = (document: DbDocument, viewerId: string): DocumentDetail => ({
  ...toDocumentSummary(document, viewerId),
  description: document.description,
  versions: versionsOf(document.id).map(
    (version): DocumentVersion => ({
      number: version.number,
      fileName: version.fileName,
      fileSize: version.fileSize,
      contentType: version.contentType,
      note: version.note,
      uploadedBy: { ...personRef(version.uploadedBy), fullName: version.uploaderName },
      uploadedAt: version.uploadedAt,
      current: version.number === document.currentVersion,
    }),
  ),
})
