import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { memberRepository } from '../model/memberRepository'
import type { MemberSummary } from '../model/memberTypes'
import { transferErrorLines, transferSummary } from './memberDisplay'
import { memberQueryKeys } from './memberQueryKeys'
import { useRefreshMemberData } from './useRefreshMemberData'

export type TransferMember = Pick<MemberSummary, 'membershipId' | 'person' | 'version'>

/** FR-MEM-10: chuyển ban chính một hoặc nhiều người; chỉ chọn được ban đang hoạt động khác ban hiện tại. */
export function useTransferDepartmentViewModel(fromDepartmentId: string | null, onDone: () => void) {
  const { clubId } = useCurrentClub()
  const refresh = useRefreshMemberData(clubId)
  const facets = useQuery({ queryKey: memberQueryKeys.facets(clubId), queryFn: () => memberRepository.facets(clubId) })
  const [errorLines, setErrorLines] = useState<string[]>([])

  const mutation = useMutation({
    mutationFn: ({ toDepartmentId, members }: { toDepartmentId: string; members: TransferMember[] }) =>
      memberRepository.transferDepartment(clubId, { toDepartmentId, members: members.map(({ membershipId, version }) => ({ membershipId, version })) }),
    meta: { silentError: true },
    onMutate: () => setErrorLines([]),
    onSuccess: async (result) => {
      await refresh()
      toast.success(transferSummary(result.members.map((member) => member.person.fullName), result.toDepartment.name))
      onDone()
    },
    onError: (error) => {
      // Danh sách đã cũ thì đóng và tải lại để người dùng chọn lại trên dữ liệu mới (NFR-REL-03).
      if (isConflict(error)) {
        toast.error(getErrorMessage(error))
        void refresh()
        onDone()
        return
      }
      setErrorLines(transferErrorLines(error))
    },
  })

  const departments = (facets.data?.departments ?? []).filter((department) => !department.closed && department.id !== fromDepartmentId)
  return {
    departments,
    /** Không có ban nào khác để chuyển sang; ô chọn sẽ rỗng nên cần nói rõ lý do. */
    noOtherDepartment: facets.isSuccess && departments.length === 0,
    departmentsLoading: facets.isPending,
    departmentsError: facets.error ? getErrorMessage(facets.error) : null,
    retryDepartments: () => void facets.refetch(),
    submit: (toDepartmentId: string, members: TransferMember[]) => {
      if (!mutation.isPending) mutation.mutate({ toDepartmentId, members })
    },
    pending: mutation.isPending,
    errorLines,
    clearError: () => setErrorLines([]),
  }
}
