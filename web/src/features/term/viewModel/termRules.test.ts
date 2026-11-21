import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { httpClient } from '@/api/httpClient'
import { db } from '@/api/mocks/db'
import { vnDate } from '@/api/mocks/mockTime'
import { clubRepository } from '@/features/club/model/clubRepository'
import { orgRepository } from '@/features/org/model/orgRepository'
import { signInAs } from '@/testUtils'
import { termRepository } from '../model/termRepository'
import type { DepartmentPlanEntry, DepartmentPlanEntryRequest } from '../model/termTypes'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const nextTerm = (overrides: Partial<Parameters<typeof termRepository.create>[1]> = {}) => ({
  name: 'Nhiệm kỳ 2027–2028',
  startOn: vnDate(301),
  endOn: vnDate(665),
  ...overrides,
})
const fields = (error: ApiError | null) => error?.fieldErrors.map((fieldError) => fieldError.field)
const asRequest = (entry: DepartmentPlanEntry): DepartmentPlanEntryRequest => ({
  id: entry.id,
  departmentId: entry.departmentId,
  name: entry.name,
  description: entry.description,
  dropped: entry.dropped,
})

describe('declaring the next term (FR-TERM-01, BR-TERM-01, ST-TERM)', () => {
  it('creates a preparing term whose plan copies the active departments', async () => {
    signInAs('u-anh')
    const term = await termRepository.create('c-guitar', nextTerm())
    expect(term).toMatchObject({ name: 'Nhiệm kỳ 2027–2028', status: 'PREPARING', allowedActions: ['EDIT', 'START_HANDOVER'], handoverId: null, createdBy: { id: 'u-anh' }, version: 1 })
    expect(term.departmentPlan?.map((entry) => entry.departmentId).sort()).toEqual(['d-design', 'd-external', 'd-logistics', 'd-media', 'd-music'])
    expect(term.departmentPlan?.every((entry) => !entry.dropped && entry.name === entry.currentName)).toBe(true)

    const list = await termRepository.list('c-guitar')
    // Nhiệm kỳ đã đóng của seed đứng cuối.
    expect(list.map((item) => item.status)).toEqual(['PREPARING', 'RUNNING', 'CLOSED'])
    expect(list[1]).toMatchObject({ id: 't-guitar-2026', departmentPlan: null, allowedActions: ['EXTEND'] })
    // Nhiệm kỳ đang chạy không đổi cho tới khi bàn giao (BR-TERM-01).
    expect((await clubRepository.getClub('c-guitar')).currentTerm).toMatchObject({ id: 't-guitar-2026', status: 'RUNNING' })
  })

  it('allows only one preparing term per club', async () => {
    signInAs('u-anh')
    expect((await clubRepository.getClub('c-guitar')).allowedActions).toContain('CREATE_TERM')
    await termRepository.create('c-guitar', nextTerm())
    expect((await clubRepository.getClub('c-guitar')).allowedActions).not.toContain('CREATE_TERM')

    const second = await fail(termRepository.create('c-guitar', nextTerm({ name: 'Nhiệm kỳ khác' })))
    expect(second).toMatchObject({ status: 409, code: 'TERM_PREPARING_EXISTS' })
    expect(db.terms.filter((term) => term.clubId === 'c-guitar')).toHaveLength(3)
  })

  it('refuses members who are not on the board and leaves the data unchanged (NFR-SEC-03)', async () => {
    signInAs('u-ha')
    expect((await clubRepository.getClub('c-guitar')).allowedActions).not.toContain('CREATE_TERM')
    expect((await fail(termRepository.create('c-guitar', nextTerm())))?.status).toBe(403)
    expect(db.terms.filter((term) => term.clubId === 'c-guitar')).toHaveLength(2)

    signInAs('u-anh')
    const term = await termRepository.create('c-guitar', nextTerm())
    signInAs('u-ha')
    expect((await termRepository.list('c-guitar'))[0]?.allowedActions).toEqual([])
    expect((await fail(termRepository.update('c-guitar', term.id, { name: 'Tên khác', version: term.version })))?.status).toBe(403)
    expect(db.terms.find((candidate) => candidate.id === term.id)?.name).toBe('Nhiệm kỳ 2027–2028')
  })

  it('keeps terms of another club out of reach (NFR-SEC-02)', async () => {
    signInAs('u-anh')
    const term = await termRepository.create('c-guitar', nextTerm())
    signInAs('u-ha')
    expect((await fail(termRepository.update('c-english', term.id, { name: 'Tên khác', version: term.version })))?.status).toBe(404)
    expect((await fail(termRepository.list('c-volunteer')))?.status).toBe(403)
    expect((await fail(termRepository.create('c-volunteer', nextTerm())))?.status).toBe(403)
    expect(db.terms.filter((candidate) => candidate.clubId === 'c-volunteer')).toHaveLength(1)
  })

  it('checks the name and dates field by field', async () => {
    signInAs('u-anh')
    expect(fields(await fail(termRepository.create('c-guitar', nextTerm({ name: 'AB' }))))).toEqual(['name'])
    expect(fields(await fail(termRepository.create('c-guitar', nextTerm({ name: 'nhiệm kỳ 2026–2027' }))))).toEqual(['name'])
    expect(fields(await fail(termRepository.create('c-guitar', nextTerm({ startOn: '2027-02-30' }))))).toEqual(['startOn'])
    expect(fields(await fail(termRepository.create('c-guitar', nextTerm({ endOn: vnDate(301) }))))).toEqual(['endOn'])
    expect(fields(await fail(termRepository.create('c-guitar', nextTerm({ startOn: vnDate(-30), endOn: vnDate(0) }))))).toEqual(['endOn'])
    expect(fields(await fail(httpClient.post('/clubs/c-guitar/terms', { name: ['x'], startOn: 1, endOn: null })))).toEqual(['name', 'startOn', 'endOn'])
    expect(db.terms.filter((term) => term.clubId === 'c-guitar')).toHaveLength(2)
  })
})

