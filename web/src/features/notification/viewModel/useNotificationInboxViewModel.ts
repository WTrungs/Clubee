import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useClampPage } from '@/shared/hooks/useClampPage'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { notificationRepository } from '../model/notificationRepository'
import type { NotificationCategory, NotificationQuery, NotificationSummary } from '../model/notificationTypes'
import { notificationPath, opensInSheet } from './notificationDisplay'
import { notificationQueryKeys } from './notificationQueryKeys'
import { useHasSentAnnouncements } from './useSentAnnouncementsViewModel'
import { useUnreadCount } from './useUnreadCount'

const PAGE_SIZE = 20

export type InboxTab = 'all' | 'unread' | 'sent'

/** Nội dung chỉ tải khi mở, máy chủ kiểm tra lại quyền lúc đó (BR-SEC-02). */
export function useNotificationDetail(id: string | null) {
  return useQuery({
    queryKey: notificationQueryKeys.detail(id ?? ''),
    queryFn: () => notificationRepository.get(id ?? ''),
    enabled: id !== null,
    // Không giữ nội dung trong cache: lần mở sau phải hỏi lại máy chủ, vì quyền có thể đã mất.
    staleTime: 0,
    gcTime: 0,
  })
}

/** FR-NOT-03: lọc theo loại, chỉ chưa đọc, từ khóa; phân trang (FR-RPT-01); đánh dấu đã đọc. */
export function useNotificationInboxViewModel() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  // Gửi thông báo xong có thể mở thẳng tab Đã gửi (`?tab=sent`, FR-NOT-05).
  const [tab, setTab] = useState<InboxTab>(searchParams.get('tab') === 'sent' ? 'sent' : 'all')
  const hasSent = useHasSentAnnouncements()
  const [category, setCategory] = useState<NotificationCategory | null>(null)
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 300)
  const [page, setPage] = useState(0)
  const [openedId, setOpenedId] = useState<string | null>(null)

  const query: NotificationQuery = { category: category ?? undefined, unread: tab === 'unread' || undefined, q: debouncedKeyword || undefined, page, size: PAGE_SIZE }
  const list = useQuery({ queryKey: notificationQueryKeys.list(query), queryFn: () => notificationRepository.list(query), placeholderData: keepPreviousData })
  const unread = useUnreadCount()
  useClampPage(page, list.data?.totalPages, setPage)

  const refresh = () => queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all })
  const markRead = useMutation({ mutationFn: notificationRepository.markRead, onSuccess: refresh })
  const markAll = useMutation({
    mutationFn: notificationRepository.markAllRead,
    onSuccess: async () => {
      await refresh()
      toast.success('Đã đánh dấu tất cả là đã đọc.')
    },
  })

  return {
    tab,
    hasSent,
    setTab: (value: string) => {
      setTab(value === 'unread' || value === 'sent' ? value : 'all')
      setPage(0)
    },
    category,
    toggleCategory: (value: NotificationCategory) => {
      setCategory((current) => (current === value ? null : value))
      setPage(0)
    },
    keyword,
    setKeyword: (value: string) => {
      setKeyword(value)
      setPage(0)
    },
    filtered: tab === 'unread' || category !== null || debouncedKeyword !== '',
    items: list.data?.content ?? [],
    loading: list.isPending,
    error: list.error,
    retry: () => void list.refetch(),
    page,
    setPage,
    totalPages: list.data?.totalPages ?? 0,
    totalElements: list.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    unreadCount: unread.data?.count ?? 0,
    markAllRead: () => markAll.mutate(),
    markingAll: markAll.isPending,
    /** Mở thông báo: đánh dấu đã đọc, rồi tới trang đích hoặc mở nội dung trong sheet. */
    open: (item: NotificationSummary) => {
      if (item.readAt === null) markRead.mutate(item.id)
      const path = notificationPath(item.target)
      if (opensInSheet(item) || path === null) setOpenedId(item.id)
      else void navigate(path)
    },
    openedId,
    closeDetail: () => setOpenedId(null),
  }
}
