import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { eventRepository } from '@/features/event/model/eventRepository'
import { taskRepository } from '@/features/task/model/taskRepository'
import { signInAs } from '@/testUtils'
import { db, type DbPosition } from './db'
import { eligibleMembers } from './mockMembers'
import { endPositions, grantPosition, hasPosition, isBoardMember, isPositionActive, positionHolderOf } from './mockPermissions'
import { assignableScopes } from './mockScopes'
import { vnDate } from './mockTime'

const position = (overrides: Partial<DbPosition>): DbPosition => ({
  id: 'p-test',
  userId: 'u-test',
  clubId: 'c-guitar',
  role: 'DEPARTMENT_HEAD',
  scopeId: 'd-media',
  startOn: vnDate(-10),
  endOn: vnDate(10),
  assignedBy: 'u-anh',
  revokedAt: null,
  revokeReason: null,
  version: 1,
  ...overrides,
})

describe('position validity (BR-ORG-03)', () => {
  it('is active from the start date through the end date', () => {
    expect(isPositionActive(position({ startOn: vnDate(1) }))).toBe(false)
    expect(isPositionActive(position({ endOn: vnDate(0) }))).toBe(true)
    expect(isPositionActive(position({ endOn: vnDate(-1) }))).toBe(false)
    expect(isPositionActive(position({ endOn: null }))).toBe(true)
  })

  it('ends the day before handover, so the next holder starts that day without overlap', () => {
    const held = position({ id: 'p-handover', endOn: vnDate(30) })
    db.positions.push(held)
    endPositions((candidate) => candidate.id === 'p-handover', { reason: 'Bàn giao cho người mới.', handoverOn: vnDate(3), actorId: 'u-anh' })
    expect(held.endOn).toBe(vnDate(2))
    expect(isPositionActive(held, vnDate(2))).toBe(true)
    expect(isPositionActive(held, vnDate(3))).toBe(false)
  })

  it('never extends a position past its original last day', () => {
    const short = position({ id: 'p-short', endOn: vnDate(1) })
    db.positions.push(short)
    endPositions((candidate) => candidate.id === 'p-short', { reason: 'Bàn giao muộn.', handoverOn: vnDate(10), actorId: 'u-anh' })
    expect(short.endOn).toBe(vnDate(1))
  })

  it('defaults a standing position to the end of the running term (BR-ORG-03)', () => {
    const granted = grantPosition({ userId: 'u-vy', clubId: 'c-guitar', role: 'DEPARTMENT_VICE_HEAD', scopeId: 'd-media', assignedBy: 'u-anh' })
    expect(granted.endOn).toBe(db.terms.find((term) => term.id === 't-guitar-2026')?.endOn)
  })

  it('never activates a position that is ended before its start date', () => {
    const upcoming = position({ id: 'p-upcoming', startOn: vnDate(5) })
    db.positions.push(upcoming)
    expect(endPositions((candidate) => candidate.id === 'p-upcoming', { reason: 'Đổi kế hoạch.', actorId: 'u-anh' })).toHaveLength(1)
    expect(isPositionActive(upcoming, vnDate(5))).toBe(false)
  })

  it('stops granting rights once the holder loses standing (BR-ORG-01, BR-MEM-04, BR-MEM-05)', () => {
    const huy = db.memberships.find((candidate) => candidate.userId === 'u-huy' && candidate.clubId === 'c-guitar')
    if (huy) huy.status = 'LEFT'
    expect(isBoardMember('u-huy', 'c-guitar')).toBe(false)
    const linh = db.memberships.find((candidate) => candidate.userId === 'u-linh' && candidate.clubId === 'c-guitar')
    if (linh) linh.status = 'ON_LEAVE'
    expect(hasPosition('u-linh', 'DEPARTMENT_HEAD', 'd-media')).toBe(false)
    const bao = db.memberships.find((candidate) => candidate.userId === 'u-bao' && candidate.clubId === 'c-guitar')
    if (bao) bao.status = 'ON_LEAVE'
    expect(hasPosition('u-bao', 'EVENT_LEAD', 'e-winter')).toBe(false)
  })

  it('lets staff from a co-hosting club lead a subcommittee without host membership (BR-ORG-01)', () => {
    db.eventStaff.push({ userId: 'u-tu', eventId: 'e-winter', subcommitteeId: 'sc-winter-program', kind: 'CO_HOST', joinedAt: vnDate(-1), leftAt: null })
    grantPosition({ userId: 'u-tu', clubId: 'c-guitar', role: 'SUBCOMMITTEE_LEAD', scopeId: 'sc-winter-program', assignedBy: 'u-bao' })
    expect(hasPosition('u-tu', 'SUBCOMMITTEE_LEAD', 'sc-winter-program')).toBe(true)
    grantPosition({ userId: 'u-tam', clubId: 'c-guitar', role: 'SUBCOMMITTEE_LEAD', scopeId: 'sc-winter-media', assignedBy: 'u-bao' })
    expect(hasPosition('u-tam', 'SUBCOMMITTEE_LEAD', 'sc-winter-media')).toBe(false)
  })

  it('ends positions without deleting them and keeps the last holder for history', () => {
    const before = db.positions.length
    const ended = endPositions((candidate) => candidate.userId === 'u-long', { reason: 'Kiểm thử kết thúc chức vụ.', actorId: 'u-anh' })
    expect(ended.map((candidate) => candidate.role).sort()).toEqual(['DEPARTMENT_HEAD', 'SUBCOMMITTEE_LEAD'])
    expect(db.positions).toHaveLength(before)
    expect(ended.every((candidate) => candidate.revokeReason === 'Kiểm thử kết thúc chức vụ.')).toBe(true)
    expect(hasPosition('u-long', 'DEPARTMENT_HEAD', 'd-logistics')).toBe(false)
    expect(positionHolderOf('SUBCOMMITTEE_LEAD', 'sc-winter-logistics')).toBeNull()
    expect(positionHolderOf('SUBCOMMITTEE_LEAD', 'sc-winter-logistics', { includeEnded: true })).toBe('u-long')
  })
})

