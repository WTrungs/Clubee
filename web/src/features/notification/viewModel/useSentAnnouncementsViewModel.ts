import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/apiError'
import { notificationRepository } from '../model/notificationRepository'
import type { SentAnnouncement } from '../model/notificationTypes'
import { notificationQueryKeys } from './notificationQueryKeys'

const PAGE_SIZE = 20

/** Câu số người đã đọc, ví dụ "12/30 đã đọc". */
export const readSummary = (item: Pick<SentAnnouncement, 'readCount' | 'recipientCount'>) => `${item.readCount}/${item.recipientCount} đã đọc`

/** Có tab Đã gửi không: chỉ người từng gửi thông báo mới thấy tab này. */
export function useHasSentAnnouncements() {
  const probe = useQuery({ queryKey: notificationQueryKeys.sent(0, 1), queryFn: () => notificationRepository.sentAnnouncements(0, 1) })
  return (probe.data?.totalElements ?? 0) > 0
}

/** FR-NOT-05: người gửi xem ai đã đọc, ai chưa; ghim, bỏ ghim lên đầu hộp thư người nhận. */
export function useSentAnnouncementsViewModel() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [openedId, setOpenedId] = useState<string | null>(null)
  const [readTab, setReadTab] = useState<'read' | 'unread'>('read')
  const list = useQuery({ queryKey: notificationQueryKeys.sent(page, PAGE_SIZE), queryFn: () => notificationRepository.sentAnnouncements(page, PAGE_SIZE), placeholderData: keepPreviousData })
  const opened = list.data?.content.find((item) => item.id === openedId) ?? null
  const receipts = useQuery({
    queryKey: notificationQueryKeys.receipts(openedId ?? '', readTab === 'read'),
    queryFn: () => notificationRepository.receipts(opened?.clubId ?? '', openedId ?? '', { read: readTab === 'read' }),
    enabled: opened !== null,
  })
  const pin = useMutation({
    mutationFn: (item: SentAnnouncement) => notificationRepository.pin(item.clubId, item.id, !item.pinned),
    meta: { silentError: true },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all })
      toast.success(saved.pinned ? 'Đã ghim thông báo lên đầu hộp thư người nhận.' : 'Đã bỏ ghim thông báo.')
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  return {
    items: list.data?.content ?? [],
    loading: list.isPending,
    error: list.error,
    retry: () => void list.refetch(),
    page: list.data?.page ?? 0,
    totalPages: list.data?.totalPages ?? 0,
    totalElements: list.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
    opened,
    open: (item: SentAnnouncement) => {
      setOpenedId(item.id)
      setReadTab('read')
    },
    close: () => setOpenedId(null),
    readTab,
    setReadTab: (value: string) => setReadTab(value === 'unread' ? 'unread' : 'read'),
    receipts: receipts.data?.content ?? [],
    receiptsLoading: receipts.isPending && opened !== null,
    receiptsError: receipts.error,
    togglePin: () => opened && pin.mutate(opened),
    pinning: pin.isPending,
  }
}
