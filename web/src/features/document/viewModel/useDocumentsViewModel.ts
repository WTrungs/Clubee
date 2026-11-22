import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict, isForbidden } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { termRepository } from '@/features/term/model/termRepository'
import { termQueryKeys } from '@/features/term/viewModel/termQueryKeys'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { saveBlob } from '@/shared/lib/saveBlob'
import { documentRepository } from '../model/documentRepository'
import type { DocumentDetail, DocumentOwnerType, DocumentQuery, DocumentScopeOption } from '../model/documentTypes'
import { documentFormSchema, scopeKeyOf, toUploadRequest, versionFormSchema, type DocumentFormValues, type VersionFormValues } from './documentFormSchema'

export const documentQueryKeys = {
  all: ['documents'] as const,
  lists: (clubId: string) => ['documents', 'list', clubId] as const,
  list: (clubId: string, query: DocumentQuery) => ['documents', 'list', clubId, query] as const,
  facets: (clubId: string) => ['documents', 'facets', clubId] as const,
  scopes: (clubId: string) => ['documents', 'scopes', clubId] as const,
  detail: (clubId: string, documentId: string) => ['documents', 'detail', clubId, documentId] as const,
}

const PAGE_SIZE = 50

/** FR-DOC-02: tìm, lọc tài liệu người dùng được xem; tải xuống qua máy chủ để quyền được kiểm lại mỗi lần. */
export function useDocumentsViewModel() {
  const { clubId } = useCurrentClub()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 300)
  const [tag, setTag] = useState('')
  const [termId, setTermId] = useState('')
  const [owner, setOwner] = useState('')
  const [page, setPage] = useState(0)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [versionOpen, setVersionOpen] = useState(false)

  const [ownerType, ownerId] = owner ? (owner.split(':') as [DocumentOwnerType, string | undefined]) : [undefined, undefined]
  const query: DocumentQuery = { q: debouncedKeyword || undefined, tag: tag || undefined, termId: termId || undefined, ownerType, ownerId: ownerId || undefined, page }
  const list = useQuery({ queryKey: documentQueryKeys.list(clubId, query), queryFn: () => documentRepository.list(clubId, query), placeholderData: keepPreviousData })
  const facets = useQuery({ queryKey: documentQueryKeys.facets(clubId), queryFn: () => documentRepository.facets(clubId) })
  const scopes = useQuery({ queryKey: documentQueryKeys.scopes(clubId), queryFn: () => documentRepository.scopes(clubId) })
  const detail = useQuery({
    queryKey: documentQueryKeys.detail(clubId, detailId ?? ''),
    queryFn: () => documentRepository.get(clubId, detailId ?? ''),
    enabled: detailId !== null,
  })

  const download = useMutation({
    mutationFn: ({ documentId, versionNumber }: { documentId: string; versionNumber?: number }) => documentRepository.download(clubId, documentId, versionNumber),
    meta: { silentError: true },
    onSuccess: ({ blob, fileName }, { documentId }) => {
      const fallback = list.data?.content.find((document) => document.id === documentId)?.fileName ?? 'tai-lieu'
      saveBlob(blob, fileName ?? fallback)
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      // Vừa mất quyền xem: tải lại để tài liệu biến khỏi danh sách.
      if (isForbidden(error)) {
        setDetailId(null)
        void queryClient.invalidateQueries({ queryKey: documentQueryKeys.all })
      }
    },
  })

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value)
    setPage(0)
  }
  const filtered = keyword !== '' || tag !== '' || termId !== '' || owner !== ''
  return {
    clubId,
    keyword,
    setKeyword: resetPage(setKeyword),
    tag,
    setTag: resetPage(setTag),
    termId,
    setTermId: resetPage(setTermId),
    owner,
    setOwner: resetPage(setOwner),
    filtered,
    clearFilters: () => {
      setKeyword('')
      setTag('')
      setTermId('')
      setOwner('')
      setPage(0)
    },
    facets: facets.data ?? { tags: [], terms: [], owners: [] },
    rows: list.data?.content ?? [],
    loading: list.isPending,
    error: list.error,
    refetch: () => void list.refetch(),
    page: list.data?.page ?? 0,
    totalPages: list.data?.totalPages ?? 0,
    totalElements: list.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
    scopes: scopes.data ?? [],
    canUpload: (scopes.data?.length ?? 0) > 0,
    uploadOpen,
    setUploadOpen,
    detailId,
    openDetail: setDetailId,
    closeDetail: () => setDetailId(null),
    detail: detail.data ?? null,
    detailLoading: detail.isPending && detailId !== null,
    detailError: detail.error,
    download: (documentId: string, versionNumber?: number) => download.mutate({ documentId, versionNumber }),
    downloadingId: download.isPending ? (download.variables?.documentId ?? null) : null,
    /** Bản đang tải xuống ở mục Phiên bản; `undefined` là bản hiện hành. */
    downloadingVersion: download.isPending ? download.variables?.versionNumber : undefined,
    versionOpen,
    setVersionOpen,
  }
}