describe('events read leads from positions', () => {
  it('ends event positions on cancellation but still shows who led it', async () => {
    signInAs('u-anh')
    const workshop = db.events.find((event) => event.id === 'e-workshop')
    const cancelled = await eventRepository.transition('c-guitar', 'e-workshop', {
      action: 'CANCEL',
      version: workshop?.version ?? 0,
      reason: 'Không đặt được phòng.',
    })
    expect(cancelled.lead?.id).toBe('u-nam')
    expect(hasPosition('u-nam', 'EVENT_LEAD', 'e-workshop')).toBe(false)
    expect(db.positions.find((candidate) => candidate.role === 'EVENT_LEAD' && candidate.scopeId === 'e-workshop')?.revokeReason).toBe('Sự kiện đã hủy.')
  })

  it('drops a subcommittee lead once the position ends', async () => {
    endPositions((candidate) => candidate.scopeId === 'sc-winter-logistics', { reason: 'Kiểm thử.', actorId: 'u-anh' })
    signInAs('u-bao')
    const logistics = (await eventRepository.subcommittees('c-guitar', 'e-winter')).find((subcommittee) => subcommittee.id === 'sc-winter-logistics')
    expect(logistics?.lead).toBeNull()
  })
})

describe('tasks read members and departments from the shared source', () => {
  it('offers only working members of active departments (BR-TASK-01, BR-MEM-05, BR-TERM-04)', () => {
    const scopes = assignableScopes('u-anh', 'c-guitar')
    expect(scopes.map((scope) => scope.id)).not.toContain('d-photo')
    const media = scopes.find((scope) => scope.id === 'd-media')
    expect(media?.members).toEqual(eligibleMembers('c-guitar', { departmentId: 'd-media' }))
    expect(media?.members.map((member) => member.id)).not.toContain('u-yen')
  })

  it('keeps tasks of a closed department and of a cancelled event viewable by the board (BR-TERM-04, SRS 3.5)', async () => {
    const media = db.departments.find((department) => department.id === 'd-media')
    if (media) media.status = 'CLOSED'
    const winter = db.events.find((event) => event.id === 'e-winter')
    if (winter) winter.status = 'CANCELLED'
    signInAs('u-anh')
    expect((await taskRepository.get('c-guitar', 't-intro-post')).id).toBe('t-intro-post')
    expect((await taskRepository.get('c-guitar', 't-invite')).id).toBe('t-invite')
  })

  it('hides tasks of a club the person has left and refuses opening them (BR-MEM-04)', async () => {
    signInAs('u-ha')
    const membership = db.memberships.find((candidate) => candidate.userId === 'u-ha' && candidate.clubId === 'c-guitar')
    if (membership) membership.status = 'LEFT'
    const mine = await taskRepository.listMine({ size: 50 })
    expect(mine.content.every((task) => task.clubId !== 'c-guitar')).toBe(true)
    expect(mine.content.some((task) => task.clubId === 'c-english')).toBe(true)
    const error = await taskRepository.get('c-guitar', 't-poster').then(() => null, (caught: unknown) => caught as ApiError)
    expect(error?.status).toBe(403)
  })
})
