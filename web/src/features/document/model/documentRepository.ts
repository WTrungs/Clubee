import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type { DocumentDetail, DocumentFacets, DocumentQuery, DocumentScopeOption, DocumentSummary, UploadDocumentRequest } from './documentTypes'

const documents = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}/documents`

export const documentRepository = {
  list: (clubId: string, query: DocumentQuery) =>
    httpClient.get<Page<DocumentSummary>>(documents(clubId), {
      query: { q: query.q, tag: query.tag, termId: query.termId, ownerType: query.ownerType, ownerId: query.ownerId, page: query.page },
    }),
  facets: (clubId: string) => httpClient.get<DocumentFacets>(`${documents(clubId)}/facets`),
  get: (clubId: string, documentId: string) => httpClient.get<DocumentDetail>(`${documents(clubId)}/${encodeURIComponent(documentId)}`),
  scopes: (clubId: string) => httpClient.get<DocumentScopeOption[]>(`/clubs/${encodeURIComponent(clubId)}/document-scopes`),
  /** FR-DOC-01: tải lên dạng multipart; nhãn gửi nhiều lần cùng tên `tags`. */
  upload: (clubId: string, request: UploadDocumentRequest) => {
    const form = new FormData()
    form.append('file', request.file)
    form.append('title', request.title)
    form.append('description', request.description)
    form.append('ownerType', request.ownerType)
    if (request.ownerId) form.append('ownerId', request.ownerId)
    if (request.termId) form.append('termId', request.termId)
    for (const tag of request.tags) form.append('tags', tag)
    form.append('visibility', request.visibility)
    return httpClient.post<DocumentDetail>(documents(clubId), form)
  },
  /** FR-DOC-02: máy chủ kiểm lại quyền xem mỗi lần tải. */
  download: (clubId: string, documentId: string) => httpClient.download(`${documents(clubId)}/${encodeURIComponent(documentId)}/file`),
}
