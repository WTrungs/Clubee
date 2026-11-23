import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { NEWS_BODY_MAX, NEWS_BODY_MIN, NEWS_TITLE_MAX, NEWS_TITLE_MIN } from '@/shared/lib/newsRules'
import { validateImageFile } from '@/shared/lib/validateImageFile'
import { newsRepository } from '../model/newsRepository'
import type { NewsDetail, NewsStatus } from '../model/newsTypes'
import { newsQueryKeys } from './newsQueryKeys'

/** FR-CLB-06: danh sách tin; thành viên chỉ thấy tin đã xuất bản, ban chủ nhiệm lọc được theo trạng thái. */
export function useNewsListViewModel() {
  const { clubId, club } = useCurrentClub()
  const [searchParams, setSearchParams] = useSearchParams()
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<NewsStatus | null>(null)
  const [page, setPage] = useState(0)
  const [editor, setEditor] = useState<{ open: boolean; editing: NewsDetail | null }>({ open: false, editing: null })
  const q = useDebouncedValue(keyword.trim())
  const canManage = club.allowedActions.includes('MANAGE_NEWS')
  const query = { q: q || undefined, status: canManage ? (status ?? undefined) : undefined, page }
  const list = useQuery({ queryKey: newsQueryKeys.list(clubId, query), queryFn: () => newsRepository.list(clubId, query), placeholderData: keepPreviousData })
  const openedId = searchParams.get('news')

  const setParam = (newsId: string | null) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (newsId) next.set('news', newsId)
        else next.delete('news')
        return next
      },
      { replace: true },
    )

  return {
    clubName: club.name,
    canManage,
    keyword,
    setKeyword: (value: string) => {
      setKeyword(value)
      setPage(0)
    },
    status,
    toggleStatus: (value: NewsStatus) => {
      setStatus((current) => (current === value ? null : value))
      setPage(0)
    },
    rows: list.data?.content ?? [],
    loading: list.isPending,
    error: list.error,
    retry: () => void list.refetch(),
    filtered: q !== '' || status !== null,
    page: list.data?.page ?? 0,
    totalPages: list.data?.totalPages ?? 0,
    totalElements: list.data?.totalElements ?? 0,
    pageSize: list.data?.size ?? 12,
    setPage,
    openedId,
    open: (newsId: string) => setParam(newsId),
    close: () => setParam(null),
    editor,
    openCreate: () => setEditor({ open: true, editing: null }),
    openEdit: (news: NewsDetail) => setEditor({ open: true, editing: news }),
    closeEditor: () => setEditor((current) => ({ ...current, open: false })),
    /** Tạo xong thì mở luôn tin vừa tạo để xem trước rồi xuất bản. */
    afterSave: (saved: NewsDetail) => {
      setEditor((current) => ({ ...current, open: false }))
      setParam(saved.id)
    },
  }
}

/** Chi tiết một tin và hai thao tác Xuất bản (cả Hiện lại), Ẩn; lệch `version` thì tải lại. */
export function useNewsDetailViewModel(newsId: string | null) {
  const queryClient = useQueryClient()
  const { clubId } = useCurrentClub()
  const [confirmHide, setConfirmHide] = useState(false)
  const detail = useQuery({
    queryKey: newsQueryKeys.detail(clubId, newsId ?? ''),
    queryFn: () => newsRepository.get(clubId, newsId ?? ''),
    enabled: newsId !== null,
  })
  const applied = (saved: NewsDetail, message: string) => {
    queryClient.setQueryData(newsQueryKeys.detail(clubId, saved.id), saved)
    void queryClient.invalidateQueries({ queryKey: newsQueryKeys.all(clubId) })
    toast.success(message)
  }
  const failed = (error: unknown) => {
    toast.error(getErrorMessage(error))
    if (isConflict(error)) void queryClient.invalidateQueries({ queryKey: newsQueryKeys.all(clubId) })
  }
  const publish = useMutation({
    mutationFn: (news: NewsDetail) => newsRepository.publish(clubId, news.id, news.version),
    meta: { silentError: true },
    onSuccess: (saved, news) => applied(saved, news.status === 'HIDDEN' ? 'Tin đã hiện lại.' : 'Đã xuất bản tin.'),
    onError: failed,
  })
  const hide = useMutation({
    mutationFn: (news: NewsDetail) => newsRepository.hide(clubId, news.id, news.version),
    meta: { silentError: true },
    onSuccess: (saved) => {
      setConfirmHide(false)
      applied(saved, 'Đã ẩn tin.')
    },
    onError: failed,
  })
  const news = detail.data ?? null
  return {
    news,
    loading: detail.isPending && newsId !== null,
    error: detail.error,
    retry: () => void detail.refetch(),
    canEdit: news?.allowedActions.includes('EDIT') ?? false,
    canPublish: news?.allowedActions.includes('PUBLISH') ?? false,
    canHide: news?.allowedActions.includes('HIDE') ?? false,
    publish: () => news && publish.mutate(news),
    publishing: publish.isPending,
    confirmHide,
    setConfirmHide,
    hide: () => news && hide.mutate(news),
    hiding: hide.isPending,
  }
}

