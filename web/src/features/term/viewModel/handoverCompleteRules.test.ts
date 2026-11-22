import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { isBoardMember, isPositionEffective, positionHolderOf } from '@/api/mocks/mockPermissions'
import { vnDate } from '@/api/mocks/mockTime'
import { clubRepository } from '@/features/club/model/clubRepository'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { orgRepository } from '@/features/org/model/orgRepository'
import { signInAs } from '@/testUtils'
import type { AppointmentRequest, Handover, ItemConfirmationRequest } from '../model/handoverTypes'
import { termRepository } from '../model/termRepository'
import type { DepartmentPlanEntryRequest } from '../model/termTypes'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const NEXT = 'Nhiệm kỳ 2027–2028'
const membership = (userId: string) => {
  const found = db.memberships.find((candidate) => candidate.userId === userId && candidate.clubId === 'c-guitar')
  if (!found) throw new Error(`Thiếu tư cách seed của ${userId}`)
  return found
}
/** Chức vụ từ nhiệm kỳ đang chạy trở đi; bỏ chức vụ của nhiệm kỳ đã đóng trong seed. */
const standing = (userId: string, role: string) =>
  db.positions.filter((position) => position.userId === userId && position.role === role && position.clubId === 'c-guitar' && (position.endOn === null || position.endOn >= vnDate(-64)))

const BOARD: AppointmentRequest[] = [
  { role: 'PRESIDENT', departmentId: null, userId: 'u-linh' },
  { role: 'TREASURER', departmentId: null, userId: 'u-mai' },
  { role: 'DEPARTMENT_HEAD', departmentId: 'd-media', userId: 'u-vy' },
]

/** Ban chủ nhiệm u-anh khai báo nhiệm kỳ mới (đổi tên Truyền thông, thêm ban Sự kiện, bỏ ban Thiết kế), bắt đầu bàn giao, ghi kết quả bầu. */
async function openHandover(appointments: AppointmentRequest[] = BOARD): Promise<Handover> {
  // Ban Thiết kế chỉ có một người; chuyển người đó sang ban khác để bỏ được ban (BR-MEM-06).
  membership('u-hieu').departmentId = 'd-music'
  signInAs('u-anh')
  const created = await termRepository.create('c-guitar', { name: NEXT, startOn: vnDate(301), endOn: vnDate(665) })
  const plan: DepartmentPlanEntryRequest[] = (created.departmentPlan ?? []).map((entry) => ({
    id: entry.id,
    departmentId: entry.departmentId,
    name: entry.departmentId === 'd-media' ? 'Truyền thông số' : entry.name,
    description: entry.description,
    dropped: entry.departmentId === 'd-design',
  }))
  plan.push({ id: null, departmentId: null, name: 'Sự kiện', description: 'Tổ chức các đêm nhạc lớn.', dropped: false })
  const next = await termRepository.update('c-guitar', created.id, { departmentPlan: plan, version: created.version })
  const started = await termRepository.startHandover('c-guitar', { fromTermId: 't-guitar-2026', toTermId: next.id })
  return termRepository.saveAppointments('c-guitar', started.id, { appointments, version: started.version })
}

/** Chủ nhiệm mới xác nhận mọi mục; thay Trưởng BTC Livestream bằng u-tram, giữ các sự kiện khác. */
async function confirmEverything(handoverId: string) {
  signInAs('u-linh')
  const items = (await termRepository.items('c-guitar', handoverId, { status: 'PENDING', size: 200 })).content
  const requests: ItemConfirmationRequest[] = items.map((item) => ({
    itemId: item.id,
    version: item.version,
    ...(item.event?.needsLeadDecision
      ? { eventLead: item.title === db.events.find((event) => event.id === 'e-livestream')?.name ? { action: 'REPLACE' as const, userId: 'u-tram' } : { action: 'KEEP' as const } }
      : {}),
  }))
  return termRepository.confirmItems('c-guitar', handoverId, { items: requests })
}

const complete = (handover: Pick<Handover, 'id' | 'version'>) => termRepository.complete('c-guitar', handover.id, { action: 'COMPLETE', version: handover.version })

