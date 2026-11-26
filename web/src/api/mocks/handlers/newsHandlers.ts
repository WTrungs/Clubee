import { http, HttpResponse } from 'msw'
import type { NewsRequest, NewsStatus, UpdateNewsRequest } from '@/features/news/model/newsTypes'
import { NEWS_BODY_MAX, NEWS_BODY_MIN, NEWS_TITLE_MAX, NEWS_TITLE_MIN } from '@/shared/lib/newsRules'
import { imageContentType, validateImageFile } from '@/shared/lib/validateImageFile'
import { db, type DbNews } from '../db'
import { API, currentUser, fileToDataUrl, matchesKeyword, networkDelay, newId, paginate, problem, writer } from '../mockHttp'
import { canAccessClub } from '../mockMembers'
import { byNewest, managesNews, toNewsDetail, toNewsSummary } from '../mockNews'
import { nowIso } from '../mockTime'

const STATUSES: NewsStatus[] = ['DRAFT', 'PUBLISHED', 'HIDDEN']
const notMember = () => problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
const notManager = () => problem(403, 'Chỉ ban chủ nhiệm soạn và quản lý tin tức.', 'FORBIDDEN')
const notFound = () => problem(404, 'Không tìm thấy tin.', 'NEWS_NOT_FOUND')
const conflict = () => problem(409, 'Tin vừa được người khác sửa. Tải lại để xem bản mới nhất.', 'VERSION_CONFLICT')

function newsErrors(body: Partial<NewsRequest>) {
  const title = (body.title ?? '').trim()
  const text = (body.body ?? '').trim()
  return {
    title,
    text,
    errors: [
      ...(title.length < NEWS_TITLE_MIN || title.length > NEWS_TITLE_MAX ? [{ field: 'title', message: `Tiêu đề cần từ ${NEWS_TITLE_MIN} đến ${NEWS_TITLE_MAX} ký tự.` }] : []),
      ...(text.length < NEWS_BODY_MIN || text.length > NEWS_BODY_MAX ? [{ field: 'body', message: `Nội dung cần từ ${NEWS_BODY_MIN} đến ${NEWS_BODY_MAX} ký tự.` }] : []),
    ],
  }
}

/** Tin của CLB mà người gọi được thấy: thành viên chỉ thấy tin đã xuất bản. */
function visibleNews(userId: string, clubId: string, newsId: string): DbNews | undefined {
  const news = db.news.find((candidate) => candidate.id === newsId && candidate.clubId === clubId)
  if (!news) return undefined
  return news.status === 'PUBLISHED' || managesNews(userId, clubId) ? news : undefined
}

type Target = { ok: true; news: DbNews; userId: string } | { ok: false; response: Response }

/** Lệnh ghi lên một tin: 404 → 403 theo thứ tự quy ước. */
function managedNews(request: Request, params: Record<string, string | readonly string[] | undefined>): Target {
  const user = writer(request)
  if (!user.ok) return user
  const clubId = String(params.clubId)
  if (!canAccessClub(user.value.id, clubId)) return { ok: false, response: notMember() }
  const news = db.news.find((candidate) => candidate.id === params.newsId && candidate.clubId === clubId)
  if (!news) return { ok: false, response: notFound() }
  if (!managesNews(user.value.id, clubId)) return { ok: false, response: notManager() }
  return { ok: true, news, userId: user.value.id }
}

function changeStatus(news: DbNews, to: NewsStatus, userId: string) {
  const at = nowIso()
  Object.assign(news, {
    status: to,
    updatedAt: at,
    publishedAt: to === 'PUBLISHED' ? (news.publishedAt ?? at) : news.publishedAt,
    hiddenAt: to === 'HIDDEN' ? at : null,
    hiddenBy: to === 'HIDDEN' ? userId : null,
    version: news.version + 1,
  })
}

