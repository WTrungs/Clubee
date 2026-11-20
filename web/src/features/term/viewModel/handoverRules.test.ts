import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { grantPosition, isBoardMember } from '@/api/mocks/mockPermissions'
import { vnDate } from '@/api/mocks/mockTime'
import { clubRepository } from '@/features/club/model/clubRepository'
import { eventRepository } from '@/features/event/model/eventRepository'
import { memberRepository } from '@/features/member/model/memberRepository'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { orgRepository } from '@/features/org/model/orgRepository'
import { signInAs } from '@/testUtils'
import type { AppointmentRequest, Handover } from '../model/handoverTypes'
import { termRepository } from '../model/termRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const fields = (error: ApiError | null) => error?.fieldErrors.map((fieldError) => fieldError.field)
const membershipId = (userId: string) => `m-guitar-${userId.slice(2)}`
const versionOf = (id: string) => db.memberships.find((membership) => membership.id === id)?.version ?? 0
const president = (userId: string): AppointmentRequest => ({ role: 'PRESIDENT', departmentId: null, userId })

/** Ban chủ nhiệm u-anh khai báo nhiệm kỳ mới rồi bắt đầu bàn giao; người gọi có thể là thành viên ban chủ nhiệm khác. */
async function startHandover(starter = 'u-anh'): Promise<Handover> {
  signInAs('u-anh')
  const next = await termRepository.create('c-guitar', { name: 'Nhiệm kỳ 2027–2028', startOn: vnDate(301), endOn: vnDate(665) })
  signInAs(starter)
  return termRepository.startHandover('c-guitar', { fromTermId: 't-guitar-2026', toTermId: next.id })
}

/** Đẩy nhiệm kỳ đang chạy và chức vụ thường trực của nó sang quá hạn từ hôm qua. */
function makeTermOverdue() {
  const term = db.terms.find((candidate) => candidate.id === 't-guitar-2026')
  if (!term) throw new Error('Thiếu nhiệm kỳ seed')
  const oldEnd = term.endOn
  term.endOn = vnDate(-1)
  for (const position of db.positions) if (position.clubId === 'c-guitar' && position.endOn === oldEnd) position.endOn = vnDate(-1)
}

describe('starting a handover (FR-TERM-03, ST-TERM)', () => {
  it('lets the treasurer start it: the running term moves to handing over and the new term stays preparing', async () => {
    const handover = await startHandover('u-mai')
    expect(handover).toMatchObject({ status: 'OPEN', fromTerm: { id: 't-guitar-2026', status: 'HANDING_OVER' }, toTerm: { status: 'PREPARING' }, startedBy: { id: 'u-mai' } })
    expect(handover.allowedActions).toEqual(['EDIT_APPOINTMENTS', 'COMPLETE'])
    expect(handover.blockers).toContain('Chưa có Chủ nhiệm đủ điều kiện cho nhiệm kỳ mới.')

    const club = await clubRepository.getClub('c-guitar')
    expect(club.currentTerm).toMatchObject({ id: 't-guitar-2026', status: 'HANDING_OVER' })
    expect(club.allowedActions).not.toContain('CREATE_TERM')
    const terms = await termRepository.list('c-guitar')
    expect(terms.filter((term) => term.status !== 'CLOSED').every((term) => term.handoverId === handover.id)).toBe(true)
    expect(terms.find((term) => term.status === 'PREPARING')?.allowedActions).toEqual(['EDIT', 'VIEW_HANDOVER'])
  })

  it('answers 409 to a second start and 422 without a preparing term', async () => {
    signInAs('u-anh')
    const missing = await fail(termRepository.startHandover('c-guitar', { fromTermId: 't-guitar-2026', toTermId: 'nothing' }))
    expect(missing).toMatchObject({ status: 422, code: 'NO_PREPARING_TERM' })

    const handover = await startHandover()
    const again = await fail(termRepository.startHandover('c-guitar', { fromTermId: handover.fromTerm.id, toTermId: handover.toTerm.id }))
    expect(again).toMatchObject({ status: 409, code: 'HANDOVER_EXISTS' })
    expect(db.handovers).toHaveLength(1)
  })

  it('refuses members outside the board and keeps the handover private to the old and new board (NFR-SEC-03)', async () => {
    signInAs('u-anh')
    const next = await termRepository.create('c-guitar', { name: 'Nhiệm kỳ 2027–2028', startOn: vnDate(301), endOn: vnDate(665) })
    signInAs('u-ha')
    expect((await fail(termRepository.startHandover('c-guitar', { fromTermId: 't-guitar-2026', toTermId: next.id })))?.status).toBe(403)
    expect(db.terms.find((term) => term.id === 't-guitar-2026')?.status).toBe('RUNNING')

    signInAs('u-anh')
    const handover = await termRepository.startHandover('c-guitar', { fromTermId: 't-guitar-2026', toTermId: next.id })
    signInAs('u-ha')
    expect((await fail(termRepository.handover('c-guitar', handover.id)))?.status).toBe(403)
    expect((await termRepository.list('c-guitar')).every((term) => !term.allowedActions.includes('VIEW_HANDOVER'))).toBe(true)
  })
})