describe('completing the handover: guards (FR-TERM-06, BR-TERM-03)', () => {
  it('refuses with every blocking reason and changes nothing', async () => {
    const handover = await openHandover([])
    signInAs('u-anh')
    const blocked = await fail(complete(handover))
    expect(blocked).toMatchObject({ status: 422, code: 'HANDOVER_BLOCKED' })
    const reasons = blocked?.fieldErrors.map((fieldError) => fieldError.message) ?? []
    expect(reasons).toContain('Chưa có Chủ nhiệm đủ điều kiện cho nhiệm kỳ mới.')
    expect(reasons.some((reason) => /^Còn \d+ mục bàn giao chờ/.test(reason))).toBe(true)
    expect(db.terms.find((term) => term.id === 't-guitar-2026')?.status).toBe('HANDING_OVER')
    expect(isBoardMember('u-anh', 'c-guitar')).toBe(true)
  })

  it('blocks on an ineligible appointee, a dropped department that still has members and a past end date', async () => {
    const handover = await openHandover()
    const confirmed = await confirmEverything(handover.id)
    membership('u-vy').status = 'ON_LEAVE'
    membership('u-hieu').departmentId = 'd-design'
    const toTerm = db.terms.find((term) => term.id === handover.toTerm.id)
    if (toTerm) toTerm.endOn = vnDate(0)
    signInAs('u-anh')
    const reasons = (await fail(complete(confirmed)))?.fieldErrors.map((fieldError) => fieldError.message) ?? []
    expect(reasons).toEqual(
      expect.arrayContaining([
        'Trưởng ban Truyền thông số (Hoàng Thảo Vy): Hoàng Thảo Vy không còn là thành viên Chính thức.',
        expect.stringMatching(/^Ban Thiết kế còn 1 thành viên/),
        `Ngày kết thúc của ${NEXT} phải sau hôm nay; sửa ở trang Nhiệm kỳ.`,
      ]),
    )
  })

  it('blocks when a department declared during the handover takes the name of a new department in the plan', async () => {
    const handover = await openHandover()
    const confirmed = await confirmEverything(handover.id)
    signInAs('u-anh')
    await orgRepository.createDepartment('c-guitar', { name: 'Sự kiện', description: 'Khai báo ở Cơ cấu trong lúc bàn giao.' })
    const blocked = await fail(complete(confirmed))
    expect(blocked?.fieldErrors.map((fieldError) => fieldError.message)).toContain('Kế hoạch ban có nhiều ban tên Sự kiện; đổi tên một trong các ban ở trang Nhiệm kỳ.')
    expect(db.terms.find((term) => term.id === 't-guitar-2026')?.status).toBe('HANDING_OVER')
    expect(db.departments.filter((department) => department.clubId === 'c-guitar' && department.name === 'Sự kiện')).toHaveLength(1)
  })

  it('blocks when a kept department is renamed in the plan to a name taken at Cơ cấu meanwhile', async () => {
    const handover = await openHandover()
    const confirmed = await confirmEverything(handover.id)
    signInAs('u-anh')
    const logistics = db.departments.find((department) => department.id === 'd-logistics')
    if (!logistics) throw new Error('Thiếu ban seed')
    await orgRepository.updateDepartment('c-guitar', 'd-logistics', { name: 'Truyền thông số', description: logistics.description, version: logistics.version })
    const blocked = await fail(complete(confirmed))
    expect(blocked?.fieldErrors.map((fieldError) => fieldError.message)).toContain('Kế hoạch ban có nhiều ban tên Truyền thông số; đổi tên một trong các ban ở trang Nhiệm kỳ.')
    expect(db.departments.find((department) => department.id === 'd-media')?.name).toBe('Truyền thông')
  })

  it('lets only the current board complete, with the version it saw (NFR-REL-03)', async () => {
    const handover = await openHandover()
    const confirmed = await confirmEverything(handover.id)
    for (const outsider of ['u-linh', 'u-ha']) {
      signInAs(outsider)
      expect((await fail(complete(confirmed)))?.status).toBe(403)
    }
    signInAs('u-mai')
    expect(await fail(complete(handover))).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' })
    expect(await fail(termRepository.complete('c-guitar', handover.id, { action: 'NOPE' as 'COMPLETE', version: confirmed.version }))).toMatchObject({ status: 400 })
  })

  it('previews what will change before completing', async () => {
    const handover = await openHandover()
    const confirmed = await confirmEverything(handover.id)
    expect(confirmed.blockers).toEqual([])
    expect(confirmed.completionPreview).toMatchObject({
      grantedPositionCount: 3,
      closingDepartments: ['Thiết kế'],
      newDepartments: ['Sự kiện'],
      renamedDepartments: [{ from: 'Truyền thông', to: 'Truyền thông số' }],
      leadReplacements: [{ from: { id: 'u-kiet' }, to: { id: 'u-tram' } }],
      fromTermEndOn: vnDate(-1),
      toTermStartOn: vnDate(0),
    })
    expect(confirmed.completionPreview?.endingPositionCount).toBe(db.positions.filter((position) => position.clubId === 'c-guitar' && ['PRESIDENT', 'VICE_PRESIDENT', 'TREASURER', 'DEPARTMENT_HEAD', 'DEPARTMENT_VICE_HEAD'].includes(position.role) && isPositionEffective(position)).length)
    signInAs('u-mai')
    expect((await termRepository.handover('c-guitar', handover.id)).allowedActions).toEqual(['EDIT_APPOINTMENTS', 'CONFIRM', 'COMPLETE'])
  })
})

