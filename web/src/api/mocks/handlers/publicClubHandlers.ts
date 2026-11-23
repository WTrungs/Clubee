import { http, HttpResponse } from 'msw'
import type { PublicClubCard, PublicClubProfile } from '@/features/club/model/clubTypes'
import { db, type DbClub, type DbNews } from '../db'
import { toOpenRecruitment } from '../mockApplications'
import { publicClubInfo } from '../mockInvitations'
import { API, matchesKeyword, networkDelay, paginate, problem } from '../mockHttp'
import { recruitmentStatusOf } from '../mockRecruitments'
import { publishedNewsOf } from '../mockNews'
import { guestEventsOf, publicEventOf, toPublicEventDetail, toPublicEventSummary } from '../mockPublicEvents'
import type { PublicNewsDetail, PublicNewsSummary } from '@/features/news/model/newsTypes'
import { newsExcerpt } from '@/shared/lib/newsRules'

// FR-CLB-05, SRS 3.5: route công khai không đọc phiên, chỉ trả thông tin ai cũng được xem.

const activeClubs = () => db.clubs.filter((club) => club.status === 'ACTIVE')
const openRecruitmentsOf = (clubId: string) =>
  db.recruitments.filter((recruitment) => recruitment.clubId === clubId && recruitmentStatusOf(recruitment) === 'OPEN').toSorted((a, b) => a.closesAt.localeCompare(b.closesAt))

const PUBLIC_NEWS_LIMIT = 6
const clubNotFound = () => problem(404, 'Không tìm thấy CLB, hoặc CLB không còn hoạt động.', 'CLUB_NOT_FOUND')

function toPublicNews(news: DbNews): PublicNewsSummary {
  return { id: news.id, title: news.title, excerpt: newsExcerpt(news.body), imageUrl: news.imageUrl, publishedAt: news.publishedAt ?? news.updatedAt }
}

function toCard(club: DbClub): PublicClubCard {
  const info = publicClubInfo(club)
  return {
    id: info.id,
    name: info.name,
    shortName: info.shortName,
    field: info.field,
    description: info.description,
    logoUrl: info.logoUrl,
    contactEmail: info.contactEmail,
    contactPhone: info.contactPhone,
    contactUrl: info.contactUrl,
    openRecruitmentCount: openRecruitmentsOf(club.id).length,
  }
}

export const publicClubHandlers = [
  http.get(`${API}/public/clubs`, async ({ request }) => {
    await networkDelay()
    const url = new URL(request.url)
    const field = url.searchParams.get('field')
    const rows = activeClubs()
      .filter((club) => matchesKeyword(`${club.name} ${club.shortName}`, url.searchParams.get('q')))
      .filter((club) => !field || club.field === field)
      .toSorted((a, b) => a.name.localeCompare(b.name, 'vi'))
      .map(toCard)
    return HttpResponse.json(paginate(rows, url, 12))
  }),

  http.get(`${API}/public/club-fields`, async () => {
    await networkDelay()
    return HttpResponse.json([...new Set(activeClubs().map((club) => club.field))].toSorted((a, b) => a.localeCompare(b, 'vi')))
  }),

  http.get(`${API}/public/clubs/:clubId`, async ({ params }) => {
    await networkDelay()
    const club = activeClubs().find((candidate) => candidate.id === params.clubId)
    if (!club) return clubNotFound()
    const profile: PublicClubProfile = {
      ...toCard(club),
      openRecruitments: openRecruitmentsOf(club.id)
        .map(toOpenRecruitment)
        .map((recruitment) => ({ id: recruitment.id, name: recruitment.name, closesAt: recruitment.closesAt, departments: recruitment.departments })),
      news: publishedNewsOf(club.id).slice(0, PUBLIC_NEWS_LIMIT).map(toPublicNews),
      guestEvents: guestEventsOf(club.id).map(toPublicEventSummary),
    }
    return HttpResponse.json(profile)
  }),

  http.get(`${API}/public/clubs/:clubId/news`, async ({ request, params }) => {
    await networkDelay()
    const club = activeClubs().find((candidate) => candidate.id === params.clubId)
    if (!club) return clubNotFound()
    return HttpResponse.json(paginate(publishedNewsOf(club.id).map(toPublicNews), new URL(request.url), 12))
  }),

  http.get(`${API}/public/clubs/:clubId/news/:newsId`, async ({ params }) => {
    await networkDelay()
    const club = activeClubs().find((candidate) => candidate.id === params.clubId)
    if (!club) return clubNotFound()
    const news = publishedNewsOf(club.id).find((candidate) => candidate.id === params.newsId)
    if (!news) return problem(404, 'Không tìm thấy tin.', 'NEWS_NOT_FOUND')
    const detail: PublicNewsDetail = { ...toPublicNews(news), body: news.body, clubId: club.id, clubName: club.name }
    return HttpResponse.json(detail)
  }),

  http.get(`${API}/public/events/:eventId`, async ({ params }) => {
    await networkDelay()
    const event = publicEventOf(String(params.eventId))
    if (!event) return problem(404, 'Không tìm thấy sự kiện mở cho khách.', 'EVENT_NOT_FOUND')
    return HttpResponse.json(toPublicEventDetail(event))
  }),
]
