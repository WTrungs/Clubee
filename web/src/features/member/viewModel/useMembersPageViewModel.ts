import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import type { BacklogQuery } from '../model/backlogTypes'
import type { LeaveRequestQuery } from '../model/memberTypes'
import { memberRepository } from '../model/memberRepository'
import { memberQueryKeys } from './memberQueryKeys'

export type MembersTab = 'members' | 'requests' | 'leave' | 'backlog'

const MANAGER_TABS: MembersTab[] = ['requests', 'leave', 'backlog']
const OPEN_BACKLOG: BacklogQuery = { status: 'OPEN', size: 1 }
const PENDING_LEAVE: LeaveRequestQuery = { status: 'PENDING', size: 1 }

/** Tab, thành viên đang mở và người cũ đang xem tồn đọng nằm trên URL để tải lại hoặc chia sẻ liên kết vẫn đúng chỗ. */
export function useMembersPageViewModel() {
  const { clubId, club } = useCurrentClub()
  const [searchParams, setSearchParams] = useSearchParams()
  const canManage = club.allowedActions.includes('MANAGE_MEMBERS')
  const tabParam = searchParams.get('tab')
  const tab: MembersTab = canManage ? (MANAGER_TABS.find((candidate) => candidate === tabParam) ?? 'members') : 'members'
  // Chỉ cần số mục chưa xử lý cho nhãn tab, nên lấy trang 1 phần tử.
  const backlog = useQuery({ queryKey: memberQueryKeys.backlog(clubId, OPEN_BACKLOG), queryFn: () => memberRepository.backlog(clubId, OPEN_BACKLOG), enabled: canManage })
  const leave = useQuery({ queryKey: memberQueryKeys.leaveRequests(clubId, PENDING_LEAVE), queryFn: () => memberRepository.leaveRequests(clubId, PENDING_LEAVE), enabled: canManage })
  const [invitationsOpen, setInvitationsOpen] = useState(false)

  const update = (change: (next: URLSearchParams) => void, replace = false) => {
    const next = new URLSearchParams(searchParams)
    change(next)
    setSearchParams(next, { replace })
  }

  return {
    clubName: club.name,
    canManage,
    /** FR-MEM-01: lời mời do người quản lý thành viên tạo. */
    invitationsOpen,
    openInvitations: () => setInvitationsOpen(true),
    closeInvitations: () => setInvitationsOpen(false),
    tab,
    setTab: (value: string) =>
      update((next) => {
        if (MANAGER_TABS.includes(value as MembersTab)) next.set('tab', value)
        else next.delete('tab')
        next.delete('former')
      }, true),
    backlogOpenCount: backlog.data?.totalElements,
    leavePendingCount: leave.data?.totalElements,
    formerMemberId: tab === 'backlog' ? searchParams.get('former') : null,
    clearFormer: () => update((next) => next.delete('former'), true),
    /** Từ hồ sơ người đã rời: mở tab Tồn đọng lọc theo người đó (FR-MEM-09). */
    openBacklogOf: (formerMemberId: string) =>
      update((next) => {
        next.set('tab', 'backlog')
        next.set('former', formerMemberId)
        next.delete('member')
      }),
    selectedMemberId: searchParams.get('member'),
    openMember: (membershipId: string) => update((next) => next.set('member', membershipId)),
    closeMember: () => update((next) => next.delete('member'), true),
  }
}
