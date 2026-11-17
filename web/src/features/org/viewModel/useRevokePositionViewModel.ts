import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { useRefreshMemberData } from '@/features/member/viewModel/useRefreshMemberData'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { formatDate, parseVnDate, toVnDateKey } from '@/shared/format/formatDate'
import { orgRepository } from '../model/orgRepository'
import type { Position } from '../model/orgTypes'
import { revokePositionSchema, type RevokePositionValues } from './assignPositionSchema'
import { positionTitle } from './orgDisplay'

const SERVER_FIELDS = ['reason'] as const

/** FR-ORG-03: kết thúc chức vụ trước hạn kèm lý do và ngày chuyển giao; máy chủ chặn thu hồi Chủ nhiệm cuối cùng (BR-ORG-02). */
export function useRevokePositionViewModel(position: Position, onDone: () => void) {
  const { clubId } = useCurrentClub()
  const refresh = useRefreshMemberData(clubId)
  // Lấy ngày hôm nay một lần khi mở form, không gọi Date trong lúc render.
  const [openedAt] = useState(() => new Date())
  const today = toVnDateKey(openedAt)
  // Chức vụ giữ tới khi bàn giao xong thì chưa có hạn, chọn ngày chuyển giao nào từ hôm nay cũng được.
  const lastDay = position.untilHandover ? null : position.endOn
  const schema = useMemo(() => revokePositionSchema(today, lastDay), [today, lastDay])
  const form = useForm<RevokePositionValues>({ resolver: zodResolver(schema), defaultValues: { reason: '', handoverDate: formatDate(openedAt) } })
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)

  const mutation = useMutation({
    mutationFn: (values: RevokePositionValues) =>
      orgRepository.revoke(clubId, position.id, { reason: values.reason, handoverOn: parseVnDate(values.handoverDate) ?? '', version: position.version }),
    meta: { silentError: true },
    onSuccess: async () => {
      await refresh()
      toast.success(`Đã thu hồi chức vụ ${positionTitle(position)} của ${position.holder.fullName}.`)
      onDone()
    },
    onError: (error) => {
      // 409: chức vụ vừa được người khác cập nhật; đóng hộp thoại và tải lại, không ghi đè (NFR-REL-03).
      if (isConflict(error)) {
        toast.error(getErrorMessage(error))
        void refresh()
        onDone()
        return
      }
      setFieldErrorsApplied(applyServerFieldErrors(error, form.setError, SERVER_FIELDS, { handoverOn: 'handoverDate' }))
    },
  })

  const error = mutation.error
  return {
    form,
    title: positionTitle(position),
    holderName: position.holder.fullName,
    lastDay,
    untilHandover: position.untilHandover,
    upcomingFrom: position.status === 'UPCOMING' ? position.startOn : null,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    errorMessage: error && !(fieldErrorsApplied && error instanceof ApiError) ? getErrorMessage(error) : null,
  }
}