describe('election results (FR-TERM-03, BR-ORG-01, FR-NOT-02)', () => {
  it('saves a new board and department heads, and tells new board members to confirm the handover', async () => {
    const handover = await startHandover()
    const saved = await termRepository.saveAppointments('c-guitar', handover.id, {
      appointments: [president('u-linh'), { role: 'TREASURER', departmentId: null, userId: 'u-mai' }, { role: 'DEPARTMENT_HEAD', departmentId: 'd-media', userId: 'u-vy' }],
      version: handover.version,
    })
    expect(saved.version).toBe(2)
    // Kết quả bầu đã đủ; chỉ còn danh mục bàn giao chưa ai xác nhận (BR-TERM-03).
    expect(saved.blockers).toEqual([expect.stringMatching(/^Còn \d+ mục bàn giao chờ ban chủ nhiệm mới xác nhận\.$/)])
    expect(saved.appointments.map((appointment) => [appointment.role, appointment.person.id, appointment.eligible])).toEqual([
      ['PRESIDENT', 'u-linh', true],
      ['TREASURER', 'u-mai', true],
      ['DEPARTMENT_HEAD', 'u-vy', true],
    ])
    // Kết quả bầu chưa thành chức vụ (BR-TERM-02).
    expect(isBoardMember('u-linh', 'c-guitar')).toBe(false)

    signInAs('u-linh')
    const inbox = await notificationRepository.list({ category: 'TERM' })
    expect(inbox.content[0]).toMatchObject({ title: 'Bạn được bầu làm Chủ nhiệm Nhiệm kỳ 2027–2028, cần xác nhận bàn giao', target: { type: 'HANDOVER', id: handover.id } })
    // Người được bầu vào ban chủ nhiệm xem được phiên bàn giao, xác nhận mục và xem ứng viên Trưởng BTC (FR-TERM-05).
    expect((await termRepository.handover('c-guitar', handover.id)).allowedActions).toEqual(['CONFIRM'])
    expect((await eventRepository.leadCandidates('c-guitar')).length).toBeGreaterThan(0)
    signInAs('u-vy')
    expect((await notificationRepository.list({ category: 'TERM' })).content).toHaveLength(0)
    expect((await fail(termRepository.handover('c-guitar', handover.id)))?.status).toBe(403)
  })

  it('refuses people who cannot hold the role, field by field', async () => {
    const handover = await startHandover()
    const error = await fail(
      termRepository.saveAppointments('c-guitar', handover.id, {
        appointments: [
          president('u-tram'),
          { role: 'DEPARTMENT_HEAD', departmentId: 'd-media', userId: 'u-mai' },
          { role: 'DEPARTMENT_HEAD', departmentId: 'd-photo', userId: 'u-linh' },
          president('u-linh'),
          president('u-linh'),
        ],
        version: handover.version,
      }),
    )
    expect(fields(error)).toEqual(['appointments[0].userId', 'appointments[1].userId', 'appointments[2].departmentId', 'appointments[4].userId'])
    expect(db.handovers[0]?.appointments).toEqual([])
  })

  it('does not let a department dropped from the plan get a head', async () => {
    signInAs('u-anh')
    const empty = await orgRepository.createDepartment('c-guitar', { name: 'Kỷ yếu', description: '' })
    const handover = await startHandover()
    const term = (await termRepository.list('c-guitar')).find((candidate) => candidate.id === handover.toTerm.id)
    await termRepository.update('c-guitar', handover.toTerm.id, {
      departmentPlan: (term?.departmentPlan ?? []).map((entry) => ({ id: entry.id, departmentId: entry.departmentId, name: entry.name, description: entry.description, dropped: entry.departmentId === empty.id })),
      version: term?.version ?? 0,
    })
    const fresh = await termRepository.handover('c-guitar', handover.id)
    expect(fresh.departmentOptions.map((option) => option.id)).not.toContain(empty.id)
  })

  it('answers 409 to a stale version and 403 to members outside the board', async () => {
    const handover = await startHandover()
    await termRepository.saveAppointments('c-guitar', handover.id, { appointments: [president('u-linh')], version: handover.version })
    const stale = await fail(termRepository.saveAppointments('c-guitar', handover.id, { appointments: [], version: handover.version }))
    expect(stale).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' })
    signInAs('u-linh')
    expect((await fail(termRepository.saveAppointments('c-guitar', handover.id, { appointments: [], version: 2 })))?.status).toBe(403)
    expect(db.handovers[0]?.appointments).toHaveLength(1)
  })

  it('flags an appointee who was removed from the club, and blocks putting an appointee on leave', async () => {
    const handover = await startHandover()
    await termRepository.saveAppointments('c-guitar', handover.id, {
      appointments: [president('u-linh'), { role: 'DEPARTMENT_HEAD', departmentId: 'd-logistics', userId: 'u-khoa' }],
      version: handover.version,
    })
    expect((await memberRepository.get('c-guitar', membershipId('u-khoa'))).allowedActions).not.toContain('PUT_ON_LEAVE')
    const leave = await fail(memberRepository.transition('c-guitar', membershipId('u-khoa'), { action: 'PUT_ON_LEAVE', reason: 'Bận thực tập.', version: versionOf(membershipId('u-khoa')) }))
    expect(leave).toMatchObject({ status: 422, code: 'HANDOVER_APPOINTEE' })

    await memberRepository.transition('c-guitar', membershipId('u-khoa'), { action: 'REMOVE', reason: 'Vắng nhiều buổi liên tiếp.', version: versionOf(membershipId('u-khoa')) })
    const fresh = await termRepository.handover('c-guitar', handover.id)
    expect(fresh.appointments.find((appointment) => appointment.person.id === 'u-khoa')).toMatchObject({ eligible: false })
    expect(fresh.blockers.some((blocker) => blocker.startsWith('Trưởng ban Hậu cần ('))).toBe(true)
  })
})