export type DocumentsViewModel = ReturnType<typeof useDocumentsViewModel>

const SERVER_FIELDS = ['title', 'description', 'visibility'] as const
const SERVER_RENAME = { file: 'file', tags: 'tagsText', termId: 'termId', ownerType: 'scopeKey' } as const

function defaults(scopes: readonly DocumentScopeOption[], termId: string): DocumentFormValues {
  return { file: null, title: '', description: '', scopeKey: scopes[0] ? scopeKeyOf(scopes[0]) : '', termId, tagsText: '', visibility: 'CLUB' }
}

/** FR-DOC-01: tải tài liệu lên một nơi người dùng có quyền; nhiệm kỳ mặc định là nhiệm kỳ hiện tại. */
export function useUploadDocumentViewModel(clubId: string, scopes: readonly DocumentScopeOption[], onDone: () => void) {
  const queryClient = useQueryClient()
  const terms = useQuery({ queryKey: termQueryKeys.list(clubId), queryFn: () => termRepository.list(clubId) })
  // Luôn gắn một nhiệm kỳ, mặc định nhiệm kỳ hiện tại; CLB chưa có nhiệm kỳ nào thì để trống.
  const currentTermId = terms.data?.find((term) => term.status === 'RUNNING' || term.status === 'HANDING_OVER')?.id ?? terms.data?.[0]?.id ?? ''
  const form = useForm<DocumentFormValues>({ resolver: zodResolver(documentFormSchema), values: defaults(scopes, currentTermId), resetOptions: { keepDirtyValues: true } })
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)

  const upload = useMutation({
    mutationFn: (values: DocumentFormValues) => documentRepository.upload(clubId, toUploadRequest(values)),
    meta: { silentError: true },
    onMutate: () => setFieldErrorsApplied(false),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: documentQueryKeys.all })
      toast.success(`Đã tải lên “${saved.title}”.`)
      form.reset(defaults(scopes, currentTermId))
      onDone()
    },
    onError: (error) => {
      setFieldErrorsApplied(applyServerFieldErrors(error, form.setError, SERVER_FIELDS, SERVER_RENAME))
      if (isForbidden(error)) void queryClient.invalidateQueries({ queryKey: documentQueryKeys.scopes(clubId) })
    },
  })

  return {
    form,
    terms: (terms.data ?? []).toSorted((a, b) => b.startOn.localeCompare(a.startOn)),
    submit: form.handleSubmit((values) => upload.mutate(values)),
    pending: upload.isPending,
    errorMessage: upload.error && !(fieldErrorsApplied && upload.error instanceof ApiError) ? getErrorMessage(upload.error) : null,
    reset: () => {
      form.reset(defaults(scopes, currentTermId))
      upload.reset()
      setFieldErrorsApplied(false)
    },
  }
}

const VERSION_FIELDS = ['file', 'note'] as const

/** FR-DOC-03: tải phiên bản mới cho tài liệu đang xem; gửi `version` lúc mở hộp để biết có ai vừa sửa (409). */
export function useUploadVersionViewModel(clubId: string, document: DocumentDetail | null, onDone: () => void) {
  const queryClient = useQueryClient()
  const form = useForm<VersionFormValues>({ resolver: zodResolver(versionFormSchema), defaultValues: { file: null, note: '' } })
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)
  const upload = useMutation({
    mutationFn: (values: VersionFormValues) =>
      documentRepository.uploadVersion(clubId, document?.id ?? '', { file: values.file as File, note: values.note.trim(), version: document?.version ?? 0 }),
    meta: { silentError: true },
    onMutate: () => setFieldErrorsApplied(false),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: documentQueryKeys.all })
      toast.success(`Đã tải lên bản ${saved.currentVersion} của “${saved.title}”.`)
      form.reset({ file: null, note: '' })
      onDone()
    },
    onError: (error) => {
      setFieldErrorsApplied(applyServerFieldErrors(error, form.setError, VERSION_FIELDS))
      // Người khác vừa thêm bản hoặc vừa mất quyền: tải lại để thấy bản mới nhất và nút đúng quyền.
      if (isConflict(error) || isForbidden(error)) void queryClient.invalidateQueries({ queryKey: documentQueryKeys.all })
    },
  })
  return {
    form,
    submit: form.handleSubmit((values) => upload.mutate(values)),
    pending: upload.isPending,
    errorMessage: upload.error && !(fieldErrorsApplied && upload.error instanceof ApiError) ? getErrorMessage(upload.error) : null,
    nextNumber: (document?.currentVersion ?? 0) + 1,
    reset: () => {
      form.reset({ file: null, note: '' })
      upload.reset()
      setFieldErrorsApplied(false)
    },
  }
}
