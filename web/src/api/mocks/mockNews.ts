import type { NewsAction, NewsDetail, NewsSummary } from '@/features/news/model/newsTypes'
import { newsExcerpt } from '@/shared/lib/newsRules'
import { db, type DbNews } from './db'
import { personRef } from './mockMembers'
import { isBoardMember } from './mockPermissions'

/** Ban chủ nhiệm soạn, xuất bản, ẩn tin (FR-CLB-06); tin nháp và tin đã ẩn chỉ ban chủ nhiệm xem. */
export const managesNews = (userId: string, clubId: string) => isBoardMember(userId, clubId)

export const newsDate = (news: DbNews) => news.publishedAt ?? news.updatedAt

/** Mới nhất trước: tin đã xuất bản theo lúc xuất bản, nháp theo lúc sửa. */
export const byNewest = (a: DbNews, b: DbNews) => newsDate(b).localeCompare(newsDate(a))

export const publishedNewsOf = (clubId: string) => db.news.filter((news) => news.clubId === clubId && news.status === 'PUBLISHED').toSorted(byNewest)

export function toNewsSummary(news: DbNews): NewsSummary {
  return {
    id: news.id,
    title: news.title,
    excerpt: newsExcerpt(news.body),
    imageUrl: news.imageUrl,
    status: news.status,
    author: personRef(news.createdBy),
    publishedAt: news.publishedAt,
    updatedAt: news.updatedAt,
  }
}

function newsActions(news: DbNews, viewerId: string | null): NewsAction[] {
  if (!viewerId || !managesNews(viewerId, news.clubId)) return []
  return ['EDIT', ...(news.status === 'PUBLISHED' ? (['HIDE'] as const) : (['PUBLISH'] as const))]
}

/** `viewerId` null: khách trên trang công khai, không có thao tác. */
export function toNewsDetail(news: DbNews, viewerId: string | null): NewsDetail {
  return {
    ...toNewsSummary(news),
    body: news.body,
    createdAt: news.createdAt,
    hiddenAt: news.hiddenAt,
    hiddenBy: news.hiddenBy ? personRef(news.hiddenBy) : null,
    allowedActions: newsActions(news, viewerId),
    version: news.version,
  }
}
