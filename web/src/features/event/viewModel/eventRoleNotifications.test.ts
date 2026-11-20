import { describe, expect, it } from 'vitest'
import { db } from '@/api/mocks/db'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { signInAs } from '@/testUtils'
import { eventRepository } from '../model/eventRepository'

const eventTitles = async (userId: string) => {
  signInAs(userId)
  return (await notificationRepository.list({ category: 'EVENT', size: 100 })).content.map((notification) => notification.title)
}
const versionOf = (eventId: string) => db.events.find((event) => event.id === eventId)?.version ?? 0

describe('notifications for event organiser roles (FR-NOT-02)', () => {
  it('tells the person chosen as event lead, when the board creates the event and when it approves a proposal', async () => {
    signInAs('u-anh')
    await eventRepository.create('c-guitar', {
      name: 'Buổi tập mở',
      description: '',
      startAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      endAt: new Date(Date.now() + 5 * 86_400_000 + 7_200_000).toISOString(),
      format: 'OFFLINE',
      location: 'Phòng tập',
      onlineUrl: null,
      capacity: null,
      registrationDeadline: null,
      openToGuests: false,
      leadUserId: 'u-kiet',
    })
    expect(await eventTitles('u-kiet')).toContain('Bạn được chọn làm Trưởng BTC Buổi tập mở')

    signInAs('u-anh')
    await eventRepository.transition('c-guitar', 'e-busking', { action: 'APPROVE', version: versionOf('e-busking'), leadUserId: 'u-vy' })
    expect(await eventTitles('u-vy')).toContain('Bạn được chọn làm Trưởng BTC Biểu diễn đường phố gây quỹ')
    expect(await eventTitles('u-ha')).not.toContain('Bạn được chọn làm Trưởng BTC Biểu diễn đường phố gây quỹ')
  })

  it('tells a new subcommittee lead, an invited member and an added collaborator, but not the person acting', async () => {
    signInAs('u-bao')
    await eventRepository.createSubcommittee('c-guitar', 'e-winter', { name: 'Lễ tân', description: '', quota: null, leadUserId: 'u-son' })
    const reception = db.subcommittees.find((subcommittee) => subcommittee.eventId === 'e-winter' && subcommittee.name === 'Lễ tân')
    if (!reception) throw new Error('Thiếu tiểu ban Lễ tân')
    await eventRepository.addStaff('c-guitar', 'e-winter', reception.id, 'u-ngoc')
    await eventRepository.addCollaborator('c-guitar', 'e-winter', reception.id, 'tam.duong@demo.test')

    expect(await eventTitles('u-son')).toContain('Bạn được chọn làm Trưởng tiểu ban Lễ tân của Đêm nhạc Mùa đông')
    expect(await eventTitles('u-ngoc')).toContain('Bạn được mời vào tiểu ban Lễ tân của Đêm nhạc Mùa đông')
    expect(await eventTitles('u-tam')).toContain('Bạn được thêm làm cộng tác viên tiểu ban Lễ tân của Đêm nhạc Mùa đông')
    expect((await eventTitles('u-bao')).filter((title) => title.includes('Lễ tân'))).toEqual([])
  })
})
