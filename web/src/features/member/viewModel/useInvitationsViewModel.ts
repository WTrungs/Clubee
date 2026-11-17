import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { useClampPage } from '@/shared/hooks/useClampPage'
import { memberRepository } from '../model/memberRepository'
import type { Invitation, InvitationStatus } from '../model/invitationTypes'
import { invitationUrl } from './invitationDisplay'
import { invitationEmailSchema, type InvitationEmailValues } from './invitationSchema'
import { memberQueryKeys } from './memberQueryKeys'

const PAGE_SIZE = 20
export type CopySource = 'created' | 'list'

/** FR-MEM-01: người quản lý thành viên tạo liên kết mời, mời qua email, xem và thu hồi lời mời. */
export function useInvitationsViewModel(open: boolean) {
  const queryClient = useQueryClient()
  const { clubId, club } = useCurrentClub()
  const [status, setStatus] = useState<InvitationStatus | ''>('')
  const [page, setPage] = useState(0)
  const [created, setCreated] = useState<Invitation | null>(null)
  // Trình duyệt chặn clipboard (ví dụ trang không chạy https) thì hiện ô chỉ đọc ngay dưới nút vừa bấm để người dùng tự chép.
  const [copyFallback, setCopyFallback] = useState<{ source: CopySource; token: string; url: string } | null>(null)
  const [revoking, setRevoking] = useState<Invitation | null>(null)
  const [conflict, setConflict] = useState(false)
  const [emailErrorApplied, setEmailErrorApplied] = useState(false)
  const query = { status: status || undefined, page, size: PAGE_SIZE }

  const list = useQuery({
    queryKey: memberQueryKeys.invitations(clubId, query),
    queryFn: () => memberRepository.invitations(clubId, query),
    enabled: open,
    placeholderData: keepPreviousData,
  })
  useClampPage(page, list.data?.totalPages, setPage)
  const refreshList = () => queryClient.invalidateQueries({ queryKey: memberQueryKeys.invitationLists(clubId) })

  const emailForm = useForm<InvitationEmailValues>({ resolver: zodResolver(invitationEmailSchema), defaultValues: { email: '' } })

  const create = useMutation({
    mutationFn: (email: string | null) => memberRepository.createInvitation(clubId, email === null ? { kind: 'LINK' } : { kind: 'EMAIL', email }),
    meta: { silentError: true },
    onMutate: () => setEmailErrorApplied(false),
    onSuccess: async (invitation) => {
      setCreated(invitation)
      setCopyFallback(null)
      await refreshList()
      if (invitation.kind === 'EMAIL') {
        emailForm.reset({ email: '' })
        toast.success(`Đã mời ${invitation.email ?? ''}.`)
      } else {
        toast.success('Đã tạo liên kết mời.')
      }
    },
    onError: (error) => {
      setEmailErrorApplied(applyServerFieldErrors(error, emailForm.setError, ['email']))
      // Lời mời trùng có thể do người khác vừa tạo: tải lại để thấy và thu hồi được.
      if (isConflict(error)) void refreshList()
    },
  })

  const revoke = useMutation({
    mutationFn: (invitation: Invitation) => memberRepository.revokeInvitation(clubId, invitation.id, invitation.version),
    meta: { silentError: true },
    onSuccess: async (revoked) => {
      setRevoking(null)
      if (created?.id === revoked.id) setCreated(null)
      await refreshList()
      toast.success('Đã thu hồi lời mời.')
    },
    onError: (error) => {
      setRevoking(null)
      if (isConflict(error)) setConflict(true)
      else toast.error(getErrorMessage(error))
      // Trạng thái có thể vừa đổi (hết hạn, đã dùng), nên tải lại để thẻ hiện đúng.
      void refreshList()
    },
  })

  return {
    clubName: club.name,
    status,
    setStatus: (next: InvitationStatus | '') => {
      setStatus(next)
      setPage(0)
    },
    invitations: list.data?.content ?? [],
    loading: list.isPending,
    error: list.error,
    refetch: () => void list.refetch(),
    page: list.data?.page ?? 0,
    totalPages: list.data?.totalPages ?? 0,
    totalElements: list.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
    created,
    createLink: () => {
      if (!create.isPending) create.mutate(null)
    },
    emailForm,
    submitEmail: emailForm.handleSubmit((values) => create.mutate(values.email.trim())),
    creating: create.isPending,
    creatingKind: create.isPending ? (create.variables === null ? 'LINK' : 'EMAIL') : null,
    createError: create.error && !emailErrorApplied ? getErrorMessage(create.error) : null,
    copyFallback,
    /** Ô dự phòng thuộc đúng chỗ đã bấm: khối lời mời vừa tạo hoặc một dòng trong danh sách. */
    copyFallbackFor: (source: CopySource, token: string) => (copyFallback?.source === source && copyFallback.token === token ? copyFallback.url : null),
    copy: async (token: string, source: CopySource) => {
      const url = invitationUrl(token)
      try {
        await navigator.clipboard.writeText(url)
        setCopyFallback(null)
        toast.success('Đã sao chép liên kết mời.')
      } catch {
        setCopyFallback({ source, token, url })
      }
    },
    revoking,
    askRevoke: (invitation: Invitation) => {
      if (!revoke.isPending) setRevoking(invitation)
    },
    cancelRevoke: () => {
      if (!revoke.isPending) setRevoking(null)
    },
    confirmRevoke: () => {
      if (revoking) revoke.mutate(revoking)
    },
    revokePending: revoke.isPending,
    conflict,
    reloadAfterConflict: () => {
      setConflict(false)
      void refreshList()
    },
    /** Đóng sheet thì bỏ lời mời vừa tạo, ô chép dự phòng và email đang nhập. */
    reset: () => {
      setCreated(null)
      setCopyFallback(null)
      setConflict(false)
      emailForm.reset({ email: '' })
      create.reset()
    },
  }
}

export type InvitationsViewModel = ReturnType<typeof useInvitationsViewModel>
