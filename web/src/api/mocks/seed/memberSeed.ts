import type { AccountType, MemberStatus } from '@/features/account/model/accountTypes'
import type { AccountStatus } from '@/features/account/model/adminTypes'
import { nowIso, vnDayAt } from '../mockTime'
import { createClubSeed } from './clubSeed'
import { createPositionSeed } from './orgSeed'

export type { AccountStatus, AccountType }

export interface DbUser {
  id: string
  fullName: string
  email: string
  phone: string | null
  birthDate: string | null
  avatarUrl: string | null
  /** Email mới chờ xác thực (FR-ACC-05); đăng nhập vẫn bằng `email`. */
  pendingEmail: string | null
  /** Chỉ có sau khi đổi mật khẩu trong phiên demo; `null` thì mock nhận mọi mật khẩu từ 8 ký tự. */
  password: string | null
  status: AccountStatus
  accountType: AccountType
  createdAt: string
  lastLoginAt: string | null
  /** Lần khóa gần nhất (FR-ACC-09); mở khóa thì xóa. */
  lockReason: string | null
  lockedAt: string | null
  lockedBy: string | null
  version: number
}

/** Người dùng mới với các trường hồ sơ để trống. */
export function newUser(fields: Pick<DbUser, 'id' | 'fullName' | 'email' | 'phone' | 'status'> & Partial<Pick<DbUser, 'accountType' | 'createdAt' | 'lastLoginAt'>>): DbUser {
  return {
    birthDate: null,
    avatarUrl: null,
    pendingEmail: null,
    password: null,
    accountType: 'USER',
    createdAt: nowIso(),
    lastLoginAt: null,
    lockReason: null,
    lockedAt: null,
    lockedBy: null,
    version: 0,
    ...fields,
  }
}

/** Cách tư cách kết thúc ở Đã rời: bị từ chối gia nhập, bị đưa ra hoặc tự xin rời. */
export type MembershipExit = 'REJECTED' | 'REMOVED' | 'RESIGNED'

export interface DbMembershipChange {
  at: string
  actorId: string
  fromStatus: MemberStatus | null
  toStatus: MemberStatus
  reason: string | null
}

export type MemberInfoField = 'displayTitle' | 'internalNote' | 'studentId' | 'joinedOn'

/** Một lần ban chủ nhiệm sửa thông tin thành viên trong CLB (FR-MEM-05). */
export interface DbMemberInfoChange {
  at: string
  actorId: string
  field: MemberInfoField
  from: string | null
  to: string | null
}

/** Một khoảng thời gian thuộc một ban chính; `toOn` là ngày cuối, null là đang thuộc (FR-MEM-10, BR-MEM-06). */
export interface DbDepartmentStint {
  departmentId: string
  fromOn: string
  toOn: string | null
  changedBy: string | null
}

/** Tư cách thành viên (SRS 4.1). Gia nhập lại thì tạo bản ghi mới, bản cũ giữ nguyên (ST-MEM, BR-MEM-02). */
export interface DbMembership {
  id: string
  userId: string
  clubId: string
  status: MemberStatus
  /** Ban chính hiện tại; luôn khớp khoảng đang mở của `departmentHistory`. */
  departmentId: string | null
  departmentHistory: DbDepartmentStint[]
  requestedAt: string
  joinedOn: string | null
  leftOn: string | null
  exitKind: MembershipExit | null
  leaveReason: string | null
  introduction: string | null
  studentId: string | null
  /** Chức danh mọi thành viên cùng CLB thấy cạnh tên; khác chức vụ được gán (SRS 3.5). */
  displayTitle: string | null
  /** Chỉ ban chủ nhiệm xem được. */
  internalNote: string | null
  history: DbMembershipChange[]
  infoHistory: DbMemberInfoChange[]
  /** Lời mời đã dùng khi gửi yêu cầu gia nhập (FR-MEM-01); không có nếu tự tìm đến CLB. */
  invitationId?: string
  version: number
}

/** Yêu cầu xin tạm nghỉ của thành viên (FR-MEM-07); xin rời có hiệu lực ngay nên không cần bản ghi yêu cầu. */
export interface DbLeaveRequest {
  id: string
  clubId: string
  membershipId: string
  userId: string
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'CLOSED'
  createdAt: string
  decidedBy: string | null
  decidedAt: string | null
  decisionNote: string | null
  version: number
}

export function createLeaveRequestSeed(): DbLeaveRequest[] {
  return [
    {
      id: 'lr-guitar-khoa',
      clubId: 'c-guitar',
      membershipId: 'm-guitar-khoa',
      userId: 'u-khoa',
      reason: 'Đi thực tập ở tỉnh khác hai tháng, không tham gia sinh hoạt được.',
      status: 'PENDING',
      createdAt: vnDayAt(-1, 19),
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      version: 1,
    },
  ]
}

