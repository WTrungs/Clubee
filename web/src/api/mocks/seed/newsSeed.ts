import type { NewsStatus } from '@/features/news/model/newsTypes'
import { vnDayAt } from '../mockTime'

/** Tin tức CLB (FR-CLB-06, ST-NEWS); nội dung là chữ thuần, ảnh bìa lưu dạng data URL như logo. */
export interface DbNews {
  id: string
  clubId: string
  title: string
  body: string
  imageUrl: string | null
  status: NewsStatus
  createdBy: string
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  hiddenAt: string | null
  hiddenBy: string | null
  version: number
}

export function createNewsSeed(): DbNews[] {
  const news = (spec: Pick<DbNews, 'id' | 'title' | 'body' | 'status'> & { daysAgo: number }): DbNews => {
    const at = vnDayAt(-spec.daysAgo, 9)
    return {
      id: spec.id,
      clubId: 'c-guitar',
      title: spec.title,
      body: spec.body,
      imageUrl: null,
      status: spec.status,
      createdBy: 'u-anh',
      createdAt: at,
      updatedAt: at,
      publishedAt: spec.status === 'DRAFT' ? null : at,
      hiddenAt: spec.status === 'HIDDEN' ? vnDayAt(-spec.daysAgo + 1, 9) : null,
      hiddenBy: spec.status === 'HIDDEN' ? 'u-anh' : null,
      version: 1,
    }
  }
  return [
    news({
      id: 'news-winter-show',
      title: 'Đêm nhạc Mùa đông mở đăng ký',
      body: 'Đêm nhạc Mùa đông diễn ra tối 05/12 tại Hội trường A.\nCLB mời các bạn sinh viên đến nghe 12 tiết mục guitar đệm hát và độc tấu.\nVào cửa tự do, đăng ký trước để giữ chỗ.',
      status: 'PUBLISHED',
      daysAgo: 3,
    }),
    news({
      id: 'news-workshop',
      title: 'Workshop đệm hát cơ bản cho tân sinh viên',
      body: 'Buổi workshop hướng dẫn 4 hợp âm cơ bản và cách đệm hát một bài hoàn chỉnh trong 90 phút.\nCLB cho mượn đàn, bạn chỉ cần mang theo tinh thần học hỏi.',
      status: 'PUBLISHED',
      daysAgo: 10,
    }),
    news({
      id: 'news-recap-draft',
      title: 'Nhìn lại học kỳ 1 cùng CLB Guitar',
      body: 'Bản nháp tổng kết: số buổi sinh hoạt, các sự kiện đã tổ chức và những gương mặt nổi bật của học kỳ.',
      status: 'DRAFT',
      daysAgo: 1,
    }),
    news({
      id: 'news-old-hidden',
      title: 'Thông báo đổi phòng tập tháng 9',
      body: 'Từ tháng 9, CLB chuyển phòng tập sang phòng B2.04. Thông báo này đã cũ nên được ẩn.',
      status: 'HIDDEN',
      daysAgo: 70,
    }),
  ]
}
