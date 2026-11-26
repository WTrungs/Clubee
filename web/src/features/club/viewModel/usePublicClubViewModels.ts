import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSession } from '@/features/account/viewModel/useSession'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { publicClubRepository } from '../model/publicClubRepository'
import type { PublicClubQuery } from '../model/clubTypes'

export const publicClubQueryKeys = {
  list: (query: PublicClubQuery) => ['publicClubs', 'list', query] as const,
  fields: ['publicClubs', 'fields'] as const,
  detail: (clubId: string) => ['publicClubs', 'detail', clubId] as const,
  news: (clubId: string) => ['publicClubs', 'news', clubId] as const,
  newsDetail: (clubId: string, newsId: string) => ['publicClubs', 'news', clubId, newsId] as const,
}

const PAGE_SIZE = 12

/** FR-CLB-05: danh bạ CLB đang hoạt động cho mọi người, tìm theo tên và lọc theo lĩnh vực. */
export function usePublicDirectoryViewModel() {
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 300)
  const [field, setField] = useState('')
  const [page, setPage] = useState(0)
  const query: PublicClubQuery = { q: debouncedKeyword || undefined, field: field || undefined, page, size: PAGE_SIZE }
  const clubs = useQuery({ queryKey: publicClubQueryKeys.list(query), queryFn: () => publicClubRepository.list(query), placeholderData: keepPreviousData })
  const fields = useQuery({ queryKey: publicClubQueryKeys.fields, queryFn: publicClubRepository.fields, staleTime: 5 * 60_000 })
  const filtered = keyword.trim() !== '' || field !== ''

  return {
    keyword,
    setKeyword: (value: string) => {
      setKeyword(value)
      setPage(0)
    },
    field,
    setField: (value: string) => {
      setField(value)
      setPage(0)
    },
    fields: fields.data ?? [],
    filtered,
    clearFilters: () => {
      setKeyword('')
      setField('')
      setPage(0)
    },
    clubs: clubs.data?.content ?? [],
    loading: clubs.isPending,
    error: clubs.error,
    refetch: () => void clubs.refetch(),
    page: clubs.data?.page ?? 0,
    totalPages: clubs.data?.totalPages ?? 0,
    totalElements: clubs.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
  }
}

/** Trang công khai của một CLB; người đã đăng nhập được gợi ý sang trang Tìm CLB để xin gia nhập. */
export function usePublicClubViewModel(clubId: string) {
  const session = useSession()
  const club = useQuery({ queryKey: publicClubQueryKeys.detail(clubId), queryFn: () => publicClubRepository.get(clubId) })
  return {
    club: club.data ?? null,
    loading: club.isPending,
    error: club.error,
    refetch: () => void club.refetch(),
    signedIn: Boolean(session.data),
    isAdmin: session.data?.accountType === 'ADMIN',
  }
}

/** FR-CLB-07: một tin đã xuất bản và vài tin khác của CLB. */
export function usePublicNewsViewModel(clubId: string, newsId: string) {
  const news = useQuery({ queryKey: publicClubQueryKeys.newsDetail(clubId, newsId), queryFn: () => publicClubRepository.newsDetail(clubId, newsId) })
  const others = useQuery({ queryKey: publicClubQueryKeys.news(clubId), queryFn: () => publicClubRepository.news(clubId) })
  return {
    news: news.data ?? null,
    loading: news.isPending,
    error: news.error,
    refetch: () => void news.refetch(),
    others: (others.data?.content ?? []).filter((item) => item.id !== newsId).slice(0, 3),
  }
}