/** Trường mới của tư cách vừa tạo: chưa có chức danh, ghi chú, lịch sử sửa. */
export const blankMemberInfo = (): Pick<DbMembership, 'displayTitle' | 'internalNote' | 'infoHistory'> => ({ displayTitle: null, internalNote: null, infoHistory: [] })

const people: Array<[id: string, fullName: string, email: string]> = [
  ['u-anh', 'Nguyễn Minh Anh', 'anh.nguyen@demo.test'],
  ['u-bao', 'Trần Quốc Bảo', 'bao.tran@demo.test'],
  ['u-ha', 'Lê Thu Hà', 'ha.le@demo.test'],
  ['u-huy', 'Phạm Gia Huy', 'huy.pham@demo.test'],
  ['u-mai', 'Võ Ngọc Mai', 'mai.vo@demo.test'],
  ['u-linh', 'Đặng Khánh Linh', 'linh.dang@demo.test'],
  ['u-long', 'Bùi Đức Long', 'long.bui@demo.test'],
  ['u-vy', 'Hoàng Thảo Vy', 'vy.hoang@demo.test'],
  ['u-nam', 'Đỗ Nhật Nam', 'nam.do@demo.test'],
  ['u-tram', 'Ngô Bảo Trâm', 'tram.ngo@demo.test'],
  ['u-kiet', 'Lý Tuấn Kiệt', 'kiet.ly@demo.test'],
  ['u-yen', 'Trịnh Hải Yến', 'yen.trinh@demo.test'],
  ['u-khoa', 'Phan Anh Khoa', 'khoa.phan@demo.test'],
  ['u-thao', 'Mai Phương Thảo', 'thao.mai@demo.test'],
  ['u-tu', 'Châu Minh Tú', 'tu.chau@demo.test'],
  ['u-tam', 'Dương Thanh Tâm', 'tam.duong@demo.test'],
  ['u-son', 'Tạ Hồng Sơn', 'son.ta@demo.test'],
  ['u-ngoc', 'Kha Bảo Ngọc', 'ngoc.kha@demo.test'],
  ['u-hieu', 'Lương Trung Hiếu', 'hieu.luong@demo.test'],
  ['u-quan', 'Trương Minh Quân', 'quan.truong@demo.test'],
  ['u-phuong', 'Lâm Thu Phương', 'phuong.lam@demo.test'],
  ['u-dat', 'Hồ Tấn Đạt', 'dat.ho@demo.test'],
]

export function createUserSeed(): DbUser[] {
  // Số điện thoại giả theo một mẫu cố định, không phải số thật.
  const members = people.map(([id, fullName, email], index) =>
    newUser({
      id,
      fullName,
      email,
      phone: `0900 000 ${String(101 + index)}`,
      status: 'ACTIVE',
      createdAt: vnDayAt(-500 + index, 9),
      // Chủ nhiệm Đội Tình nguyện không đăng nhập hơn 30 ngày (dữ liệu cho FR-ACC-08).
      lastLoginAt: id === 'u-tam' ? vnDayAt(-45, 20) : vnDayAt(-(index % 6), 8 + (index % 10)),
    }),
  )
  return [
    ...members,
    newUser({ id: 'u-admin', fullName: 'Quản trị hệ thống', email: 'admin@demo.test', phone: null, status: 'ACTIVE', accountType: 'ADMIN', createdAt: vnDayAt(-600, 8), lastLoginAt: vnDayAt(-1, 9) }),
    {
      ...newUser({ id: 'u-khanh', fullName: 'Vương Gia Khánh', email: 'khanh.vuong@demo.test', phone: null, status: 'LOCKED', createdAt: vnDayAt(-200, 10), lastLoginAt: vnDayAt(-90, 21) }),
      lockReason: 'Đăng tin quảng cáo trái phép nhiều lần.',
      lockedAt: vnDayAt(-80, 10),
      lockedBy: 'u-admin',
      version: 1,
    },
    newUser({ id: 'u-lan', fullName: 'Tô Ngọc Lan', email: 'lan.to@demo.test', phone: null, status: 'PENDING_VERIFICATION', createdAt: vnDayAt(-2, 15) }),
  ]
}

/** Người duyệt trong lịch sử mẫu là Chủ nhiệm hiện tại của CLB. */
function presidentOf(clubId: string): string | undefined {
  return createPositionSeed().find((position) => position.role === 'PRESIDENT' && position.scopeId === clubId)?.userId
}

