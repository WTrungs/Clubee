import { describe, expect, it } from 'vitest'
import { db } from '@/api/mocks/db'
import { signInAs } from '@/testUtils'
import { recruitmentRepository } from '../model/recruitmentRepository'
import { priorHistoryText } from './recruitmentDisplay'

const listAll = async () => (await recruitmentRepository.applications('c-guitar', 'rec-guitar-k1', {})).content

describe('cảnh báo ứng viên cũ (FR-REC-04)', () => {
  it('gắn nhãn cho người từng nộp đơn, từng bị loại hoặc từng là thành viên; ứng viên mới thì không', async () => {
    signInAs('u-anh')
    const rows = await listAll()
    expect(rows.find((row) => row.applicant.id === 'u-dat')?.priorHistory).toEqual({ applications: 1, eliminated: true, formerMember: true })
    expect(rows.find((row) => row.applicant.id === 'u-tu')?.priorHistory).toBeNull()
  })

  it('chi tiết đơn có đơn cũ, điểm cũ, lý do bị loại và tư cách cũ kèm lý do', async () => {
    signInAs('u-anh')
    const detail = await recruitmentRepository.application('c-guitar', 'rec-guitar-k1', 'ap-dat')
    expect(detail.history.applications).toEqual([
      expect.objectContaining({
        recruitment: { id: 'rec-guitar-k0', name: 'Tuyển thành viên học kỳ 1 năm học 2025–2026' },
        status: 'ELIMINATED',
        totalScore: 70,
        eliminationNote: 'Chưa sắp xếp được lịch sinh hoạt cố định.',
        roundResults: [
          { roundName: 'Lọc đơn', result: 'PASS', score: 70, note: 'Có kinh nghiệm hậu cần ở lớp.' },
          { roundName: 'Phỏng vấn', result: 'FAIL', score: null, note: 'Chưa sắp xếp được lịch sinh hoạt cố định.' },
        ],
      }),
    ])
    expect(detail.history.memberships).toEqual([expect.objectContaining({ exitKind: 'REMOVED', reason: 'Vắng sinh hoạt nhiều buổi liên tiếp không báo.' })])
  })

  it('yêu cầu gia nhập bị từ chối cũng tính là từng bị loại, nhưng không phải từng là thành viên', async () => {
    db.memberships.push({
      ...structuredClone(db.memberships.find((membership) => membership.userId === 'u-dat' && membership.clubId === 'c-guitar') ?? db.memberships[0]!),
      id: 'm-guitar-tu-rejected',
      userId: 'u-tu',
      clubId: 'c-guitar',
      status: 'LEFT',
      joinedOn: null,
      exitKind: 'REJECTED',
      leaveReason: 'Chưa đủ buổi sinh hoạt thử.',
    })
    signInAs('u-anh')
    expect((await listAll()).find((row) => row.applicant.id === 'u-tu')?.priorHistory).toEqual({ applications: 0, eliminated: true, formerMember: false })
  })

  it('chỉ ban chủ nhiệm xem được lịch sử cùng đơn', async () => {
    signInAs('u-ha')
    await expect(recruitmentRepository.application('c-guitar', 'rec-guitar-k1', 'ap-dat')).rejects.toMatchObject({ status: 403 })
  })
})

describe('priorHistoryText', () => {
  it('nêu đủ các ý theo thứ tự', () => {
    expect(priorHistoryText({ applications: 1, eliminated: true, formerMember: true })).toBe('Từng nộp 1 đơn, từng bị loại, từng là thành viên ở CLB này.')
    expect(priorHistoryText({ applications: 0, eliminated: false, formerMember: true })).toBe('Từng là thành viên ở CLB này.')
    expect(priorHistoryText({ applications: 0, eliminated: false, formerMember: false })).toBe('')
  })
})
