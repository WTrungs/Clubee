import { ImageUp } from 'lucide-react'
import { useId, useRef } from 'react'
import { IMAGE_ACCEPT } from '@/shared/lib/validateImageFile'
import { NEWS_BODY_MAX, NEWS_TITLE_MAX } from '@/shared/lib/newsRules'
import { Button } from '@/shared/ui/Button'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, Textarea } from '@/shared/ui/Input'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import type { NewsDetail } from '../model/newsTypes'
import { useNewsEditorViewModel } from '../viewModel/useNewsViewModels'
import { NewsCover } from './NewsCover'

interface NewsEditorSheetProps {
  open: boolean
  editing: NewsDetail | null
  onClose: () => void
  onSaved: (saved: NewsDetail) => void
}

/** FR-CLB-06: tiêu đề, nội dung chữ thuần, một ảnh bìa JPG hoặc PNG. Tin mới lưu thành Nháp. */
export function NewsEditorSheet({ open, editing, onClose, onSaved }: NewsEditorSheetProps) {
  const vm = useNewsEditorViewModel(open, editing, onSaved)
  const formId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const { register, formState } = vm.form
  return (
    <Sheet open={open} onOpenChange={(next) => !next && !vm.pending && onClose()}>
      <SheetContent
        title={vm.editing ? 'Sửa tin' : 'Viết tin'}
        description={vm.editing ? undefined : 'Tin mới được lưu thành Nháp; xuất bản sau khi xem lại.'}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
              Hủy bỏ
            </Button>
            <Button type="submit" form={formId} loading={vm.pending} disabled={vm.conflict}>
              {vm.editing ? 'Lưu thay đổi' : 'Lưu nháp'}
            </Button>
          </div>
        }
      >
        <form id={formId} noValidate onSubmit={vm.submit} className="space-y-4 p-5">
          <ConflictBanner show={vm.conflict} onReload={vm.reload} message="Tin vừa được người khác sửa. Tải lại để xem bản mới nhất." />
          <div className="space-y-2">
            <p className="text-sm font-semibold">Ảnh bìa</p>
            <NewsCover imageUrl={vm.imageUrl} className="rounded-xl" />
            <input
              ref={inputRef}
              type="file"
              accept={IMAGE_ACCEPT}
              aria-label="Chọn ảnh bìa"
              tabIndex={-1}
              className="sr-only"
              onChange={(event) => {
                vm.pickImage(event.target.files?.[0])
                event.target.value = ''
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <ImageUp aria-hidden />
              {vm.imageUrl ? 'Đổi ảnh' : 'Chọn ảnh'}
            </Button>
            <p className="text-xs text-muted-foreground">JPG hoặc PNG, tối đa 15 MB. Ảnh lưu cùng lúc với tin.</p>
            <FormAlert message={vm.imageError} />
          </div>
          <FormField label="Tiêu đề" required error={formState.errors.title?.message}>
            <Input maxLength={NEWS_TITLE_MAX} {...register('title')} />
          </FormField>
          <FormField label="Nội dung" required error={formState.errors.body?.message} hint="Chữ thuần; xuống dòng được giữ nguyên.">
            <Textarea rows={10} maxLength={NEWS_BODY_MAX} {...register('body')} />
          </FormField>
          <FormAlert message={vm.errorMessage} />
        </form>
      </SheetContent>
    </Sheet>
  )
}
