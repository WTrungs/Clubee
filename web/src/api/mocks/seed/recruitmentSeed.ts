import { vnDayAt } from '../mockTime'

/** Đợt tuyển (FR-REC-01); trạng thái suy ra từ giờ mở, giờ đóng, `finalizedAt`, `closedAt`. Dữ liệu tổng hợp. */
export interface DbRecruitment {
  id: string
  clubId: string
  name: string
  description: string
  opensAt: string
  closesAt: string
  quotas: Array<{ departmentId: string; quota: number }>
  rounds: Array<{ id: string; name: string }>
  questions: Array<{ id: string; text: string; required: boolean }>
  judgeIds: string[]
  createdBy: string
  createdAt: string
  finalizedAt: string | null
  closedAt: string | null
  version: number
}

export function createRecruitmentSeed(): DbRecruitment[] {
  return [
    {
      id: 'rec-guitar-k1',
      clubId: 'c-guitar',
      name: 'Tuyển thành viên học kỳ 1 năm học 2026–2027',
      description: 'CLB Guitar tìm bạn yêu âm nhạc, không cần biết đàn trước. Vòng 1 lọc đơn, vòng 2 phỏng vấn ngắn tại phòng tập.',
      opensAt: vnDayAt(-5, 8),
      closesAt: vnDayAt(10, 22),
      quotas: [
        { departmentId: 'd-media', quota: 3 },
        { departmentId: 'd-music', quota: 5 },
        { departmentId: 'd-logistics', quota: 2 },
      ],
      rounds: [
        { id: 'rr-k1-screen', name: 'Lọc đơn' },
        { id: 'rr-k1-interview', name: 'Phỏng vấn' },
      ],
      questions: [
        { id: 'rq-k1-why', text: 'Vì sao bạn muốn tham gia CLB Guitar?', required: true },
        { id: 'rq-k1-instrument', text: 'Bạn đã chơi nhạc cụ nào chưa? Kể ngắn gọn.', required: true },
        { id: 'rq-k1-time', text: 'Bạn dành được bao nhiêu buổi mỗi tuần cho CLB?', required: false },
      ],
      judgeIds: ['u-linh', 'u-ha'],
      createdBy: 'u-anh',
      createdAt: vnDayAt(-8, 20),
      finalizedAt: null,
      closedAt: null,
      version: 1,
    },
  ]
}
