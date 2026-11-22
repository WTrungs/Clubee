import { useId } from 'react'
import { Controller } from 'react-hook-form'
import { REASON_MAX } from '@/shared/lib/reasonRules'
import { Button } from '@/shared/ui/Button'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FileInput } from '@/shared/ui/FileInput'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Textarea } from '@/shared/ui/Input'
import type { DocumentDetail } from '../model/documentTypes'
import { useUploadVersionViewModel } from '../viewModel/useDocumentsViewModel'

interface UploadVersionDialogProps {
  clubId: string
  document: DocumentDetail | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** FR-DOC-03: tải phiên bản mới; các bản cũ vẫn xem và tải lại được ở sheet chi tiết. */
export function UploadVersionDialog({ clubId, document, open, onOpenChange }: UploadVersionDialogProps) {
  const formId = useId()
  const vm = useUploadVersionViewModel(clubId, document, () => onOpenChange(false))
  const { register, control, formState } = vm.form
  const errors = formState.errors

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (vm.pending) return
        if (!next) vm.reset()
        onOpenChange(next)
      }}
    >
      <DialogContent
        title={`Tải bản ${vm.nextNumber}`}
        description={document ? `“${document.title}”. Bản hiện hành thành bản cũ, vẫn tải lại được.` : undefined}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={vm.pending}
              onClick={() => {
                vm.reset()
                onOpenChange(false)
              }}
            >
              Hủy bỏ
            </Button>
            <Button type="submit" form={formId} loading={vm.pending}>
              Tải lên
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={vm.submit} className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold">
              Tệp <span className="text-destructive">*</span>
            </p>
            <Controller
              control={control}
              name="file"
              render={({ field }) => (
                <FileInput files={field.value ? [field.value] : []} onChange={(files) => field.onChange(files.at(-1) ?? null)} maxFiles={1} label="Chọn tệp" disabled={vm.pending} />
              )}
            />
            {errors.file?.message && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {errors.file.message}
              </p>
            )}
          </div>
          <FormField label="Ghi chú thay đổi" required error={errors.note?.message} hint="Ví dụ: sửa số liệu mục 3, thêm chữ ký.">
            <Textarea maxLength={REASON_MAX} {...register('note')} />
          </FormField>
          <FormAlert message={vm.errorMessage} />
        </form>
      </DialogContent>
    </Dialog>
  )
}
