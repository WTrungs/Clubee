import type { TaskChangeField, TaskPriority, TaskScopeType, TaskStatus } from '@/features/task/model/taskTypes'
import { vnDayAt } from '../mockTime'
import { defaultClubSettings } from './clubSeed'

/** Một lần đổi người hoặc đổi hạn (FR-TASK-05): họ tên chụp lúc đổi (BR-DATA-02), hạn lưu dạng ISO. */
export interface DbTaskChange {
  id: string
  at: string
  actorId: string
  actorName: string
  field: TaskChangeField
  from: string[]
  to: string[]
  reason: string
}

export interface DbTaskHistory {
  id: string
  at: string
  actorId: string
  fromStatus: TaskStatus | null
  toStatus: TaskStatus
  note: string | null
}

export interface DbTask {
  id: string
  clubId: string
  title: string
  description: string
  scopeType: TaskScopeType
  scopeId: string
  assignerId: string
  ownerId: string
  collaboratorIds: string[]
  dueAt: string
  priority: TaskPriority
  status: TaskStatus
  submission: { note: string; attachmentIds: string[]; submittedAt: string } | null
  reviewComment: string | null
  cancelReason: string | null
  history: DbTaskHistory[]
  changes: DbTaskChange[]
  /** Hạn đã gửi nhắc; đổi hạn thì nhắc lại cho hạn mới (FR-TASK-06). */
  remindedFor: string | null
  /** Mỗi lần ghi nhận quá hạn theo từng hạn; đổi hạn không xóa (BR-TASK-03). */
  overdueLog: DbOverdueMark[]
  createdAt: string
  version: number
}

export interface DbOverdueMark {
  dueAt: string
  flaggedAt: string
}

export interface DbAttachment {
  id: string
  name: string
  size: number
  contentType: string
  uploadedBy: string
  uploadedAt: string
  /** Chứng từ thu chi gắn với một CLB; tệp không phải chứng từ không dùng được cho giao dịch (IF-05: quyền tải xuống theo dữ liệu gốc). */
  voucherClubId?: string
}

interface TaskSpec {
  id: string
  clubId?: string
  title: string
  description: string
  scope: [TaskScopeType, string]
  assigner: string
  owner: string
  collaborators?: string[]
  dueInDays: number
  priority: TaskPriority
  status: TaskStatus
  submissionNote?: string
  attachmentIds?: string[]
  reviewComment?: string
}

const SEED_CANCEL_REASON = 'Thay đổi kế hoạch, không cần làm nữa.'

/** Lịch sử tối thiểu khớp với trạng thái hiện tại, để màn chi tiết có dòng thời gian hợp lý. */
function historyFor(spec: TaskSpec, createdAt: string): DbTaskHistory[] {
  const entries: DbTaskHistory[] = [{ id: `${spec.id}-h0`, at: createdAt, actorId: spec.assigner, fromStatus: null, toStatus: 'ASSIGNED', note: null }]
  const step = (index: number, actorId: string, fromStatus: TaskStatus, toStatus: TaskStatus, note: string | null = null) =>
    entries.push({ id: `${spec.id}-h${index}`, at: vnDayAt(spec.dueInDays - 6 + index, 9 + index), actorId, fromStatus, toStatus, note })
  if (spec.status === 'CANCELLED') {
    step(1, spec.assigner, 'ASSIGNED', 'CANCELLED', SEED_CANCEL_REASON)
    return entries
  }
  if (spec.status === 'ASSIGNED') return entries
  step(1, spec.owner, 'ASSIGNED', 'IN_PROGRESS')
  if (spec.status === 'IN_PROGRESS') return entries
  step(2, spec.owner, 'IN_PROGRESS', 'PENDING_REVIEW', spec.submissionNote ?? null)
  if (spec.status === 'PENDING_REVIEW') return entries
  step(3, spec.assigner, 'PENDING_REVIEW', 'DONE', spec.reviewComment ?? null)
  return entries
}

