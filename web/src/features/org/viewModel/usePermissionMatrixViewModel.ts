import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict, isForbidden } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { orgRepository } from '../model/orgRepository'
import type { PositionRole } from '../model/orgTypes'
import type { PermissionMatrix, PermissionMatrixCell } from '../model/permissionTypes'
import { orgQueryKeys } from './orgQueryKeys'
import { pendingChangeList, togglePending, type PendingChanges } from './permissionDisplay'

/** FR-ORG-05: sửa bảng phân quyền theo lô; lưu xong làm mới mọi truy vấn vì quyền đổi có hiệu lực ngay ở mọi màn. */
export function usePermissionMatrixViewModel(active: boolean) {
  const queryClient = useQueryClient()
  const { clubId } = useCurrentClub()
  const [pending, setPending] = useState<PendingChanges>({})
  const [role, setRole] = useState<PositionRole | null>(null)
  const [dialog, setDialog] = useState<'save' | 'reset' | null>(null)
  const [conflict, setConflict] = useState(false)
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null)
  const [historyPage, setHistoryPage] = useState(0)

  const matrix = useQuery({ queryKey: orgQueryKeys.permissionMatrix(clubId), queryFn: () => orgRepository.permissionMatrix(clubId), enabled: active })
  const history = useQuery({
    queryKey: orgQueryKeys.permissionChanges(clubId, historyPage),
    queryFn: () => orgRepository.permissionChanges(clubId, { page: historyPage, size: 20 }),
    enabled: active,
    placeholderData: keepPreviousData,
  })
  const data = matrix.data ?? null
  const changes = pendingChangeList(data, pending)

  const onSaved = async (saved: PermissionMatrix, message: string) => {
    // Ghi bản máy chủ vừa trả trước khi bỏ thay đổi chưa lưu để công tắc không nhảy về giá trị cũ.
    queryClient.setQueryData(orgQueryKeys.permissionMatrix(clubId), saved)
    setPending({})
    setDialog(null)
    setError(null)
    setConflict(false)
    toast.success(message)
    // Quyền vừa đổi ảnh hưởng nút, tab ở mọi màn của CLB.
    await queryClient.invalidateQueries()
  }
  const onFailed = (failure: unknown) => {
    setDialog(null)
    // Cảnh báo nằm đầu panel có thể ngoài khung nhìn khi người dùng đang ở thanh lưu dưới đáy.
    toast.error(getErrorMessage(failure))
    if (isConflict(failure)) {
      setError(null)
      setConflict(true)
      return
    }
    setError({ message: getErrorMessage(failure), details: failure instanceof ApiError ? failure.fieldErrors.map((fieldError) => fieldError.message) : [] })
    // Mất quyền chỉnh giữa chừng thì tải lại để công tắc khóa theo quyền mới.
    if (isForbidden(failure)) void matrix.refetch()
  }
  const save = useMutation({
    mutationFn: () => orgRepository.updatePermissionMatrix(clubId, { changes, version: data?.version ?? 0 }),
    meta: { silentError: true },
    onSuccess: (saved) => onSaved(saved, `Đã lưu ${changes.length} thay đổi quyền.`),
    onError: onFailed,
  })
  const reset = useMutation({
    mutationFn: () => orgRepository.resetPermissionMatrix(clubId, data?.version ?? 0),
    meta: { silentError: true },
    onSuccess: (saved) =>
      onSaved(saved, saved.changedFromDefault > 0 ? `Đã khôi phục mặc định; còn ${saved.changedFromDefault} ô thuộc chức vụ của bạn chưa đổi.` : 'Đã khôi phục bảng phân quyền về mặc định.'),
    onError: onFailed,
  })

  const roles = data?.roles ?? []
  const busy = save.isPending || reset.isPending
  return {
    matrix: data,
    loading: matrix.isPending,
    loadError: matrix.error,
    refetch: () => void matrix.refetch(),
    canEdit: data?.allowedActions.includes('EDIT') ?? false,
    canReset: data?.allowedActions.includes('RESET') ?? false,
    pending,
    changes,
    toggle: (cell: PermissionMatrixCell, enabled: boolean) => {
      if (cell.state === 'EDITABLE' && !busy) setPending((current) => togglePending(current, cell, enabled))
    },
    discard: () => {
      setPending({})
      setError(null)
    },
    /** Màn hẹp xem một chức vụ một lúc; mặc định là chức vụ đầu tiên. */
    role: role ?? roles[0] ?? null,
    setRole,
    dialog,
    openSave: () => setDialog('save'),
    openReset: () => {
      if (changes.length === 0) setDialog('reset')
    },
    closeDialog: () => {
      if (!busy) setDialog(null)
    },
    confirmSave: () => save.mutate(),
    confirmReset: () => reset.mutate(),
    busy,
    conflict,
    reloadAfterConflict: () => {
      setConflict(false)
      setPending({})
      void matrix.refetch()
    },
    error,
    history: history.data?.content ?? [],
    historyLoading: history.isPending,
    historyError: history.error,
    historyPage: history.data?.page ?? 0,
    historyTotalPages: history.data?.totalPages ?? 0,
    historyTotal: history.data?.totalElements ?? 0,
    setHistoryPage,
  }
}

export type PermissionMatrixViewModel = ReturnType<typeof usePermissionMatrixViewModel>