describe('editing a preparing term and its department plan (FR-TERM-01, BR-TERM-04)', () => {
  it('saves a renamed department, a new department and bumps the version', async () => {
    signInAs('u-anh')
    const term = await termRepository.create('c-guitar', nextTerm())
    const plan = (term.departmentPlan ?? []).map(asRequest)
    const renamed = plan.map((entry) => (entry.departmentId === 'd-media' ? { ...entry, name: 'Truyền thông – Nội dung' } : entry))
    const saved = await termRepository.update('c-guitar', term.id, {
      departmentPlan: [...renamed, { id: null, departmentId: null, name: 'Sự kiện', description: 'Lo các chương trình lớn.', dropped: false }],
      version: term.version,
    })

    expect(saved.version).toBe(2)
    expect(saved.departmentPlan?.find((entry) => entry.departmentId === 'd-media')).toMatchObject({ name: 'Truyền thông – Nội dung', currentName: 'Truyền thông' })
    expect(saved.departmentPlan?.find((entry) => entry.departmentId === null)).toMatchObject({ name: 'Sự kiện', currentName: null, memberCount: 0 })
    // Kế hoạch chưa đổi cơ cấu đang chạy.
    expect(db.departments.find((department) => department.id === 'd-media')?.name).toBe('Truyền thông')
    expect(db.departments.some((department) => department.clubId === 'c-guitar' && department.name === 'Sự kiện')).toBe(false)
  })

  it('edits the name and dates without touching the plan', async () => {
    signInAs('u-anh')
    const term = await termRepository.create('c-guitar', nextTerm())
    const saved = await termRepository.update('c-guitar', term.id, { name: 'Nhiệm kỳ 2027', endOn: vnDate(600), version: term.version })
    expect(saved).toMatchObject({ name: 'Nhiệm kỳ 2027', startOn: vnDate(301), endOn: vnDate(600) })
    expect(saved.departmentPlan).toHaveLength(5)
  })

  it('does not let a department that still has members be dropped', async () => {
    signInAs('u-anh')
    const term = await termRepository.create('c-guitar', nextTerm())
    const media = term.departmentPlan?.find((entry) => entry.departmentId === 'd-media')
    expect(media?.memberCount).toBeGreaterThan(0)
    expect(media?.dropBlockedReason).toContain('chưa bỏ được')

    const plan = (term.departmentPlan ?? []).map(asRequest)
    const index = plan.findIndex((entry) => entry.departmentId === 'd-media')
    const error = await fail(termRepository.update('c-guitar', term.id, { departmentPlan: plan.map((entry, at) => (at === index ? { ...entry, dropped: true } : entry)), version: term.version }))
    expect(fields(error)).toEqual([`departmentPlan[${index}].dropped`])
    expect(db.terms.find((candidate) => candidate.id === term.id)?.version).toBe(1)
  })

  it('drops an empty department in the plan only, and follows departments declared or closed later', async () => {
    signInAs('u-anh')
    const term = await termRepository.create('c-guitar', nextTerm())
    const empty = await orgRepository.createDepartment('c-guitar', { name: 'Kỷ yếu', description: '' })
    const drifted = (await termRepository.list('c-guitar'))[0]
    const added = drifted?.departmentPlan?.find((entry) => entry.departmentId === empty.id)
    expect(added).toMatchObject({ name: 'Kỷ yếu', dropped: false, dropBlockedReason: null })

    const plan = (drifted?.departmentPlan ?? []).map(asRequest)
    const saved = await termRepository.update('c-guitar', term.id, {
      departmentPlan: plan.map((entry) => (entry.departmentId === empty.id ? { ...entry, dropped: true } : entry)),
      version: term.version,
    })
    expect(saved.departmentPlan?.find((entry) => entry.departmentId === empty.id)?.dropped).toBe(true)
    expect(db.departments.find((department) => department.id === empty.id)?.status).toBe('ACTIVE')

    await orgRepository.closeDepartment('c-guitar', empty.id, { action: 'CLOSE', reason: 'Không còn hoạt động.', version: empty.version })
    expect((await termRepository.list('c-guitar'))[0]?.departmentPlan?.some((entry) => entry.departmentId === empty.id)).toBe(false)
  })

  it('follows a later rename in Structure, unless the plan renamed that department itself', async () => {
    signInAs('u-anh')
    const term = await termRepository.create('c-guitar', nextTerm())
    const plan = (term.departmentPlan ?? []).map(asRequest)
    // Lưu kế hoạch không sửa gì ở Hậu cần, chỉ đổi tên Truyền thông.
    await termRepository.update('c-guitar', term.id, {
      departmentPlan: plan.map((entry) => (entry.departmentId === 'd-media' ? { ...entry, name: 'Truyền thông – Nội dung' } : entry)),
      version: term.version,
    })
    const departments = await orgRepository.departments('c-guitar', 'ACTIVE')
    const current = (id: string) => departments.find((department) => department.id === id)
    await orgRepository.updateDepartment('c-guitar', 'd-logistics', { name: 'Hậu cần – Kỹ thuật', description: 'Mô tả mới.', version: current('d-logistics')?.version ?? 0 })
    await orgRepository.updateDepartment('c-guitar', 'd-media', { name: 'Truyền thông số', description: current('d-media')?.description ?? '', version: current('d-media')?.version ?? 0 })

    const fresh = (await termRepository.list('c-guitar'))[0]?.departmentPlan ?? []
    expect(fresh.find((entry) => entry.departmentId === 'd-logistics')).toMatchObject({ name: 'Hậu cần – Kỹ thuật', description: 'Mô tả mới.', currentName: 'Hậu cần – Kỹ thuật' })
    expect(fresh.find((entry) => entry.departmentId === 'd-media')).toMatchObject({ name: 'Truyền thông – Nội dung', currentName: 'Truyền thông số' })
  })

  it('refuses duplicate names, including the name of a department the request leaves out', async () => {
    signInAs('u-anh')
    const term = await termRepository.create('c-guitar', nextTerm())
    const plan = (term.departmentPlan ?? []).map(asRequest)
    const fresh = (name: string): DepartmentPlanEntryRequest => ({ id: null, departmentId: null, name, description: '', dropped: false })

    const twice = await fail(termRepository.update('c-guitar', term.id, { departmentPlan: [...plan, fresh('Sự kiện'), fresh('sự kiện')], version: term.version }))
    expect(fields(twice)).toEqual([`departmentPlan[${plan.length + 1}].name`])
    const sameAsKept = await fail(termRepository.update('c-guitar', term.id, { departmentPlan: [fresh('Hậu cần')], version: term.version }))
    expect(fields(sameAsKept)).toEqual(['departmentPlan[0].name'])
    const short = await fail(termRepository.update('c-guitar', term.id, { departmentPlan: [fresh('A')], version: term.version }))
    expect(fields(short)).toEqual(['departmentPlan[0].name'])
    const foreign = await fail(termRepository.update('c-guitar', term.id, { departmentPlan: [{ ...fresh('Nội dung'), departmentId: 'd-en-content' }], version: term.version }))
    expect(fields(foreign)).toEqual(['departmentPlan[0].departmentId'])
  })

  it('answers 400, not a server error, to values of the wrong type', async () => {
    signInAs('u-anh')
    const term = await termRepository.create('c-guitar', nextTerm())
    const send = (body: unknown) => fail(httpClient.patch(`/clubs/c-guitar/terms/${term.id}`, body))
    expect(fields(await send({ name: 42, version: term.version }))).toEqual(['name'])
    expect(fields(await send({ departmentPlan: 'Hậu cần', version: term.version }))).toEqual(['departmentPlan'])
    expect(fields(await send({ departmentPlan: [null, { departmentId: null, name: 7, dropped: false }], version: term.version }))).toEqual(['departmentPlan[0]', 'departmentPlan[1].name'])
    expect(db.terms.find((candidate) => candidate.id === term.id)?.version).toBe(1)
  })

  it('answers 409 to a stale version and 422 to a term that is not preparing (NFR-REL-03)', async () => {
    signInAs('u-anh')
    const term = await termRepository.create('c-guitar', nextTerm())
    await termRepository.update('c-guitar', term.id, { name: 'Nhiệm kỳ 2027', version: term.version })
    const stale = await fail(termRepository.update('c-guitar', term.id, { name: 'Ghi đè', version: term.version }))
    expect(stale).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' })
    expect(db.terms.find((candidate) => candidate.id === term.id)?.name).toBe('Nhiệm kỳ 2027')

    const running = await fail(termRepository.update('c-guitar', 't-guitar-2026', { name: 'Đổi tên', version: 1 }))
    expect(running).toMatchObject({ status: 422, code: 'TERM_NOT_EDITABLE' })
  })
})
