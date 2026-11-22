import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChartNoAxesColumn,
  Compass,
  FolderOpen,
  Gauge,
  KanbanSquare,
  LayoutDashboard,
  LayoutGrid,
  ListTodo,
  Network,
  ScanLine,
  Shuffle,
  type LucideIcon,
  UserCog,
  UserPlus,
  UsersRound,
  Wallet,
} from 'lucide-react'
import type { AccountType } from '@/features/account/model/accountTypes'
import type { ClubAction, ClubViewerRole } from '@/features/club/model/clubTypes'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Chỉ sáng khi đúng đường dẫn, không sáng cho trang con. */
  end?: boolean
}

export interface NavSection {
  title: string
  items: NavItem[]
}

/** Admin chỉ có khu quản trị (SRS 3.4); người dùng có mục cá nhân và mục của CLB đang mở; khách của sự kiện chỉ có mục Sự kiện. */
export function buildNavigation(
  clubId: string | undefined,
  clubName: string | undefined,
  accountType: AccountType = 'USER',
  viewerRole: ClubViewerRole = 'MEMBER',
  clubActions: readonly ClubAction[] = [],
): NavSection[] {
  if (accountType === 'ADMIN') {
    return [
      {
        title: 'Quản trị hệ thống',
        items: [
          { to: '/admin', label: 'Số liệu', icon: Gauge, end: true },
          { to: '/admin/accounts', label: 'Tài khoản', icon: UserCog, end: true },
          { to: '/admin/transfers', label: 'Chuyển quyền', icon: Shuffle, end: true },
        ],
      },
    ]
  }
  const sections: NavSection[] = [
    {
      title: 'Cá nhân',
      items: [
        { to: '/clubs', label: 'CLB của tôi', icon: LayoutGrid, end: true },
        { to: '/directory', label: 'Tìm CLB', icon: Compass, end: true },
        { to: '/me/tasks', label: 'Công việc của tôi', icon: ListTodo, end: true },
        { to: '/me/calendar', label: 'Lịch của tôi', icon: CalendarClock, end: true },
        { to: '/me/activity', label: 'Hoạt động của tôi', icon: ChartNoAxesColumn, end: true },
        { to: '/scan', label: 'Quét mã điểm danh', icon: ScanLine, end: true },
      ],
    },
  ]
  if (clubId && viewerRole === 'EVENT_GUEST') {
    sections.push({ title: clubName ?? 'CLB', items: [{ to: `/clubs/${clubId}/events`, label: 'Sự kiện', icon: CalendarDays }] })
  } else if (clubId) {
    sections.push({
      title: clubName ?? 'CLB',
      items: [
        { to: `/clubs/${clubId}`, label: 'Tổng quan', icon: LayoutDashboard, end: true },
        { to: `/clubs/${clubId}/members`, label: 'Thành viên', icon: UsersRound },
        { to: `/clubs/${clubId}/structure`, label: 'Cơ cấu', icon: Network },
        { to: `/clubs/${clubId}/terms`, label: 'Nhiệm kỳ', icon: CalendarRange },
        { to: `/clubs/${clubId}/events`, label: 'Sự kiện', icon: CalendarDays },
        { to: `/clubs/${clubId}/sessions`, label: 'Sinh hoạt', icon: CalendarCheck },
        { to: `/clubs/${clubId}/tasks`, label: 'Công việc', icon: KanbanSquare },
        { to: `/clubs/${clubId}/documents`, label: 'Tài liệu', icon: FolderOpen },
        { to: `/clubs/${clubId}/finance`, label: 'Tài chính', icon: Wallet },
        // Mục quản lý chỉ hiện khi máy chủ cho phép; trang vẫn tự kiểm quyền.
        ...(clubActions.includes('MANAGE_RECRUITMENT') ? [{ to: `/clubs/${clubId}/recruitments`, label: 'Tuyển thành viên', icon: UserPlus }] : []),
      ],
    })
  }
  return sections
}