const specs: TaskSpec[] = [
  {
    id: 't-poster',
    title: 'Thiết kế poster Đêm nhạc Mùa đông',
    description: 'Poster khổ A3 và bản đăng fanpage 1080×1350. Dùng bảng màu đã thống nhất ở buổi họp ban.',
    scope: ['DEPARTMENT', 'd-media'],
    assigner: 'u-linh',
    owner: 'u-ha',
    collaborators: ['u-vy'],
    dueInDays: 2,
    priority: 'HIGH',
    status: 'IN_PROGRESS',
  },
  {
    id: 't-intro-post',
    title: 'Viết bài giới thiệu thành viên mới',
    description: 'Mỗi bạn khoảng 80 chữ kèm ảnh chân dung, đăng thành chuỗi 3 bài.',
    scope: ['DEPARTMENT', 'd-media'],
    assigner: 'u-linh',
    owner: 'u-ha',
    dueInDays: 5,
    priority: 'MEDIUM',
    status: 'ASSIGNED',
  },
  {
    id: 't-teaser',
    title: 'Quay video teaser 30 giây',
    description: 'Quay ở phòng tập, cần 3 cảnh chơi đàn và 1 cảnh khán giả.',
    scope: ['DEPARTMENT', 'd-media'],
    assigner: 'u-linh',
    owner: 'u-vy',
    collaborators: ['u-ha'],
    dueInDays: 4,
    priority: 'MEDIUM',
    status: 'ASSIGNED',
  },
  {
    id: 't-cover',
    title: 'Cập nhật ảnh bìa fanpage',
    description: 'Ảnh bìa theo chủ đề mùa đông, có lịch các buổi diễn tháng 12.',
    scope: ['DEPARTMENT', 'd-media'],
    assigner: 'u-linh',
    owner: 'u-ha',
    dueInDays: 1,
    priority: 'MEDIUM',
    status: 'PENDING_REVIEW',
    submissionNote: 'Gửi 2 phương án, em thích phương án B hơn.',
    attachmentIds: ['f-cover-a', 'f-cover-b'],
  },
  {
    id: 't-photo-oct',
    title: 'Tổng hợp ảnh buổi sinh hoạt tháng 10',
    description: 'Chọn 20 ảnh đẹp nhất, chỉnh màu nhẹ.',
    scope: ['DEPARTMENT', 'd-media'],
    assigner: 'u-linh',
    owner: 'u-ha',
    dueInDays: -6,
    priority: 'LOW',
    status: 'DONE',
    submissionNote: 'Đã gửi thư mục ảnh.',
    reviewComment: 'Ảnh đẹp, cảm ơn em!',
  },
  {
    id: 't-subtitle',
    title: 'Dịch phụ đề clip biểu diễn',
    description: 'Phụ đề tiếng Anh cho clip 4 phút, xuất file .srt.',
    scope: ['DEPARTMENT', 'd-media'],
    assigner: 'u-linh',
    owner: 'u-ha',
    dueInDays: -2,
    priority: 'HIGH',
    status: 'IN_PROGRESS',
  },
  {
    id: 't-old-banner',
    title: 'In lại băng rôn khai giảng',
    description: 'Băng rôn 3 m, chất liệu bạt.',
    scope: ['DEPARTMENT', 'd-media'],
    assigner: 'u-linh',
    owner: 'u-vy',
    dueInDays: -3,
    priority: 'LOW',
    status: 'CANCELLED',
  },
  {
    id: 't-chords',
    title: 'Soạn hợp âm bài mở màn',
    description: 'Bản phối cho 3 guitar, có tab cho người mới.',
    scope: ['DEPARTMENT', 'd-music'],
    assigner: 'u-anh',
    owner: 'u-bao',
    dueInDays: 3,
    priority: 'URGENT',
    status: 'IN_PROGRESS',
  },
  {
    id: 't-strings',
    title: 'Kiểm tra dây đàn và capo',
    description: 'Kiểm tra 6 cây đàn của CLB, lập danh sách cần thay dây.',
    scope: ['DEPARTMENT', 'd-music'],
    assigner: 'u-anh',
    owner: 'u-bao',
    collaborators: ['u-nam'],
    dueInDays: 6,
    priority: 'LOW',
    status: 'ASSIGNED',
  },
  {
    id: 't-setlist',
    title: 'Lên danh sách tiết mục',
    description: '10–12 tiết mục, ghi rõ người biểu diễn và thời lượng.',
    scope: ['DEPARTMENT', 'd-music'],
    assigner: 'u-anh',
    owner: 'u-bao',
    dueInDays: 1,
    priority: 'HIGH',
    status: 'PENDING_REVIEW',
    submissionNote: 'Danh sách 11 tiết mục, tổng 75 phút.',
    attachmentIds: ['f-setlist'],
  },
  {
    id: 't-sound',
    title: 'Chuẩn bị âm thanh phòng tập',
    description: 'Kiểm tra mixer, 2 micro và dây kết nối trước buổi tập tổng.',
    scope: ['DEPARTMENT', 'd-logistics'],
    assigner: 'u-anh',
    owner: 'u-long',
    dueInDays: 4,
    priority: 'MEDIUM',
    status: 'IN_PROGRESS',
  },
  {
    id: 't-speaker',
    title: 'Mượn loa từ CLB bạn',
    description: 'Liên hệ CLB Nhảy hiện đại mượn 2 loa kéo.',
    scope: ['DEPARTMENT', 'd-logistics'],
    assigner: 'u-long',
    owner: 'u-khoa',
    collaborators: ['u-tram'],
    dueInDays: -1,
    priority: 'HIGH',
    status: 'ASSIGNED',
  },
  {
    id: 't-hall',
    title: 'Đặt phòng hội trường',
    description: 'Đặt hội trường lớn ngày diễn, xin xác nhận bằng văn bản.',
    scope: ['DEPARTMENT', 'd-logistics'],
    assigner: 'u-anh',
    owner: 'u-mai',
    dueInDays: 2,
    priority: 'URGENT',
    status: 'PENDING_REVIEW',
    submissionNote: 'Đã có giấy xác nhận của phòng quản trị.',
    attachmentIds: ['f-hall'],
  },
  {
    id: 't-plan',
    title: 'Duyệt kế hoạch hoạt động học kỳ',
    description: 'Đọc bản kế hoạch, góp ý trước buổi họp ban chủ nhiệm.',
    scope: ['DEPARTMENT', 'd-music'],
    assigner: 'u-huy',
    owner: 'u-anh',
    dueInDays: 7,
    priority: 'MEDIUM',
    status: 'ASSIGNED',
  },
  {
    id: 't-sponsor',
    title: 'Gặp đối tác tài trợ',
    description: 'Trình bày gói tài trợ bạc và vàng cho cửa hàng nhạc cụ.',
    scope: ['DEPARTMENT', 'd-music'],
    assigner: 'u-huy',
    owner: 'u-anh',
    collaborators: ['u-kiet'],
    dueInDays: 3,
    priority: 'HIGH',
    status: 'IN_PROGRESS',
  },
  {
    id: 't-partner',
    title: 'Liên hệ đơn vị cho thuê âm thanh',
    description: 'Xin báo giá trọn gói loa, mixer và người vận hành cho hai buổi diễn tháng 12.',
    scope: ['DEPARTMENT', 'd-external'],
    assigner: 'u-son',
    owner: 'u-ngoc',
    dueInDays: 9,
    priority: 'MEDIUM',
    status: 'ASSIGNED',
  },
  {
    id: 't-invite',
    title: 'In vé mời Đêm nhạc Mùa đông',
    description: '150 vé mời có mã số, giấy couche 300 gsm.',
    scope: ['SUBCOMMITTEE', 'sc-winter-media'],
    assigner: 'u-linh',
    owner: 'u-ha',
    dueInDays: 6,
    priority: 'MEDIUM',
    status: 'ASSIGNED',
  },
  {
    id: 't-lights',
    title: 'Thuê đèn sân khấu',
    description: 'Hai đèn follow và dàn PAR, có người vận hành.',
    scope: ['SUBCOMMITTEE', 'sc-winter-logistics'],
    assigner: 'u-bao',
    owner: 'u-khoa',
    collaborators: ['u-tram'],
    dueInDays: 6,
    priority: 'HIGH',
    status: 'IN_PROGRESS',
  },
  {
    id: 't-mc-script',
    title: 'Viết kịch bản dẫn chương trình',
    description: 'Kịch bản song ngữ, thời lượng mỗi lời dẫn dưới 1 phút.',
    scope: ['SUBCOMMITTEE', 'sc-winter-program'],
    assigner: 'u-bao',
    owner: 'u-nam',
    collaborators: ['u-kiet'],
    dueInDays: 5,
    priority: 'MEDIUM',
    status: 'ASSIGNED',
  },
  {
    id: 't-speaking',
    clubId: 'c-english',
    title: 'Chuẩn bị chủ đề Speaking Club tuần sau',
    description: 'Chủ đề về du lịch, 10 câu hỏi gợi mở theo 3 mức độ.',
    scope: ['DEPARTMENT', 'd-en-content'],
    assigner: 'u-tu',
    owner: 'u-ha',
    dueInDays: 2,
    priority: 'MEDIUM',
    status: 'ASSIGNED',
  },
  {
    id: 't-phonetics',
    clubId: 'c-english',
    title: 'Tìm tài liệu luyện phát âm',
    description: 'Tổng hợp 5 nguồn miễn phí, ghi chú trình độ phù hợp.',
    scope: ['DEPARTMENT', 'd-en-content'],
    assigner: 'u-ha',
    owner: 'u-bao',
    dueInDays: 5,
    priority: 'LOW',
    status: 'IN_PROGRESS',
  },
]