export const newsHandlers = [
  http.get(`${API}/clubs/:clubId/news`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const url = new URL(request.url)
    const manages = managesNews(user.value.id, clubId)
    const status = STATUSES.find((candidate) => candidate === url.searchParams.get('status'))
    const rows = db.news
      .filter((news) => news.clubId === clubId)
      .filter((news) => (manages ? !status || news.status === status : news.status === 'PUBLISHED'))
      .filter((news) => matchesKeyword(news.title, url.searchParams.get('q')))
      .toSorted(byNewest)
      .map(toNewsSummary)
    return HttpResponse.json(paginate(rows, url, 12))
  }),

  http.get(`${API}/clubs/:clubId/news/:newsId`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const news = visibleNews(user.value.id, clubId, String(params.newsId))
    if (!news) return notFound()
    return HttpResponse.json(toNewsDetail(news, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/news`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!managesNews(user.value.id, clubId)) return notManager()
    const { title, text, errors } = newsErrors((await request.json()) as Partial<NewsRequest>)
    if (errors.length > 0) return problem(400, 'Tin chưa hợp lệ.', 'VALIDATION', errors)
    const at = nowIso()
    const news: DbNews = {
      id: newId('news'),
      clubId,
      title,
      body: text,
      imageUrl: null,
      status: 'DRAFT',
      createdBy: user.value.id,
      createdAt: at,
      updatedAt: at,
      publishedAt: null,
      hiddenAt: null,
      hiddenBy: null,
      version: 1,
    }
    db.news.push(news)
    return HttpResponse.json(toNewsDetail(news, user.value.id), { status: 201 })
  }),

  http.patch(`${API}/clubs/:clubId/news/:newsId`, async ({ request, params }) => {
    await networkDelay()
    const target = managedNews(request, params)
    if (!target.ok) return target.response
    const body = (await request.json()) as Partial<UpdateNewsRequest>
    if (body.version !== target.news.version) return conflict()
    const { title, text, errors } = newsErrors(body)
    if (errors.length > 0) return problem(400, 'Tin chưa hợp lệ.', 'VALIDATION', errors)
    Object.assign(target.news, { title, body: text, updatedAt: nowIso(), version: target.news.version + 1 })
    return HttpResponse.json(toNewsDetail(target.news, target.userId))
  }),

  http.post(`${API}/clubs/:clubId/news/:newsId/image`, async ({ request, params }) => {
    await networkDelay()
    const target = managedNews(request, params)
    if (!target.ok) return target.response
    const file = (await request.formData()).get('file')
    if (!(file instanceof File)) return problem(400, 'Thiếu tệp ảnh.', 'VALIDATION')
    const invalid = validateImageFile(file, 'Ảnh bìa')
    if (invalid) return problem(400, invalid, 'INVALID_FILE')
    Object.assign(target.news, {
      imageUrl: await fileToDataUrl(file, imageContentType(file.name) ?? file.type),
      updatedAt: nowIso(),
      version: target.news.version + 1,
    })
    return HttpResponse.json(toNewsDetail(target.news, target.userId))
  }),

  http.post(`${API}/clubs/:clubId/news/:newsId/publication`, async ({ request, params }) => {
    await networkDelay()
    const target = managedNews(request, params)
    if (!target.ok) return target.response
    const body = (await request.json()) as { version?: number }
    if (body.version !== target.news.version) return conflict()
    if (target.news.status === 'PUBLISHED') return problem(422, 'Tin đã được xuất bản.', 'NEWS_ALREADY_PUBLISHED')
    changeStatus(target.news, 'PUBLISHED', target.userId)
    return HttpResponse.json(toNewsDetail(target.news, target.userId))
  }),

  http.post(`${API}/clubs/:clubId/news/:newsId/hiding`, async ({ request, params }) => {
    await networkDelay()
    const target = managedNews(request, params)
    if (!target.ok) return target.response
    const body = (await request.json()) as { version?: number }
    if (body.version !== target.news.version) return conflict()
    if (target.news.status !== 'PUBLISHED') return problem(422, 'Chỉ ẩn được tin đang xuất bản.', 'NEWS_NOT_PUBLISHED')
    changeStatus(target.news, 'HIDDEN', target.userId)
    return HttpResponse.json(toNewsDetail(target.news, target.userId))
  }),
]
