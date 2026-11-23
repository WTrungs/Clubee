import { useId } from 'react'
import { Controller } from 'react-hook-form'
import { Button } from '@/shared/ui/Button'
import { FileInput } from '@/shared/ui/FileInput'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, NativeSelect, Textarea } from '@/shared/ui/Input'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import type { DocumentScopeOption } from '../model/documentTypes'
import { DOCUMENT_TAGS_MAX, scopeKeyOf, visibilityOptions } from '../viewModel/documentFormSchema'
import { useUploadDocumentViewModel } from '../viewModel/useDocumentsViewModel'

interface UploadDocumentSheetProps {
  clubId: string
  scopes: DocumentScopeOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** FR-DOC-01: tải tài liệu lên CLB, ban hoặc sự kiện mà người dùng có quyền Quản lý tài liệu. */
export function UploadDocumentSheet({ clubId, scopes, open, onOpenChange }: UploadDocumentSheetProps) {
  const formId = useId()
  const vm = useUploadDocumentViewModel(clubId, scopes, () => onOpenChange(false))
  const { register, control, formState } = vm.form
  const errors = formState.errors
  const close = () => {
    vm.reset()
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (vm.pending) return
        if (!next) vm.reset()
        onOpenChange(next)
      }}
    >
      <SheetContent
        title="Tải tài liệu lên"
        description="Tài liệu gắn với nơi sở hữu và nhiệm kỳ; người tải lên rời CLB thì tài liệu vẫn còn."
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={vm.pending}>
              Hủy bỏ
            </Button>
            <Button type="submit" form={formId} loading={vm.pending}>
              Tải lên
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5 p-5">
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
          <FormField label="Tên tài liệu" required error={errors.title?.message}>
            <Input placeholder="Ví dụ: Biên bản họp ban chủ nhiệm tháng 11" maxLength={150} {...register('title')} />
          </FormField>
          <FormField label="Mô tả" error={errors.description?.message}>
            <Textarea maxLength={1000} {...register('description')} />
          </FormField>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FormField label="Nơi sở hữu" required error={errors.scopeKey?.message}>
              <NativeSelect {...register('scopeKey')}>
                {scopes.map((scope) => (
                  <option key={scopeKeyOf(scope)} value={scopeKeyOf(scope)}>
                    {scope.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Nhiệm kỳ" error={errors.termId?.message} hint="Mặc định nhiệm kỳ hiện tại.">
              <NativeSelect disabled={vm.terms.length === 0} {...register('termId')}>
                {vm.terms.length === 0 && <option value="">Chưa có nhiệm kỳ nào</option>}
                {vm.terms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <FormField label="Nhãn" error={errors.tagsText?.message} hint={`Cách nhau bằng dấu phẩy, tối đa ${DOCUMENT_TAGS_MAX} nhãn.`}>
            <Input placeholder="Ví dụ: biên bản, họp" {...register('tagsText')} />
          </FormField>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Ai được xem</legend>
            {visibilityOptions.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                <input type="radio" value={option.value} className="mt-1 size-4 accent-primary" {...register('visibility')} />
                <span>
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <FormAlert message={vm.errorMessage} />
        </form>
      </SheetContent>
    </Sheet>
  )
}