/** Dữ liệu mẫu coi như đã nhắc việc nằm trong khoảng nhắc mặc định của CLB và đã ghi quá hạn việc hạn từ hôm qua trở về trước. */
const SEED_REMINDED_UNTIL_DAY = defaultClubSettings().taskReminderDays

export function createTaskSeed(): DbTask[] {
  return specs.map((spec) => {
    // Việc hạn xa vẫn được giao từ hôm qua trở về trước, không ghi ngày tương lai.
    const createdAt = vnDayAt(Math.min(spec.dueInDays - 7, -1), 8, 30)
    const submitted = spec.status === 'PENDING_REVIEW' || spec.status === 'DONE'
    const dueAt = vnDayAt(spec.dueInDays, 21)
    const open = spec.status !== 'DONE' && spec.status !== 'CANCELLED'
    return {
      id: spec.id,
      clubId: spec.clubId ?? 'c-guitar',
      title: spec.title,
      description: spec.description,
      scopeType: spec.scope[0],
      scopeId: spec.scope[1],
      assignerId: spec.assigner,
      ownerId: spec.owner,
      collaboratorIds: spec.collaborators ?? [],
      dueAt,
      priority: spec.priority,
      status: spec.status,
      submission: submitted
        ? { note: spec.submissionNote ?? '', attachmentIds: spec.attachmentIds ?? [], submittedAt: vnDayAt(spec.dueInDays - 4, 11) }
        : null,
      reviewComment: spec.reviewComment ?? null,
      cancelReason: spec.status === 'CANCELLED' ? SEED_CANCEL_REASON : null,
      history: historyFor(spec, createdAt),
      changes: [],
      remindedFor: open && spec.dueInDays <= SEED_REMINDED_UNTIL_DAY ? dueAt : null,
      overdueLog: open && spec.dueInDays < 0 ? [{ dueAt, flaggedAt: dueAt }] : [],
      createdAt,
      version: 1,
    }
  })
}

export function createAttachmentSeed(): DbAttachment[] {
  const at = vnDayAt(-2, 11)
  return [
    { id: 'f-cover-a', name: 'anh-bia-phuong-an-a.png', size: 842_000, contentType: 'image/png', uploadedBy: 'u-ha', uploadedAt: at },
    { id: 'f-cover-b', name: 'anh-bia-phuong-an-b.png', size: 905_000, contentType: 'image/png', uploadedBy: 'u-ha', uploadedAt: at },
    {
      id: 'f-setlist',
      name: 'danh-sach-tiet-muc.xlsx',
      size: 24_000,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      uploadedBy: 'u-bao',
      uploadedAt: at,
    },
    { id: 'f-hall', name: 'xac-nhan-hoi-truong.pdf', size: 312_000, contentType: 'application/pdf', uploadedBy: 'u-mai', uploadedAt: at },
  ]
}
