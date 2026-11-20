import type { TermStatus } from '@/features/term/model/termTypes'
import { vnDate, vnDayAt } from '../mockTime'

/** Dòng kế hoạch ban của nhiệm kỳ Chuẩn bị; ban chưa có thì để trống mã ban và được tạo khi hoàn tất bàn giao (FR-TERM-01). */
export interface DbPlanEntry {
  id: string
  departmentId: string | null
  /** Ban đã có mà để trống thì theo tên, mô tả hiện tại ở Cơ cấu; chỉ lưu khi người dùng sửa. */
  name: string | null
  description: string | null
  dropped: boolean
}

export interface DbTerm {
  id: string
  clubId: string
  name: string
  startOn: string
  endOn: string
  status: TermStatus
  createdAt: string
  createdBy: string | null
  closedAt: string | null
  departmentPlan: DbPlanEntry[] | null
  /** Tên các ban lúc nhiệm kỳ đóng, vì ban giữ lại có thể đổi tên ở nhiệm kỳ sau (để dành cho FR-TERM-08). */
  closedDepartments: Array<{ id: string; name: string }> | null
  version: number
}

export type DepartmentStatus = 'ACTIVE' | 'CLOSED'

/** Ban chuyên môn: đóng thì giữ lại để tra cứu, không xóa (FR-ORG-01, BR-TERM-04). */
export interface DbDepartment {
  id: string
  clubId: string
  termId: string
  name: string
  description: string
  status: DepartmentStatus
  closedOn: string | null
  closeReason: string | null
  createdAt: string
  version: number
}

export type PositionRole =
  | 'PRESIDENT'
  | 'VICE_PRESIDENT'
  | 'TREASURER'
  | 'DEPARTMENT_HEAD'
  | 'DEPARTMENT_VICE_HEAD'
  | 'EVENT_LEAD'
  | 'SUBCOMMITTEE_LEAD'

/** Chức vụ được gán (SRS 4.1). Thu hồi hoặc hết hạn chỉ ghi ngày kết thúc, bản ghi giữ nguyên (BR-ORG-03). */
export interface DbPosition {
  id: string
  userId: string
  clubId: string
  role: PositionRole
  /** CLB, ban, sự kiện hoặc tiểu ban mà chức vụ có hiệu lực (SRS 3.1). */
  scopeId: string
  startOn: string
  /** Ngày hiệu lực cuối; chức vụ sự kiện để trống vì chỉ hết khi sự kiện Đã đóng hoặc Đã hủy. */
  endOn: string | null
  assignedBy: string | null
  revokedAt: string | null
  revokeReason: string | null
  version: number
}

export function createTermSeed(): DbTerm[] {
  const running = (id: string, clubId: string, name: string, startsIn: number, endsIn: number): DbTerm => ({
    id,
    clubId,
    name,
    startOn: vnDate(startsIn),
    endOn: vnDate(endsIn),
    status: 'RUNNING',
    createdAt: vnDayAt(startsIn, 9),
    createdBy: null,
    closedAt: null,
    departmentPlan: null,
    closedDepartments: null,
    version: 1,
  })
  // Nhiệm kỳ đang chạy đứng trước nhiệm kỳ cũ cùng CLB vì chức vụ mẫu lấy hạn theo nhiệm kỳ đầu tiên tìm thấy.
  return [
    running('t-guitar-2026', 'c-guitar', 'Nhiệm kỳ 2026–2027', -64, 300),
    running('t-english-2026', 'c-english', 'Nhiệm kỳ 2026', -300, 57),
    running('t-volunteer-2025', 'c-volunteer', 'Nhiệm kỳ 2025–2027', -400, 330),
    {
      ...running('t-guitar-2025', 'c-guitar', 'Nhiệm kỳ 2025–2026', -430, -65),
      status: 'CLOSED',
      closedAt: vnDayAt(-64, 8),
      // Ban Truyền thông lúc đó còn tên cũ (FR-ORG-06 tra theo tên lúc nhiệm kỳ đóng, BR-DATA-02).
      closedDepartments: [
        { id: 'd-media', name: 'Truyền thông và Sự kiện' },
        { id: 'd-logistics', name: 'Hậu cần' },
        { id: 'd-music', name: 'Chuyên môn' },
      ],
    },
  ]
}

/** Chức vụ thường trực của nhiệm kỳ Guitar đã đóng: có người đã rời CLB và một chức bị thu hồi sớm (FR-ORG-06). */
function closedTermPositions(): DbPosition[] {
  const held = (userId: string, role: PositionRole, scopeId: string, startOn: number, endOn: number, revoked?: { at: string; reason: string }): DbPosition => ({
    id: `p-2025-${role.toLowerCase()}-${scopeId}-${userId.slice(2)}`,
    userId,
    clubId: 'c-guitar',
    role,
    scopeId,
    startOn: vnDate(startOn),
    endOn: vnDate(endOn),
    assignedBy: null,
    revokedAt: revoked?.at ?? null,
    revokeReason: revoked?.reason ?? null,
    version: revoked ? 2 : 1,
  })
  // Không chức vụ nào bắt đầu trước ngày gia nhập của người giữ (BR-ORG-01).
  return [
    held('u-anh', 'PRESIDENT', 'c-guitar', -400, -65),
    held('u-huy', 'VICE_PRESIDENT', 'c-guitar', -349, -65),
    held('u-mai', 'TREASURER', 'c-guitar', -332, -65),
    held('u-linh', 'DEPARTMENT_HEAD', 'd-media', -315, -65),
    held('u-phuong', 'DEPARTMENT_VICE_HEAD', 'd-media', -380, -251, { at: vnDayAt(-250, 10), reason: 'Rời CLB.' }),
    held('u-dat', 'DEPARTMENT_HEAD', 'd-logistics', -350, -65),
    held('u-long', 'DEPARTMENT_VICE_HEAD', 'd-logistics', -298, -201, { at: vnDayAt(-200, 9), reason: 'Xin thôi chức để tập trung thi cuối kỳ.' }),
  ]
}