/** MSSV giả gắn với người, chỉ lưu ở CLB có thu thập (SRS 9.2). */
function studentIdOf(userId: string, clubId: string): string | null {
  if (!createClubSeed().some((club) => club.id === clubId && club.collectsStudentId)) return null
  return `2600${String(1001 + people.findIndex(([id]) => id === userId))}`
}

interface CurrentSpec {
  userId: string
  clubId: string
  departmentId: string
  status: Exclude<MemberStatus, 'PENDING' | 'LEFT'>
  joinedDaysAgo: number
}

/** Thành viên đang sinh hoạt: lịch sử gồm yêu cầu, lần duyệt và (nếu có) lần cho tạm nghỉ; Chủ nhiệm là người sáng lập. */
function currentMembership(spec: CurrentSpec): DbMembership {
  const requestedAt = vnDayAt(-spec.joinedDaysAgo - 3, 20)
  const joinedAt = vnDayAt(-spec.joinedDaysAgo, 9)
  const approver = presidentOf(spec.clubId) ?? spec.userId
  const approvedTo = spec.status === 'PROBATION' ? 'PROBATION' : 'ACTIVE'
  const history: DbMembershipChange[] =
    approver === spec.userId
      ? [{ at: joinedAt, actorId: spec.userId, fromStatus: null, toStatus: 'ACTIVE', reason: null }]
      : [
          { at: requestedAt, actorId: spec.userId, fromStatus: null, toStatus: 'PENDING', reason: null },
          { at: joinedAt, actorId: approver, fromStatus: 'PENDING', toStatus: approvedTo, reason: null },
        ]
  if (spec.status === 'ON_LEAVE') {
    history.push({ at: vnDayAt(-20, 10), actorId: approver, fromStatus: 'ACTIVE', toStatus: 'ON_LEAVE', reason: 'Đi trao đổi sinh viên một học kỳ.' })
  }
  return {
    id: `m-${spec.clubId.slice(2)}-${spec.userId.slice(2)}`,
    userId: spec.userId,
    clubId: spec.clubId,
    status: spec.status,
    departmentId: spec.departmentId,
    departmentHistory: [{ departmentId: spec.departmentId, fromOn: joinedAt.slice(0, 10), toOn: null, changedBy: approver }],
    requestedAt,
    joinedOn: joinedAt.slice(0, 10),
    leftOn: null,
    exitKind: null,
    leaveReason: null,
    introduction: null,
    studentId: studentIdOf(spec.userId, spec.clubId),
    ...blankMemberInfo(),
    displayTitle: displayTitles[`${spec.clubId}/${spec.userId}`] ?? null,
    history,
    version: 1,
  }
}

/** Chức danh hiển thị mẫu, không phải chức vụ (FR-MEM-05). */
const displayTitles: Record<string, string> = {
  'c-guitar/u-nam': 'Trưởng nhóm bè',
  'c-guitar/u-kiet': 'Phụ trách nhạc cụ',
  'c-guitar/u-vy': 'Biên tập fanpage',
}

