import type { FinanceCategory, FundKind, FundStatus, TransactionFlow, TransactionStatus, TransactionType } from '@/features/finance/model/financeTypes'
import { vnDate, vnDayAt } from '../mockTime'
import type { DbAttachment } from './taskSeed'

export interface DbFund {
  id: string
  clubId: string
  kind: FundKind
  eventId: string | null
  status: FundStatus
  createdAt: string
  settledAt: string | null
  settledBy: string | null
  version: number
}

/** Một giao dịch của sổ quỹ; số dư luôn tính lại từ các bản ghi Đã ghi sổ (BR-FIN-02). */
export interface DbTransaction {
  id: string
  clubId: string
  fundId: string
  type: TransactionType
  /** Chiều tiền với `fundId`; chuyển quỹ luôn là ra khỏi `fundId` và vào `targetFundId`. */
  direction: TransactionFlow
  amount: number
  category: FinanceCategory
  description: string
  occurredOn: string | null
  status: TransactionStatus
  /** Người tạo: người đề xuất khoản chi, hoặc Thủ quỹ ghi khoản thu, điều chỉnh. */
  proposerId: string
  approverId: string | null
  posterId: string | null
  attachmentIds: string[]
  originalId: string | null
  targetFundId: string | null
  rejectionReason: string | null
  createdAt: string
  decidedAt: string | null
  postedAt: string | null
  version: number
}

/** Ngưỡng chi bắt buộc chứng từ mặc định (SRS 9.2). */
export const DEFAULT_RECEIPT_THRESHOLD = 200_000

export const generalFundId = (clubId: string) => `fund-${clubId}`
export const eventFundId = (eventId: string) => `fund-${eventId}`

export function createFundSeed(): DbFund[] {
  const general = (clubId: string): DbFund => ({
    id: generalFundId(clubId),
    clubId,
    kind: 'GENERAL',
    eventId: null,
    status: 'OPEN',
    createdAt: vnDayAt(-400, 9),
    settledAt: null,
    settledBy: null,
    version: 1,
  })
  const event = (eventId: string, clubId = 'c-guitar'): DbFund => ({
    id: eventFundId(eventId),
    clubId,
    kind: 'EVENT',
    eventId,
    status: 'OPEN',
    createdAt: vnDayAt(-60, 9),
    settledAt: null,
    settledBy: null,
    version: 1,
  })
  return [
    general('c-guitar'),
    general('c-english'),
    general('c-volunteer'),
    // Sự kiện từ Đã duyệt trở đi có quỹ riêng; Dự thảo và Chờ duyệt thì chưa.
    event('e-winter'),
    event('e-workshop'),
    event('e-livestream'),
    event('e-exchange'),
    event('e-acoustic-sep'),
    event('e-speaking', 'c-english'),
  ]
}

interface TransactionSpec {
  id: string
  fundId: string
  clubId?: string
  type: TransactionType
  amount: number
  category: FinanceCategory
  description: string
  daysAgo: number
  status?: TransactionStatus
  proposerId: string
  approverId?: string
  posterId?: string
  attachmentIds?: string[]
  rejectionReason?: string
}

function transaction(spec: TransactionSpec): DbTransaction {
  const status = spec.status ?? 'POSTED'
  const posted = status === 'POSTED'
  const decided = status !== 'PROPOSED' && spec.type === 'EXPENSE'
  return {
    id: spec.id,
    clubId: spec.clubId ?? 'c-guitar',
    fundId: spec.fundId,
    type: spec.type,
    direction: spec.type === 'INCOME' ? 'IN' : 'OUT',
    amount: spec.amount,
    category: spec.category,
    description: spec.description,
    occurredOn: posted ? vnDate(-spec.daysAgo) : null,
    status,
    proposerId: spec.proposerId,
    approverId: spec.approverId ?? null,
    posterId: posted ? (spec.posterId ?? 'u-mai') : null,
    attachmentIds: spec.attachmentIds ?? [],
    originalId: null,
    targetFundId: null,
    rejectionReason: spec.rejectionReason ?? null,
    // Khoản chi được đề xuất vài ngày trước khi chi thật.
    createdAt: vnDayAt(-spec.daysAgo - (spec.type === 'EXPENSE' ? 2 : 0), 9),
    decidedAt: decided ? vnDayAt(-spec.daysAgo - 1, 15) : null,
    postedAt: posted ? vnDayAt(-spec.daysAgo, 17) : null,
    version: 1,
  }
}