describe('rights while handing over or overdue (BR-TERM-02, BR-ORG-02)', () => {
  it('stops new standing positions during a handover but still allows revoking', async () => {
    const handover = await startHandover()
    const club = await clubRepository.getClub('c-guitar')
    expect(club.allowedActions).toContain('MANAGE_ORG')
    expect(club.allowedActions).not.toContain('ASSIGN_POSITION')
    expect((await orgRepository.departments('c-guitar', 'ACTIVE')).every((department) => !department.allowedActions.includes('ASSIGN_POSITION'))).toBe(true)
    expect((await memberRepository.get('c-guitar', membershipId('u-hieu'))).allowedActions).not.toContain('ASSIGN_POSITION')

    const assign = await fail(orgRepository.assign('c-guitar', { userId: 'u-hieu', role: 'DEPARTMENT_HEAD', scopeId: 'd-design', startOn: vnDate(0), endOn: handover.fromTerm.endOn }))
    expect(assign).toMatchObject({ status: 422, code: 'HANDOVER_IN_PROGRESS' })
    const media = db.positions.find((position) => position.userId === 'u-linh' && position.role === 'DEPARTMENT_HEAD')
    await orgRepository.revoke('c-guitar', media?.id ?? '', { reason: 'Chuyển sang làm Chủ nhiệm.', handoverOn: vnDate(0), version: media?.version ?? 0 })
    // Tạo ban vẫn được trong lúc bàn giao.
    expect((await orgRepository.createDepartment('c-guitar', { name: 'Kỷ yếu', description: '' })).name).toBe('Kỷ yếu')
  })

  it('keeps the old board in charge after the end date while the handover is open', async () => {
    await startHandover()
    makeTermOverdue()
    expect(isBoardMember('u-anh', 'c-guitar')).toBe(true)
    const board = await orgRepository.positions('c-guitar', { scopeId: 'c-guitar' })
    expect(board.content.find((position) => position.holder.id === 'u-anh')).toMatchObject({ endOn: vnDate(-1), untilHandover: true, allowedActions: ['REVOKE'] })

    const anh = db.positions.find((position) => position.userId === 'u-anh' && position.role === 'PRESIDENT')
    const last = await fail(orgRepository.revoke('c-guitar', anh?.id ?? '', { reason: 'Thử thu hồi Chủ nhiệm cuối.', handoverOn: vnDate(0), version: anh?.version ?? 0 }))
    expect(last).toMatchObject({ status: 422, code: 'LAST_PRESIDENT' })

    const mai = db.positions.find((position) => position.userId === 'u-mai' && position.role === 'TREASURER')
    await orgRepository.revoke('c-guitar', mai?.id ?? '', { reason: 'Thôi giữ chức Thủ quỹ.', handoverOn: vnDate(1), version: mai?.version ?? 0 })
    expect(mai?.endOn).toBe(vnDate(0))
    expect(isBoardMember('u-mai', 'c-guitar')).toBe(true)
  })

  it('never leaves the club without a president after the end date, whatever handover date is picked (BR-ORG-02)', async () => {
    await startHandover()
    makeTermOverdue()
    const anh = db.positions.find((position) => position.userId === 'u-anh' && position.role === 'PRESIDENT')
    for (const handoverOn of [vnDate(1), vnDate(30)]) {
      const error = await fail(orgRepository.revoke('c-guitar', anh?.id ?? '', { reason: 'Thử thu hồi Chủ nhiệm cuối.', handoverOn, version: anh?.version ?? 0 }))
      expect(error).toMatchObject({ status: 422, code: 'LAST_PRESIDENT' })
      expect(error?.detail).toContain('ghi ở kết quả bầu')
    }
    expect(anh?.revokedAt).toBeNull()
    signInAs('u-mai')
    const removal = await fail(memberRepository.transition('c-guitar', membershipId('u-anh'), { action: 'REMOVE', reason: 'Thử đưa Chủ nhiệm cuối ra.', version: versionOf(membershipId('u-anh')) }))
    expect(removal).toMatchObject({ status: 422, code: 'LAST_PRESIDENT' })
  })

  it('lets a president go after the end date when another president stays until the handover is done', async () => {
    await startHandover()
    makeTermOverdue()
    // Chủ nhiệm thứ hai hết hạn cùng nhiệm kỳ nên cũng còn hiệu lực tới khi bàn giao xong.
    grantPosition({ userId: 'u-huy', clubId: 'c-guitar', role: 'PRESIDENT', scopeId: 'c-guitar', assignedBy: 'u-anh', startOn: vnDate(-10), endOn: vnDate(-1) })
    const anh = db.positions.find((position) => position.userId === 'u-anh' && position.role === 'PRESIDENT')
    await orgRepository.revoke('c-guitar', anh?.id ?? '', { reason: 'Nhường lại cho Phó chủ nhiệm.', handoverOn: vnDate(1), version: anh?.version ?? 0 })
    expect(anh?.endOn).toBe(vnDate(0))
  })

  it('also keeps rights when the running term is overdue before any handover starts', async () => {
    signInAs('u-anh')
    makeTermOverdue()
    expect(isBoardMember('u-anh', 'c-guitar')).toBe(true)
    const actions = (await clubRepository.getClub('c-guitar')).allowedActions
    expect(actions).toContain('CREATE_TERM')
    expect(actions).not.toContain('ASSIGN_POSITION')
  })

  it('refuses new standing positions on the server too once the term is overdue (decision 14/11, NFR-SEC-03)', async () => {
    signInAs('u-anh')
    makeTermOverdue()
    expect((await orgRepository.departments('c-guitar', 'ACTIVE')).every((department) => !department.allowedActions.includes('ASSIGN_POSITION'))).toBe(true)
    expect((await memberRepository.get('c-guitar', membershipId('u-hieu'))).allowedActions).not.toContain('ASSIGN_POSITION')
    // Ngày nằm trong nhiệm kỳ (đã qua) vẫn bị chặn, để chức vụ mới không lặng lẽ thành chức vụ giữ tới khi bàn giao xong.
    const before = db.positions.length
    const error = await fail(orgRepository.assign('c-guitar', { userId: 'u-hieu', role: 'DEPARTMENT_HEAD', scopeId: 'd-design', startOn: vnDate(-1), endOn: vnDate(-1) }))
    expect(error).toMatchObject({ status: 422, code: 'TERM_OVERDUE' })
    expect(db.positions).toHaveLength(before)

    const anh = db.positions.find((position) => position.userId === 'u-anh' && position.role === 'PRESIDENT')
    const last = await fail(orgRepository.revoke('c-guitar', anh?.id ?? '', { reason: 'Thử thu hồi Chủ nhiệm cuối.', handoverOn: vnDate(1), version: anh?.version ?? 0 }))
    expect(last?.code).toBe('LAST_PRESIDENT')
    expect(last?.detail).toContain('bắt đầu bàn giao ở trang Nhiệm kỳ')
    expect(last?.detail).not.toContain('Gán Chủ nhiệm mới')
  })
})
