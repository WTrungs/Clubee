import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { memberRepository } from '@/features/member/model/memberRepository'
import { memberQueryKeys } from '@/features/member/viewModel/memberQueryKeys'
import { useRefreshMemberData } from '@/features/member/viewModel/useRefreshMemberData'
import { isTermOverdue } from '@/features/term/viewModel/termDisplay'
import { useNow } from '@/shared/hooks/useNow'
import { orgRepository } from '../model/orgRepository'
import type { Department, DepartmentStatus, Position } from '../model/orgTypes'
import { orgQueryKeys } from './orgQueryKeys'

export type OrgTab = 'chart' | 'positions' | 'permissions'

export interface AssignPreset {
  role?: Position['role']
  departmentId?: string
  userId?: string
  userName?: string
}

/** Màn Cơ cấu: ban chủ nhiệm, ban chuyên môn và người phụ trách (FR-ORG-01, 02, 03). Ban đang chọn nằm trên URL. */
export function useOrgStructureViewModel() {
  const { clubId, club } = useCurrentClub()
  const refresh = useRefreshMemberData(clubId)
  const now = useNow()
  const [searchParams, setSearchParams] = useSearchParams()
  const [departmentForm, setDepartmentForm] = useState<{ mode: 'create' } | { mode: 'edit'; department: Department } | null>(null)
  const [closing, setClosing] = useState<Department | null>(null)
  const [assign, setAssign] = useState<AssignPreset | null>(null)
  const [revoking, setRevoking] = useState<Position | null>(null)
  const [transferringId, setTransferringId] = useState<string | null>(null)

  // Trạng thái lọc và ban đang chọn cùng nằm trên URL để liên kết tới ban đã đóng vẫn mở đúng chi tiết.
  const status: DepartmentStatus = searchParams.get('status') === 'CLOSED' ? 'CLOSED' : 'ACTIVE'
  const departments = useQuery({ queryKey: orgQueryKeys.departments(clubId, status), queryFn: () => orgRepository.departments(clubId, status) })
  const board = useQuery({ queryKey: orgQueryKeys.positions(clubId, { scopeId: clubId }), queryFn: () => orgRepository.positions(clubId, { scopeId: clubId }) })
  const selectedId = searchParams.get('department')
  const selected = departments.data?.find((department) => department.id === selectedId) ?? null
  const members = useQuery({
    queryKey: memberQueryKeys.list(clubId, { departmentId: selected?.id, size: 50 }),
    queryFn: () => memberRepository.list(clubId, { departmentId: selected?.id, size: 50 }),
    enabled: selected !== null && selected.status === 'ACTIVE',
  })

  const close = useMutation({
    mutationFn: ({ department, reason }: { department: Department; reason: string }) =>
      orgRepository.closeDepartment(clubId, department.id, { action: 'CLOSE', reason, version: department.version }),
    meta: { silentError: true },
    onSuccess: async (closed) => {
      await refresh()
      setClosing(null)
      toast.success(`Đã đóng ban ${closed.name}. Ban vẫn tra cứu được ở mục Đã đóng.`)
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      if (isConflict(error)) {
        setClosing(null)
        void refresh()
      }
    },
  })

  const canViewPermissions = club.allowedActions.includes('VIEW_PERMISSIONS')
  const tabParam = searchParams.get('tab')
  const tab: OrgTab = tabParam === 'positions' ? 'positions' : tabParam === 'permissions' && canViewPermissions ? 'permissions' : 'chart'

  const updateParams = (change: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams)
    change(next)
    setSearchParams(next, { replace: true })
  }
  const select = (departmentId: string | null) =>
    updateParams((next) => {
      if (departmentId) next.set('department', departmentId)
      else next.delete('department')
    })

  return {
    clubId,
    clubName: club.name,
    /** Tab nằm trên URL để trang Nhiệm kỳ mở thẳng tab Chức vụ (FR-ORG-06); tab Phân quyền chỉ cho ban chủ nhiệm (FR-ORG-05). */
    tab,
    canViewPermissions,
    setTab: (value: string) =>
      updateParams((next) => {
        next.delete('department')
        if (value !== 'positions') {
          next.delete('term')
          next.delete('scope')
        }
        if (value === 'positions' || (value === 'permissions' && canViewPermissions)) next.set('tab', value)
        else next.delete('tab')
      }),
    term: club.currentTerm,
    canManage: club.allowedActions.includes('MANAGE_ORG'),
    /** Máy chủ không cho gán chức vụ thường trực mới khi đang bàn giao hoặc nhiệm kỳ đã quá ngày kết thúc. */
    canAssign: club.allowedActions.includes('ASSIGN_POSITION'),
    termOverdue: club.currentTerm !== null && isTermOverdue(club.currentTerm, new Date(now)),
    termsPath: `/clubs/${encodeURIComponent(clubId)}/terms`,
    status,
    setStatus: (value: DepartmentStatus) =>
      updateParams((next) => {
        if (value === 'CLOSED') next.set('status', 'CLOSED')
        else next.delete('status')
        next.delete('department')
      }),
    departments: departments.data ?? [],
    loading: departments.isPending,
    error: departments.error,
    refetch: () => void departments.refetch(),
    board: board.data?.content ?? [],
    boardLoading: board.isPending,
    boardError: board.error,
    selectedId,
    selected,
    select,
    members: members.data?.content ?? [],
    membersLoading: members.isPending && members.fetchStatus !== 'idle',
    membersError: members.error,
    refetchMembers: () => void members.refetch(),
    departmentForm,
    openCreateDepartment: () => setDepartmentForm({ mode: 'create' }),
    openEditDepartment: (department: Department) => setDepartmentForm({ mode: 'edit', department }),
    closeDepartmentForm: () => setDepartmentForm(null),
    closing,
    requestClose: (department: Department) => {
      if (!close.isPending) setClosing(department)
    },
    cancelClose: () => {
      if (!close.isPending) setClosing(null)
    },
    confirmClose: (reason: string) => {
      if (closing) close.mutate({ department: closing, reason })
    },
    closePending: close.isPending,
    assign,
    openAssign: (preset: AssignPreset = {}) => setAssign(preset),
    closeAssign: () => setAssign(null),
    revoking,
    openRevoke: (position: Position) => setRevoking(position),
    closeRevoke: () => setRevoking(null),
    /** Chuyển thành viên của ban đang chọn (FR-MEM-10); số người lấy lại từ máy chủ sau mỗi lần chuyển. */
    transferring: selected !== null && selected.id === transferringId ? { id: selected.id, name: selected.name, memberCount: selected.memberCount } : null,
    openTransfer: (department: Department) => setTransferringId(department.id),
    closeTransfer: () => setTransferringId(null),
  }
}

export type OrgStructureViewModel = ReturnType<typeof useOrgStructureViewModel>