export function createMembershipSeed(): DbMembership[] {
  const guitar: Array<[string, string, CurrentSpec['status']]> = [
    ['u-anh', 'd-music', 'ACTIVE'],
    ['u-bao', 'd-music', 'ACTIVE'],
    ['u-ha', 'd-media', 'ACTIVE'],
    ['u-huy', 'd-music', 'ACTIVE'],
    ['u-mai', 'd-logistics', 'ACTIVE'],
    ['u-linh', 'd-media', 'ACTIVE'],
    ['u-long', 'd-logistics', 'ACTIVE'],
    ['u-vy', 'd-media', 'ACTIVE'],
    ['u-nam', 'd-music', 'ACTIVE'],
    ['u-tram', 'd-logistics', 'PROBATION'],
    ['u-kiet', 'd-music', 'ACTIVE'],
    ['u-yen', 'd-media', 'ON_LEAVE'],
    ['u-khoa', 'd-logistics', 'ACTIVE'],
    ['u-thao', 'd-music', 'PROBATION'],
    ['u-son', 'd-external', 'ACTIVE'],
    ['u-ngoc', 'd-external', 'PROBATION'],
    ['u-hieu', 'd-design', 'ACTIVE'],
  ]
  const others: CurrentSpec[] = [
    { userId: 'u-ha', clubId: 'c-english', departmentId: 'd-en-content', status: 'ACTIVE', joinedDaysAgo: 200 },
    { userId: 'u-bao', clubId: 'c-english', departmentId: 'd-en-content', status: 'PROBATION', joinedDaysAgo: 20 },
    { userId: 'u-tu', clubId: 'c-english', departmentId: 'd-en-content', status: 'ACTIVE', joinedDaysAgo: 300 },
    { userId: 'u-tam', clubId: 'c-english', departmentId: 'd-en-content', status: 'ACTIVE', joinedDaysAgo: 280 },
    { userId: 'u-anh', clubId: 'c-volunteer', departmentId: 'd-vol-field', status: 'ACTIVE', joinedDaysAgo: 150 },
    { userId: 'u-tam', clubId: 'c-volunteer', departmentId: 'd-vol-field', status: 'ACTIVE', joinedDaysAgo: 500 },
    // Để danh sách chọn Chủ nhiệm mới khi chuyển quyền cưỡng chế có nhiều người (FR-ACC-08).
    { userId: 'u-hieu', clubId: 'c-volunteer', departmentId: 'd-vol-field', status: 'ACTIVE', joinedDaysAgo: 120 },
    { userId: 'u-quan', clubId: 'c-volunteer', departmentId: 'd-vol-field', status: 'ACTIVE', joinedDaysAgo: 90 },
  ]
  const current = [
    ...guitar.map(([userId, departmentId, status], index) => ({ userId, clubId: 'c-guitar', departmentId, status, joinedDaysAgo: 400 - index * 17 })),
    ...others,
  ].map(currentMembership)

  const pending = (id: string, userId: string, requestedAt: string, introduction: string): DbMembership => ({
    id,
    userId,
    clubId: 'c-guitar',
    status: 'PENDING',
    departmentId: null,
    departmentHistory: [],
    requestedAt,
    joinedOn: null,
    leftOn: null,
    exitKind: null,
    leaveReason: null,
    introduction,
    studentId: studentIdOf(userId, 'c-guitar'),
    ...blankMemberInfo(),
    history: [{ at: requestedAt, actorId: userId, fromStatus: null, toStatus: 'PENDING', reason: null }],
    version: 1,
  })
  const left = (spec: { id: string; userId: string; departmentId: string; joinedDaysAgo: number; leftDaysAgo: number; exitKind: MembershipExit; reason: string }): DbMembership => {
    const joinedAt = vnDayAt(-spec.joinedDaysAgo, 9)
    const leftAt = vnDayAt(-spec.leftDaysAgo, 10)
    const president = presidentOf('c-guitar') ?? spec.userId
    const actorId = spec.exitKind === 'RESIGNED' ? spec.userId : president
    return {
      id: spec.id,
      userId: spec.userId,
      clubId: 'c-guitar',
      status: 'LEFT',
      departmentId: spec.departmentId,
      departmentHistory: [{ departmentId: spec.departmentId, fromOn: joinedAt.slice(0, 10), toOn: leftAt.slice(0, 10), changedBy: president }],
      requestedAt: vnDayAt(-spec.joinedDaysAgo - 4, 20),
      joinedOn: joinedAt.slice(0, 10),
      leftOn: leftAt.slice(0, 10),
      exitKind: spec.exitKind,
      leaveReason: spec.reason,
      introduction: null,
      studentId: studentIdOf(spec.userId, 'c-guitar'),
      ...blankMemberInfo(),
      history: [
        { at: vnDayAt(-spec.joinedDaysAgo - 4, 20), actorId: spec.userId, fromStatus: null, toStatus: 'PENDING', reason: null },
        { at: joinedAt, actorId: president, fromStatus: 'PENDING', toStatus: 'ACTIVE', reason: null },
        { at: leftAt, actorId, fromStatus: 'ACTIVE', toStatus: 'LEFT', reason: spec.reason },
      ],
      version: 1,
    }
  }

  return [
    ...current,
    {
      ...pending('m-guitar-quan', 'u-quan', vnDayAt(-2, 21), 'Mình tự học guitar được hai năm, muốn tập đệm hát cùng mọi người và góp sức cho các đêm nhạc.'),
      invitationId: 'inv-guitar-link',
    },
    left({ id: 'm-guitar-phuong-old', userId: 'u-phuong', departmentId: 'd-media', joinedDaysAgo: 380, leftDaysAgo: 250, exitKind: 'RESIGNED', reason: 'Xin rời để tập trung thực tập ở tỉnh khác.' }),
    pending('m-guitar-phuong', 'u-phuong', vnDayAt(-1, 20), 'Mình từng ở ban Truyền thông, nay đã về lại trường và muốn sinh hoạt tiếp.'),
    left({ id: 'm-guitar-dat', userId: 'u-dat', departmentId: 'd-logistics', joinedDaysAgo: 350, leftDaysAgo: 60, exitKind: 'REMOVED', reason: 'Vắng sinh hoạt nhiều buổi liên tiếp không báo.' }),
  ]
}