export const newsFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(NEWS_TITLE_MIN, `Tiêu đề cần ít nhất ${NEWS_TITLE_MIN} ký tự.`)
    .max(NEWS_TITLE_MAX, `Tiêu đề tối đa ${NEWS_TITLE_MAX} ký tự.`),
  body: z
    .string()
    .trim()
    .min(NEWS_BODY_MIN, `Nội dung cần ít nhất ${NEWS_BODY_MIN} ký tự.`)
    .max(NEWS_BODY_MAX, `Nội dung tối đa ${NEWS_BODY_MAX} ký tự.`),
})
export type NewsFormValues = z.infer<typeof newsFormSchema>

/** Soạn tin mới (lưu thành Nháp) hoặc sửa tin; ảnh bìa gửi sau khi lưu chữ, dùng `version` mới nhất. */
export function useNewsEditorViewModel(open: boolean, editing: NewsDetail | null, onSaved: (saved: NewsDetail) => void) {
  const queryClient = useQueryClient()
  const { clubId } = useCurrentClub()
  const form = useForm<NewsFormValues>({ resolver: zodResolver(newsFormSchema), defaultValues: { title: '', body: '' } })
  const [image, setImage] = useState<File | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [wasOpen, setWasOpen] = useState(open)

  const mutation = useMutation({
    mutationFn: async (values: NewsFormValues) => {
      const saved = editing ? await newsRepository.update(clubId, editing.id, { ...values, version: editing.version }) : await newsRepository.create(clubId, values)
      return image ? newsRepository.uploadImage(clubId, saved.id, image) : saved
    },
    meta: { silentError: true },
    onSuccess: (saved) => {
      queryClient.setQueryData(newsQueryKeys.detail(clubId, saved.id), saved)
      void queryClient.invalidateQueries({ queryKey: newsQueryKeys.all(clubId) })
      toast.success(editing ? 'Đã lưu thay đổi.' : 'Đã lưu tin nháp.')
      onSaved(saved)
    },
    onError: (error) => applyServerFieldErrors(error, form.setError, ['title', 'body']),
  })

  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      form.reset({ title: editing?.title ?? '', body: editing?.body ?? '' })
      setImage(null)
      setImageError(null)
      mutation.reset()
    }
  }

  const preview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image])
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  const conflict = isConflict(mutation.error)
  return {
    form,
    editing: editing !== null,
    imageUrl: preview ?? editing?.imageUrl ?? null,
    imageError,
    pickImage: (file: File | undefined) => {
      if (!file) return
      const invalid = validateImageFile(file, 'Ảnh bìa')
      setImageError(invalid)
      if (!invalid) setImage(file)
    },
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    conflict,
    reload: () => {
      mutation.reset()
      void queryClient.invalidateQueries({ queryKey: newsQueryKeys.all(clubId) })
      onSaved(editing as NewsDetail)
    },
    errorMessage: mutation.error && !conflict ? getErrorMessage(mutation.error) : null,
  }
}