export function createTransactionSeed(): DbTransaction[] {
  const guitar = generalFundId('c-guitar')
  return [
    // Quỹ chung CLB Guitar: số dư 5.470.000 đ
    transaction({ id: 'tx-dues-s1', fundId: guitar, type: 'INCOME', amount: 2_500_000, category: 'MEMBER_DUES', description: 'Thu quỹ học kỳ 1 (25 thành viên, 100.000 đ mỗi người)', daysAgo: 60, proposerId: 'u-mai' }),
    transaction({ id: 'tx-sponsor-shop', fundId: guitar, type: 'INCOME', amount: 3_000_000, category: 'SPONSORSHIP', description: 'Tài trợ của cửa hàng nhạc cụ Phố Đàn', daysAgo: 45, proposerId: 'u-mai', attachmentIds: ['f-fin-sponsor'] }),
    transaction({ id: 'tx-strings', fundId: guitar, type: 'EXPENSE', amount: 480_000, category: 'EQUIPMENT', description: 'Thay dây cho 6 cây đàn dùng chung', daysAgo: 40, proposerId: 'u-long', approverId: 'u-anh', attachmentIds: ['f-fin-strings'] }),
    transaction({ id: 'tx-room-oct', fundId: guitar, type: 'EXPENSE', amount: 600_000, category: 'VENUE', description: 'Thuê phòng tập tháng 10', daysAgo: 30, proposerId: 'u-anh', approverId: 'u-huy', attachmentIds: ['f-fin-room'] }),
    transaction({ id: 'tx-shirts', fundId: guitar, type: 'INCOME', amount: 1_200_000, category: 'OTHER_INCOME', description: 'Bán áo đồng phục CLB', daysAgo: 20, proposerId: 'u-mai' }),
    transaction({ id: 'tx-poster-recruit', fundId: guitar, type: 'EXPENSE', amount: 150_000, category: 'PRINTING', description: 'In poster tuyển thành viên', daysAgo: 15, proposerId: 'u-linh', approverId: 'u-huy' }),
    transaction({ id: 'tx-standee', fundId: guitar, type: 'EXPENSE', amount: 350_000, category: 'PRINTING', description: 'In standee cho Đêm nhạc Mùa đông', daysAgo: 1, status: 'PROPOSED', proposerId: 'u-linh', attachmentIds: ['f-fin-standee'] }),
    transaction({ id: 'tx-capo', fundId: guitar, type: 'EXPENSE', amount: 180_000, category: 'EQUIPMENT', description: 'Mua capo và pick dự phòng', daysAgo: 2, status: 'APPROVED', proposerId: 'u-long', approverId: 'u-anh' }),
    transaction({
      id: 'tx-party',
      fundId: guitar,
      type: 'EXPENSE',
      amount: 900_000,
      category: 'FOOD',
      description: 'Liên hoan cuối tháng',
      daysAgo: 6,
      status: 'REJECTED',
      proposerId: 'u-son',
      approverId: 'u-huy',
      attachmentIds: ['f-fin-party'],
      rejectionReason: 'Liên hoan do các bạn tự đóng góp, không chi từ quỹ chung.',
    }),

    transaction({ id: 'tx-en-dues', fundId: generalFundId('c-english'), clubId: 'c-english', type: 'INCOME', amount: 1_500_000, category: 'MEMBER_DUES', description: 'Thu quỹ học kỳ 1', daysAgo: 50, proposerId: 'u-tu', posterId: 'u-tu' }),
    transaction({ id: 'tx-vol-sponsor', fundId: generalFundId('c-volunteer'), clubId: 'c-volunteer', type: 'INCOME', amount: 2_000_000, category: 'SPONSORSHIP', description: 'Tài trợ chiến dịch Mùa hè xanh', daysAgo: 70, proposerId: 'u-tam', posterId: 'u-tam' }),

    // Quỹ sự kiện Đêm nhạc Mùa đông
    transaction({ id: 'tx-winter-sponsor', fundId: eventFundId('e-winter'), type: 'INCOME', amount: 1_500_000, category: 'SPONSORSHIP', description: 'Tài trợ của quán cà phê Gác Nhỏ', daysAgo: 5, proposerId: 'u-mai' }),
    transaction({ id: 'tx-winter-sound', fundId: eventFundId('e-winter'), type: 'EXPENSE', amount: 800_000, category: 'VENUE', description: 'Thuê hệ thống âm thanh, ánh sáng', daysAgo: 1, status: 'PROPOSED', proposerId: 'u-bao', attachmentIds: ['f-fin-sound'] }),

    // Giao lưu đã kết thúc, còn 750.000 đ chờ quyết toán
    transaction({ id: 'tx-exchange-tickets', fundId: eventFundId('e-exchange'), type: 'INCOME', amount: 1_200_000, category: 'EVENT_REVENUE', description: 'Bán vé giao lưu (40 vé, 30.000 đ mỗi vé)', daysAgo: 10, proposerId: 'u-mai' }),
    transaction({ id: 'tx-exchange-drinks', fundId: eventFundId('e-exchange'), type: 'EXPENSE', amount: 450_000, category: 'FOOD', description: 'Nước uống, bánh cho khách mời', daysAgo: 9, proposerId: 'u-anh', approverId: 'u-huy', attachmentIds: ['f-fin-drinks'] }),

    // Đêm nhạc tháng 9 đã hủy, quỹ còn mở để quyết toán khoản đã chi (SRS 4.2)
    transaction({ id: 'tx-acoustic-sponsor', fundId: eventFundId('e-acoustic-sep'), type: 'INCOME', amount: 500_000, category: 'SPONSORSHIP', description: 'Tài trợ trước của nhà sách Trẻ', daysAgo: 50, proposerId: 'u-mai' }),
    transaction({ id: 'tx-acoustic-deposit', fundId: eventFundId('e-acoustic-sep'), type: 'EXPENSE', amount: 300_000, category: 'VENUE', description: 'Cọc thuê sân khấu (không hoàn lại)', daysAgo: 48, proposerId: 'u-linh', approverId: 'u-anh', attachmentIds: ['f-fin-stage'] }),
  ]
}