describe('completing the handover: effects (FR-TERM-06, BR-TERM-02, BR-TERM-04, BR-ORG-03)', () => {
  it('closes the old term, starts the new one and moves every standing position over', async () => {
    const handover = await openHandover()
    const confirmed = await confirmEverything(handover.id)
    signInAs('u-mai')
    const done = await complete(confirmed)
    expect(done).toMatchObject({ status: 'COMPLETED', completedBy: { id: 'u-mai' }, allowedActions: [], completionPreview: null, blockers: [] })

    const oldTerm = db.terms.find((term) => term.id === 't-guitar-2026')
    expect(oldTerm).toMatchObject({ status: 'CLOSED', endOn: vnDate(-1), departmentPlan: null })
    expect(oldTerm?.closedDepartments).toEqual(expect.arrayContaining([{ id: 'd-media', name: 'Truyền thông' }, { id: 'd-design', name: 'Thiết kế' }]))
    expect(db.terms.find((term) => term.id === handover.toTerm.id)).toMatchObject({ status: 'RUNNING', startOn: vnDate(0), departmentPlan: null })

    // Chức cũ kết thúc hôm qua, kể cả của người tái đắc cử; chức mới có hiệu lực từ hôm nay.
    expect(standing('u-anh', 'PRESIDENT')[0]).toMatchObject({ endOn: vnDate(-1), revokeReason: 'Kết thúc Nhiệm kỳ 2026–2027' })
    const treasurer = standing('u-mai', 'TREASURER')
    expect(treasurer).toHaveLength(2)
    expect(treasurer.filter((position) => isPositionEffective(position))).toEqual([expect.objectContaining({ startOn: vnDate(0), endOn: vnDate(665) })])
    expect(['u-anh', 'u-huy'].map((userId) => isBoardMember(userId, 'c-guitar'))).toEqual([false, false])
    expect(['u-linh', 'u-mai'].map((userId) => isBoardMember(userId, 'c-guitar'))).toEqual([true, true])
    expect(positionHolderOf('DEPARTMENT_HEAD', 'd-media')).toBe('u-vy')
    expect(positionHolderOf('DEPARTMENT_HEAD', 'd-logistics')).toBeNull()

    const media = db.departments.find((department) => department.id === 'd-media')
    expect(media).toMatchObject({ name: 'Truyền thông số', status: 'ACTIVE', termId: 't-guitar-2025' })
    expect(db.departments.find((department) => department.id === 'd-design')).toMatchObject({ status: 'CLOSED', closedOn: vnDate(0) })
    expect(db.departments.find((department) => department.name === 'Sự kiện')).toMatchObject({ status: 'ACTIVE', termId: handover.toTerm.id })

    expect(positionHolderOf('EVENT_LEAD', 'e-livestream')).toBe('u-tram')
    expect(positionHolderOf('EVENT_LEAD', 'e-winter')).toBe('u-bao')
  })

  it('notifies members, new position holders and both event leads, and lets the new board plan the next term', async () => {
    const handover = await openHandover()
    const confirmed = await confirmEverything(handover.id)
    signInAs('u-mai')
    await complete(confirmed)

    signInAs('u-ha')
    expect((await notificationRepository.list({ category: 'TERM' })).content[0]).toMatchObject({ title: `${NEXT} bắt đầu`, target: { type: 'TERM' } })
    signInAs('u-vy')
    expect((await notificationRepository.list({ category: 'POSITION' })).content[0]?.title).toBe(`Bạn nhận chức Trưởng ban Truyền thông số ${NEXT}`)
    signInAs('u-kiet')
    expect((await notificationRepository.list({ category: 'EVENT' })).content[0]?.title).toMatch(/^Bạn thôi làm Trưởng BTC /)
    signInAs('u-tram')
    expect((await notificationRepository.list({ category: 'EVENT' })).content[0]?.title).toMatch(/^Bạn được chọn làm Trưởng BTC /)

    signInAs('u-anh')
    expect((await clubRepository.getClub('c-guitar')).allowedActions).not.toContain('CREATE_TERM')
    signInAs('u-linh')
    const club = await clubRepository.getClub('c-guitar')
    expect(club.currentTerm).toMatchObject({ id: handover.toTerm.id, status: 'RUNNING' })
    expect(club.allowedActions).toContain('CREATE_TERM')
    await expect(termRepository.create('c-guitar', { name: 'Nhiệm kỳ 2028–2029', startOn: vnDate(666), endOn: vnDate(1030) })).resolves.toMatchObject({ status: 'PREPARING' })
  })

  it('also ends positions kept past an overdue end date (BR-TERM-02)', async () => {
    const term = db.terms.find((candidate) => candidate.id === 't-guitar-2026')
    if (!term) throw new Error('Thiếu nhiệm kỳ seed')
    const oldEnd = term.endOn
    // Quá hạn 10 ngày, để phân biệt chức vụ được giữ tới khi bàn giao xong với chức vụ giữ hạn cũ.
    term.endOn = vnDate(-10)
    for (const position of db.positions) if (position.clubId === 'c-guitar' && position.endOn === oldEnd) position.endOn = vnDate(-10)
    expect(isBoardMember('u-anh', 'c-guitar')).toBe(true)

    const handover = await openHandover()
    const confirmed = await confirmEverything(handover.id)
    signInAs('u-anh')
    await complete(confirmed)
    expect(isBoardMember('u-anh', 'c-guitar')).toBe(false)
    expect(standing('u-anh', 'PRESIDENT')[0]?.endOn).toBe(vnDate(-1))
    expect(term).toMatchObject({ status: 'CLOSED', endOn: vnDate(-1) })
    expect(isBoardMember('u-linh', 'c-guitar')).toBe(true)
  })
})