export function createDepartmentSeed(): DbDepartment[] {
  const department = (id: string, clubId: string, termId: string, name: string, description: string): DbDepartment => ({
    id,
    clubId,
    termId,
    name,
    description,
    status: 'ACTIVE',
    closedOn: null,
    closeReason: null,
    createdAt: vnDayAt(-64, 9),
    version: 1,
  })
  return [
    department('d-media', 'c-guitar', 't-guitar-2026', 'Truyền thông', 'Fanpage, poster, ảnh và video của CLB.'),
    department('d-logistics', 'c-guitar', 't-guitar-2026', 'Hậu cần', 'Phòng tập, nhạc cụ, âm thanh và đi lại.'),
    department('d-music', 'c-guitar', 't-guitar-2026', 'Chuyên môn', 'Dạy đàn, phối khí và tiết mục biểu diễn.'),
    department('d-external', 'c-guitar', 't-guitar-2026', 'Đối ngoại', 'Liên hệ nhà tài trợ, CLB bạn và đơn vị đồng hành.'),
    department('d-design', 'c-guitar', 't-guitar-2026', 'Thiết kế', 'Nhận diện, ấn phẩm in và trang trí sân khấu.'),
    {
      ...department('d-photo', 'c-guitar', 't-guitar-2026', 'Nhiếp ảnh', 'Chụp ảnh các buổi sinh hoạt và sự kiện.'),
      status: 'CLOSED',
      closedOn: vnDate(-30),
      closeReason: 'Gộp vào ban Truyền thông cho gọn đầu mối.',
    },
    department('d-en-content', 'c-english', 't-english-2026', 'Nội dung', 'Chủ đề sinh hoạt, tài liệu luyện nói.'),
    department('d-vol-field', 'c-volunteer', 't-volunteer-2025', 'Hiện trường', 'Tổ chức các chiến dịch tại địa phương.'),
  ]
}

export function createPositionSeed(): DbPosition[] {
  const terms = createTermSeed()
  const standing = (userId: string, clubId: string, role: PositionRole, scopeId: string, startOn?: string): DbPosition => {
    const term = terms.find((candidate) => candidate.clubId === clubId)
    return {
      id: `p-${role.toLowerCase()}-${scopeId}-${userId.slice(2)}`,
      userId,
      clubId,
      role,
      scopeId,
      startOn: startOn ?? term?.startOn ?? vnDate(-64),
      endOn: term?.endOn ?? vnDate(300),
      assignedBy: null,
      revokedAt: null,
      revokeReason: null,
      version: 1,
    }
  }
  const eventRole = (userId: string, clubId: string, role: PositionRole, scopeId: string, assignedBy: string): DbPosition => ({
    ...standing(userId, clubId, role, scopeId),
    startOn: vnDate(-14),
    endOn: null,
    assignedBy,
  })
  return [
    standing('u-anh', 'c-guitar', 'PRESIDENT', 'c-guitar'),
    standing('u-huy', 'c-guitar', 'VICE_PRESIDENT', 'c-guitar'),
    standing('u-mai', 'c-guitar', 'TREASURER', 'c-guitar'),
    standing('u-linh', 'c-guitar', 'DEPARTMENT_HEAD', 'd-media'),
    standing('u-long', 'c-guitar', 'DEPARTMENT_HEAD', 'd-logistics'),
    standing('u-son', 'c-guitar', 'DEPARTMENT_HEAD', 'd-external'),
    standing('u-tu', 'c-english', 'PRESIDENT', 'c-english'),
    // Chức vụ không bắt đầu trước ngày gia nhập (BR-ORG-01).
    standing('u-ha', 'c-english', 'DEPARTMENT_HEAD', 'd-en-content', vnDate(-200)),
    standing('u-tam', 'c-volunteer', 'PRESIDENT', 'c-volunteer'),
    eventRole('u-bao', 'c-guitar', 'EVENT_LEAD', 'e-winter', 'u-anh'),
    eventRole('u-nam', 'c-guitar', 'EVENT_LEAD', 'e-workshop', 'u-huy'),
    eventRole('u-kiet', 'c-guitar', 'EVENT_LEAD', 'e-livestream', 'u-anh'),
    eventRole('u-huy', 'c-guitar', 'EVENT_LEAD', 'e-exchange', 'u-anh'),
    {
      ...eventRole('u-linh', 'c-guitar', 'EVENT_LEAD', 'e-acoustic-sep', 'u-anh'),
      startOn: vnDate(-60),
      endOn: vnDate(-46),
      revokedAt: vnDayAt(-45, 10),
      revokeReason: 'Sự kiện đã hủy.',
    },
    eventRole('u-ha', 'c-english', 'EVENT_LEAD', 'e-speaking', 'u-tu'),
    eventRole('u-long', 'c-guitar', 'SUBCOMMITTEE_LEAD', 'sc-winter-logistics', 'u-bao'),
    eventRole('u-linh', 'c-guitar', 'SUBCOMMITTEE_LEAD', 'sc-winter-media', 'u-bao'),
    eventRole('u-nam', 'c-guitar', 'SUBCOMMITTEE_LEAD', 'sc-winter-program', 'u-bao'),
    ...closedTermPositions(),
  ]
}
