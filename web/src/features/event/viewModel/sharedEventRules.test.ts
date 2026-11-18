import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { eventFundId } from '@/api/mocks/seed/financeSeed'
import { attendanceRepository } from '@/features/attendance/model/attendanceRepository'
import { clubRepository } from '@/features/club/model/clubRepository'
import { financeRepository } from '@/features/finance/model/financeRepository'
import { memberRepository } from '@/features/member/model/memberRepository'
import { signInAs } from '@/testUtils'
import { eventRepository } from '../model/eventRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const winterFund = eventFundId('e-winter')
const coHostRecord = () => {
  const found = db.eventCoHosts.find((coHost) => coHost.id === 'ch-winter-english')
  if (!found) throw new Error('Thiếu lời mời seed')
  return found
}

/** u-tu là Chủ nhiệm CLB Tiếng Anh, không là thành viên CLB Guitar. */
async function acceptAsTu() {
  signInAs('u-tu')
  await eventRepository.decideCoHost('c-english', 'ch-winter-english', { decision: 'ACCEPT', note: null, version: coHostRecord().version })
}

describe('co-host board viewing the shared event (FR-EVT-09, SRS 3.5)', () => {
  it('sees the event with progress, staff and fund, read only', async () => {
    await acceptAsTu()
    const event = await eventRepository.get('c-guitar', 'e-winter')
    expect(event.viewingAsCoHost).toEqual({ id: 'c-english', name: 'CLB Tiếng Anh Giao tiếp' })
    expect(event.allowedActions).toEqual(['VIEW_STAFF', 'VIEW_PROGRESS', 'VIEW_FUND'])

    const subcommittees = await eventRepository.subcommittees('c-guitar', 'e-winter')
    expect(subcommittees).toHaveLength(3)
    expect(subcommittees.every((subcommittee) => subcommittee.allowedActions.length === 0)).toBe(true)
    expect((await eventRepository.coHosts('c-guitar', 'e-winter')).every((coHost) => coHost.allowedActions.length === 0)).toBe(true)

    const progress = await eventRepository.progress('c-guitar', 'e-winter')
    expect(progress.subcommittees.map((subcommittee) => subcommittee.name)).toEqual(['Hậu cần', 'Truyền thông', 'Chương trình'])
    expect(progress.total.total).toBe(progress.subcommittees.reduce((sum, subcommittee) => sum + subcommittee.counts.total, 0))

    const fund = await financeRepository.fund('c-guitar', winterFund)
    expect(fund).toMatchObject({ allowedActions: [], pendingCount: null })
    const ledger = await financeRepository.transactions('c-guitar', { fundId: winterFund, size: 100 })
    expect(ledger.content.length).toBeGreaterThan(0)
    // Khoản chưa ghi sổ không hiện với họ.
    expect(ledger.content.every((transaction) => transaction.status === 'POSTED')).toBe(true)

    const club = await clubRepository.getClub('c-guitar')
    expect(club.viewerRole).toBe('EVENT_GUEST')
    expect((await eventRepository.list('c-guitar', {})).content.map((item) => item.id)).toEqual(['e-winter'])
  })

  it('cannot see registrations or change anything, and stays out of the rest of the host club (BR-SEC-01)', async () => {
    await acceptAsTu()
    expect((await fail(eventRepository.registrations('c-guitar', 'e-winter', {})))?.status).toBe(403)
    // Điểm danh sự kiện chỉ ban chủ nhiệm và BTC (FR-ATT-07): không xem, không điểm danh được.
    const activity = { type: 'EVENT', clubId: 'c-guitar', id: 'e-winter' } as const
    expect((await fail(attendanceRepository.sheet(activity, {})))?.status).toBe(403)
    expect((await fail(attendanceRepository.mark(activity, 'u-anh', { day: null, status: 'PRESENT', version: 0 })))?.status).toBe(403)
    expect((await fail(eventRepository.createSubcommittee('c-guitar', 'e-winter', { name: 'Lễ tân', description: '', quota: null, leadUserId: null })))?.status).toBe(403)
    const version = db.events.find((event) => event.id === 'e-winter')?.version ?? 0
    expect((await fail(eventRepository.transition('c-guitar', 'e-winter', { action: 'CANCEL', version, reason: 'Thử hủy sự kiện.' })))?.status).toBe(403)
    expect((await fail(eventRepository.inviteCoHost('c-guitar', 'e-winter', { clubId: 'c-volunteer', message: '' })))?.status).toBe(403)
    expect(
      (await fail(financeRepository.create('c-guitar', { fundId: winterFund, type: 'EXPENSE', amount: 100_000, category: 'FOOD', description: 'Nước uống', attachmentIds: [] })))?.status,
    ).toBe(403)
    expect((await fail(memberRepository.list('c-guitar', {})))?.status).toBe(403)
    expect((await fail(financeRepository.fund('c-guitar', 'fund-c-guitar')))?.status).toBeGreaterThanOrEqual(403)
  })

  it('is not open to ordinary members of the co-host club, nor after the club is removed', async () => {
    await acceptAsTu()
    signInAs('u-tam')
    expect((await fail(eventRepository.get('c-guitar', 'e-winter')))?.status).toBe(404)
    expect((await fail(eventRepository.progress('c-guitar', 'e-winter')))?.status).toBe(404)

    signInAs('u-bao')
    await eventRepository.removeCoHost('c-guitar', 'e-winter', 'ch-winter-english', { reason: 'Đổi kế hoạch chương trình.', version: coHostRecord().version })
    signInAs('u-tu')
    expect((await fail(eventRepository.get('c-guitar', 'e-winter')))?.status).toBe(404)
    expect((await fail(financeRepository.fund('c-guitar', winterFund)))?.status).toBeGreaterThanOrEqual(403)
  })

  it('shows progress to the event organisers too, but not to an ordinary host member', async () => {
    signInAs('u-long')
    expect((await eventRepository.get('c-guitar', 'e-winter')).allowedActions).toContain('VIEW_PROGRESS')
    expect((await eventRepository.progress('c-guitar', 'e-winter')).subcommittees).toHaveLength(3)
    signInAs('u-hieu')
    expect((await eventRepository.get('c-guitar', 'e-winter')).viewingAsCoHost).toBeNull()
    expect((await fail(eventRepository.progress('c-guitar', 'e-winter')))?.status).toBe(403)
  })
})
