import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { getErrorMessage, isConflict } from '@/api/apiError'
import { useClampPage } from '@/shared/hooks/useClampPage'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { adminRepository } from '../model/adminRepository'
import type { AdminAccount, AdminAccountQuery } from '../model/adminTypes'
import { ADMIN_EMAIL_QUERY_MIN } from './adminDisplay'
import { adminQueryKeys } from './adminQueryKeys'

const PAGE_SIZE = 20

export type AdminAccountDialog = { account: AdminAccount; mode: 'LOCK' | 'UNLOCK' | 'SEND_PASSWORD_RESET' }

/** FR-ACC-09: tìm tài khoản theo email rồi khóa, mở khóa hoặc gửi lại liên kết đặt mật khẩu; 409 thì báo và tải lại. */
export function useAdminAccountsViewModel() {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const debouncedEmail = useDebouncedValue(email.trim().toLowerCase(), 300)
  const [page, setPage] = useState(0)
  const [dialog, setDialog] = useState<AdminAccountDialog | null>(null)
  // Hộp thoại vừa đóng vẫn cần chữ cũ trong lúc chạy hiệu ứng đóng.
  const [shownDialog, setShownDialog] = useState<AdminAccountDialog | null>(null)
  const [conflict, setConflict] = useState(false)
  const ready = debouncedEmail.length >= ADMIN_EMAIL_QUERY_MIN
  const query: AdminAccountQuery = { email: debouncedEmail, page, size: PAGE_SIZE }

  const accounts = useQuery({
    queryKey: adminQueryKeys.accounts(query),
    queryFn: () => adminRepository.accounts(query),
    enabled: ready,
    placeholderData: keepPreviousData,
  })
  useClampPage(page, accounts.data?.totalPages, setPage)
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: adminQueryKeys.accountLists }), queryClient.invalidateQueries({ queryKey: adminQueryKeys.metrics })])

  const onError = (error: unknown) => {
    setDialog(null)
    if (isConflict(error)) setConflict(true)
    else toast.error(getErrorMessage(error))
    void refresh()
  }

  const transition = useMutation({
    mutationFn: ({ account, action, reason }: { account: AdminAccount; action: 'LOCK' | 'UNLOCK'; reason: string }) =>
      adminRepository.transition(account.id, { action, reason, version: account.version }),
    meta: { silentError: true },
    onSuccess: async (saved, { action }) => {
      setDialog(null)
      await refresh()
      toast.success(action === 'LOCK' ? `Đã khóa tài khoản ${saved.email}.` : `Đã mở khóa tài khoản ${saved.email}.`)
    },
    onError,
  })

  const sendReset = useMutation({
    mutationFn: (account: AdminAccount) => adminRepository.sendPasswordReset(account.id),
    meta: { silentError: true },
    onSuccess: (_, account) => {
      setDialog(null)
      toast.success(`Đã gửi liên kết đặt mật khẩu tới ${account.email}.`)
    },
    onError,
  })

  const pending = transition.isPending || sendReset.isPending
  return {
    email,
    setEmail: (value: string) => {
      setEmail(value)
      setPage(0)
    },
    /** Chưa đủ ký tự thì chưa tìm, để không liệt kê toàn bộ người dùng. */
    needsMoreInput: email.trim().length < ADMIN_EMAIL_QUERY_MIN,
    accounts: ready ? (accounts.data?.content ?? []) : [],
    loading: ready && accounts.isPending,
    /** Đang tìm theo từ khóa mới, danh sách đang hiện là kết quả cũ. */
    refreshing: accounts.isPlaceholderData,
    searched: ready && accounts.data !== undefined,
    error: ready ? accounts.error : null,
    refetch: () => void accounts.refetch(),
    page: accounts.data?.page ?? 0,
    totalPages: ready ? (accounts.data?.totalPages ?? 0) : 0,
    totalElements: ready ? (accounts.data?.totalElements ?? 0) : 0,
    pageSize: PAGE_SIZE,
    setPage,
    dialog,
    shownDialog,
    openDialog: (account: AdminAccount, mode: AdminAccountDialog['mode']) => {
      if (pending) return
      setDialog({ account, mode })
      setShownDialog({ account, mode })
    },
    closeDialog: () => {
      if (!pending) setDialog(null)
    },
    confirmTransition: (reason: string) => {
      if (dialog && dialog.mode !== 'SEND_PASSWORD_RESET') transition.mutate({ account: dialog.account, action: dialog.mode, reason })
    },
    confirmReset: () => {
      if (dialog?.mode === 'SEND_PASSWORD_RESET') sendReset.mutate(dialog.account)
    },
    pending,
    conflict,
    reloadAfterConflict: () => {
      setConflict(false)
      void refresh()
    },
  }
}

export type AdminAccountsViewModel = ReturnType<typeof useAdminAccountsViewModel>
