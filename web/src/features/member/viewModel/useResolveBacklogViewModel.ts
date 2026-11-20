import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import type { PersonRef } from '@/api/commonTypes'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import type { BacklogItem } from '../model/backlogTypes'
import { memberRepository } from '../model/memberRepository'
import { resolvedToast, resolveSheetText } from './backlogDisplay'
import { memberQueryKeys } from './memberQueryKeys'
import { useRefreshMemberData } from './useRefreshMemberData'

/** FR-MEM-09: chọn người nhận việc, người nghiệm thu hoặc người giữ chức trong số ứng viên máy chủ trả về. */
export function useResolveBacklogViewModel(item: BacklogItem, action: 'REASSIGN' | 'APPOINT', onDone: () => void) {
  const { clubId } = useCurrentClub()
  const refresh = useRefreshMemberData(clubId)
  const [keyword, setKeyword] = useState('')
  const debounced = useDebouncedValue(keyword.trim(), 300)
  const [selected, setSelected] = useState<PersonRef | null>(null)
  const candidates = useQuery({
    queryKey: memberQueryKeys.backlogCandidates(clubId, item.id, debounced),
    queryFn: () => memberRepository.backlogCandidates(clubId, item.id, debounced || undefined),
    placeholderData: keepPreviousData,
  })

  const mutation = useMutation({
    mutationFn: (person: PersonRef) => memberRepository.resolveBacklog(clubId, item.id, { action, userId: person.id, version: item.version }),
    meta: { silentError: true },
    onSuccess: (_saved, person) => {
      toast.success(resolvedToast(item, action, person.fullName))
      onDone()
      return refresh()
    },
    onError: (error) => {
      // Mục đã đổi, đã có người xử lý hoặc quyền đổi: tải lại để thấy trạng thái mới, không gửi đè (NFR-REL-03).
      if (isConflict(error) || (error instanceof ApiError && (error.status === 422 || error.status === 403))) void refresh()
    },
  })

  const error = mutation.error
  const conflict = isConflict(error)
  const text = resolveSheetText(item, action)
  return {
    ...text,
    keyword,
    setKeyword,
    candidates: candidates.data ?? [],
    candidatesLoading: candidates.isPending,
    candidatesError: candidates.error ? getErrorMessage(candidates.error) : null,
    retryCandidates: () => void candidates.refetch(),
    selected,
    select: (person: PersonRef) => setSelected(person),
    canSubmit: selected !== null && !conflict,
    submit: () => selected && mutation.mutate(selected),
    pending: mutation.isPending,
    conflict,
    /** Lỗi theo ô (người được chọn không hợp lệ) nêu đúng lý do máy chủ trả về. */
    errorMessage: error && !conflict ? (error instanceof ApiError && error.fieldErrors[0] ? error.fieldErrors[0].message : getErrorMessage(error)) : null,
  }
}
