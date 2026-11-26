import type { ApplicationStatus } from '@/features/recruitment/model/recruitmentTypes'
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
  /** Số ngày được nhận kết quả, đặt khi chốt (FR-REC-07). */
  responseDays: number | null
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
      responseDays: null,
      closedAt: null,
      version: 1,
    },
    {
      // Đợt cũ đã đóng, giữ đơn bị loại của Đạt để thử cảnh báo ứng viên cũ (FR-REC-04).
      id: 'rec-guitar-k0',
      clubId: 'c-guitar',
      name: 'Tuyển thành viên học kỳ 1 năm học 2025–2026',
      description: 'Đợt tuyển đầu năm học trước.',
      opensAt: vnDayAt(-420, 8),
      closesAt: vnDayAt(-405, 22),
      quotas: [{ departmentId: 'd-logistics', quota: 3 }],
      rounds: [
        { id: 'rr-k0-screen', name: 'Lọc đơn' },
        { id: 'rr-k0-interview', name: 'Phỏng vấn' },
      ],
      questions: [{ id: 'rq-k0-why', text: 'Vì sao bạn muốn tham gia CLB Guitar?', required: true }],
      judgeIds: [],
      createdBy: 'u-anh',
      createdAt: vnDayAt(-425, 20),
      finalizedAt: vnDayAt(-400, 21),
      responseDays: 7,
      closedAt: vnDayAt(-392, 21),
      version: 3,
    },
  ]
}

/** Đơn ứng tuyển (FR-REC-02, ST-APP); mỗi người một đơn mỗi đợt, tính cả đơn đã rút. */
export interface DbApplication {
  id: string
  recruitmentId: string
  clubId: string
  userId: string
  /** Mã ban theo thứ tự nguyện vọng. */
  choices: string[]
  answers: Array<{ questionId: string; text: string }>
  studentId: string | null
  status: ApplicationStatus
  submittedAt: string
  withdrawnAt: string | null
  /** FR-REC-03: kết quả từng vòng theo thứ tự vòng; Đạt kèm điểm 0–100, Loại kèm nhận xét. */
  roundResults: DbRoundResult[]
  /** FR-REC-07: ban trúng tuyển hoặc dự bị, thứ tự dự bị, hạn nhận kết quả. */
  outcome: { departmentId: string | null; reserveOrder: number | null; respondBy: string | null } | null
  version: number
}

export interface DbRoundResult {
  roundId: string
  result: 'PASS' | 'FAIL'
  score: number | null
  note: string
  by: string
  at: string
}

export function createApplicationSeed(): DbApplication[] {
  const application = (id: string, userId: string, choices: string[], answers: string[], daysAgo: number, studentId: string | null): DbApplication => ({
    id,
    recruitmentId: 'rec-guitar-k1',
    clubId: 'c-guitar',
    userId,
    choices,
    answers: answers.map((text, index) => ({ questionId: ['rq-k1-why', 'rq-k1-instrument', 'rq-k1-time'][index] ?? '', text })),
    studentId,
    status: 'SUBMITTED',
    submittedAt: vnDayAt(-daysAgo, 20),
    withdrawnAt: null,
    roundResults: [],
    outcome: null,
    version: 1,
  })
  return [
    {
      ...application('ap-tu', 'u-tu', ['d-music', 'd-media'], ['Mình muốn học đệm hát cho CLB tiếng Anh.', 'Chơi ukulele 1 năm.', '2 buổi'], 4, '22520001'),
      roundResults: [{ roundId: 'rr-k1-screen', result: 'PASS', score: 82, note: 'Đơn rõ ràng, có nền tảng nhạc cụ.', by: 'u-anh', at: vnDayAt(-1, 21) }],
      version: 2,
    },
    application('ap-dat', 'u-dat', ['d-logistics', 'd-music'], ['Muốn quay lại CLB sau một năm nghỉ.', 'Guitar 3 năm.', '3 buổi'], 2, '21520099'),
    {
      ...application('ap-dat-k0', 'u-dat', ['d-logistics'], ['Thích làm hậu cần cho các đêm nhạc.'], 415, '21520099'),
      recruitmentId: 'rec-guitar-k0',
      answers: [{ questionId: 'rq-k0-why', text: 'Thích làm hậu cần cho các đêm nhạc.' }],
      status: 'ELIMINATED',
      roundResults: [
        { roundId: 'rr-k0-screen', result: 'PASS', score: 70, note: 'Có kinh nghiệm hậu cần ở lớp.', by: 'u-anh', at: vnDayAt(-404, 20) },
        { roundId: 'rr-k0-interview', result: 'FAIL', score: null, note: 'Chưa sắp xếp được lịch sinh hoạt cố định.', by: 'u-anh', at: vnDayAt(-402, 20) },
      ],
      outcome: { departmentId: null, reserveOrder: null, respondBy: null },
      version: 3,
    },
  ]
}
