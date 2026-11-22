import { http, HttpResponse } from 'msw'
import type { PublicClubCard, PublicClubProfile } from '@/features/club/model/clubTypes'
import { db, type DbClub } from '../db'
import { toOpenRecruitment } from '../mockApplications'
import { publicClubInfo } from '../mockInvitations'
import { API, matchesKeyword, networkDelay, paginate, problem } from '../mockHttp'
import { recruitmentStatusOf } from '../mockRecruitments'

// FR-CLB-05, SRS 3.5: route công khai không đọc phiên, chỉ trả thông tin ai cũng được xem.

const activeClubs = () => db.clubs.filter((club) => club.status === 'ACTIVE')
const openRecruitmentsOf = (clubId: string) =>
  db.recruitments.filter((recruitment) => recruitment.clubId === clubId && recruitmentStatusOf(recruitment) === 'OPEN').toSorted((a, b) => a.closesAt.localeCompare(b.closesAt))

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
    if (!club) return problem(404, 'Không tìm thấy CLB, hoặc CLB không còn hoạt động.', 'CLUB_NOT_FOUND')
    const profile: PublicClubProfile = {
      ...toCard(club),
      openRecruitments: openRecruitmentsOf(club.id)
        .map(toOpenRecruitment)
        .map((recruitment) => ({ id: recruitment.id, name: recruitment.name, closesAt: recruitment.closesAt, departments: recruitment.departments })),
    }
    return HttpResponse.json(profile)
  }),
]