export function createFinanceAttachmentSeed(): DbAttachment[] {
  const file = (id: string, name: string, size: number, uploadedBy: string, daysAgo: number): DbAttachment => ({
    id,
    name,
    size,
    contentType: name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
    uploadedBy,
    uploadedAt: vnDayAt(-daysAgo, 9),
    voucherClubId: 'c-guitar',
  })
  return [
    file('f-fin-sponsor', 'hop-dong-tai-tro-pho-dan.pdf', 420_000, 'u-mai', 45),
    file('f-fin-strings', 'hoa-don-day-dan.jpg', 610_000, 'u-long', 42),
    file('f-fin-room', 'hoa-don-thue-phong-t10.pdf', 180_000, 'u-anh', 32),
    file('f-fin-standee', 'bao-gia-in-standee.pdf', 150_000, 'u-linh', 1),
    file('f-fin-party', 'du-tru-lien-hoan.jpg', 380_000, 'u-son', 6),
    file('f-fin-sound', 'bao-gia-am-thanh-anh-sang.pdf', 260_000, 'u-bao', 1),
    file('f-fin-drinks', 'hoa-don-nuoc-uong.jpg', 540_000, 'u-anh', 11),
    file('f-fin-stage', 'bien-nhan-coc-san-khau.pdf', 200_000, 'u-linh', 50),
  ]
}
