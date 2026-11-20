import { useId } from 'react'
import { useWatch } from 'react-hook-form'
import { Button } from '@/shared/ui/Button'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, Textarea } from '@/shared/ui/Input'
import { INTRODUCTION_MAX } from '../viewModel/joinRequestSchema'
import { useJoinRequestFormViewModel, type JoinTarget } from '../viewModel/useJoinRequestFormViewModel'

/** FR-MEM-02: gửi yêu cầu gia nhập kèm lời giới thiệu (và MSSV nếu CLB thu thập). */
export function JoinRequestDialog({ target, onClose }: { target: JoinTarget | null; onClose: () => void }) {
  const formId = useId()
  const vm = useJoinRequestFormViewModel(target, onClose)
  const close = () => {
    vm.reset()
    onClose()
  }
  const { register, formState, control } = vm.form
  const introduction = useWatch({ control, name: 'introduction' })

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !vm.pending && close()}>
      {target && (
        <DialogContent
          title={`Xin gia nhập ${target.name}`}
          description="Ban chủ nhiệm sẽ xem lời giới thiệu và duyệt yêu cầu. Trong lúc chờ, CLB hiện ở mục CLB của tôi với trạng thái Chờ duyệt."
          footer={
            <>
              <Button variant="ghost" onClick={close} disabled={vm.pending}>
                Hủy bỏ
              </Button>
              <Button type="submit" form={formId} loading={vm.pending}>
                Gửi yêu cầu
              </Button>
            </>
          }
        >
          <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5">
            <FormField
              label="Lời giới thiệu"
              required
              error={formState.errors.introduction?.message}
              hint={`${introduction.trim().length}/${INTRODUCTION_MAX} ký tự. Bạn biết gì về CLB, muốn tham gia hoạt động nào.`}
            >
              <Textarea rows={5} maxLength={INTRODUCTION_MAX} {...register('introduction')} />
            </FormField>
            {target.collectsStudentId && (
              <FormField label="MSSV" required error={formState.errors.studentId?.message} hint="CLB này có thu thập MSSV; chỉ ban chủ nhiệm xem được.">
                <Input autoComplete="off" maxLength={20} {...register('studentId')} />
              </FormField>
            )}
            <FormAlert message={vm.errorMessage} />
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}
