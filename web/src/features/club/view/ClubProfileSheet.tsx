import { ImageUp } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Controller } from 'react-hook-form'
import { ClubMonogram } from '@/features/account/view/ClubMonogram'
import { IMAGE_ACCEPT } from '@/shared/lib/validateImageFile'
import { Button } from '@/shared/ui/Button'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, Textarea } from '@/shared/ui/Input'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Switch } from '@/shared/ui/Switch'
import { useCurrentClub } from '../viewModel/clubContext'
import { CLUB_DESCRIPTION_MAX, CLUB_FIELD_MAX, CLUB_FIELD_SUGGESTIONS, CLUB_NAME_MAX, CLUB_RULES_MAX, CLUB_SHORT_NAME_MAX } from '../viewModel/clubSchemas'
import { useClubLogoUpload, useClubProfileViewModel } from '../viewModel/useClubProfileViewModel'

function LogoField() {
  const { club } = useCurrentClub()
  const logo = useClubLogoUpload()
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Logo</p>
      <div className="flex items-center gap-4">
        <ClubMonogram clubId={club.id} shortName={club.shortName} logoUrl={club.logoUrl} className="size-16 rounded-2xl text-base" />
        <div className="min-w-0 space-y-1">
          <input
            ref={inputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            aria-label="Chọn logo CLB"
            tabIndex={-1}
            className="sr-only"
            onChange={(event) => {
              logo.upload(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <Button type="button" variant="outline" size="sm" loading={logo.pending} onClick={() => inputRef.current?.click()}>
            <ImageUp aria-hidden />
            Đổi logo
          </Button>
          <p className="text-xs text-muted-foreground">JPG hoặc PNG, tối đa 15 MB. Lưu ngay khi chọn.</p>
        </div>
      </div>
      <FormAlert message={logo.errorMessage} />
    </div>
  )
}

function ClubProfileForm({ onClose, onPendingChange }: { onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const fieldListId = useId()
  const switchId = useId()
  const { club } = useCurrentClub()
  const vm = useClubProfileViewModel(onClose)
  const { register, formState, control } = vm.form
  const errors = formState.errors
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])

  return (
    <SheetContent
      title="Sửa hồ sơ CLB"
      description={`CLB hiện hành: ${club.name}. Tên, logo, lĩnh vực, mô tả và liên hệ hiện công khai ở danh bạ.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending} disabled={vm.conflict}>
            Lưu thay đổi
          </Button>
        </>
      }
    >
      <div className="space-y-5 p-5">
        <LogoField />
        <ConflictBanner show={vm.conflict} onReload={() => void vm.reload()} message="Hồ sơ CLB vừa được người khác sửa. Tải lại để xem bản mới nhất rồi sửa lại." />
        <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5">
          <FormField label="Tên CLB" required error={errors.name?.message}>
            <Input maxLength={CLUB_NAME_MAX} {...register('name')} />
          </FormField>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FormField label="Tên viết tắt" required error={errors.shortName?.message}>
              <Input maxLength={CLUB_SHORT_NAME_MAX} {...register('shortName')} />
            </FormField>
            <FormField label="Lĩnh vực" required error={errors.field?.message}>
              <Input list={fieldListId} maxLength={CLUB_FIELD_MAX} {...register('field')} />
            </FormField>
            <datalist id={fieldListId}>
              {CLUB_FIELD_SUGGESTIONS.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </datalist>
          </div>
          <FormField label="Mô tả" required error={errors.description?.message}>
            <Textarea rows={4} maxLength={CLUB_DESCRIPTION_MAX} {...register('description')} />
          </FormField>
          <fieldset className="space-y-4">
            <legend className="text-sm font-bold">Liên hệ công khai</legend>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FormField label="Email" error={errors.contactEmail?.message}>
                <Input type="email" inputMode="email" placeholder="clb@vidu.com" {...register('contactEmail')} />
              </FormField>
              <FormField label="Số điện thoại" error={errors.contactPhone?.message}>
                <Input type="tel" inputMode="tel" placeholder="0901234567" {...register('contactPhone')} />
              </FormField>
            </div>
            <FormField label="Trang web hoặc fanpage" error={errors.contactUrl?.message} hint="Bắt đầu bằng http:// hoặc https://.">
              <Input type="url" inputMode="url" placeholder="https://" {...register('contactUrl')} />
            </FormField>
          </fieldset>
          <FormField label="Nội quy" error={errors.rules?.message} hint="Văn bản thuần, mỗi điều một dòng. Chỉ thành viên CLB xem được.">
            <Textarea rows={6} maxLength={CLUB_RULES_MAX} {...register('rules')} />
          </FormField>
          <Controller
            control={control}
            name="collectsStudentId"
            render={({ field }) => (
              <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
                <label htmlFor={switchId} className="min-w-0 space-y-1">
                  <span className="block text-sm font-semibold">Thu thập MSSV</span>
                  <span className="block text-xs text-muted-foreground">
                    Bật thì người gửi yêu cầu gia nhập phải nhập MSSV; chỉ ban chủ nhiệm xem được. Tắt thì MSSV đã có bị ẩn.
                  </span>
                </label>
                <Switch id={switchId} checked={field.value} onCheckedChange={field.onChange} onBlur={field.onBlur} />
              </div>
            )}
          />
          <FormAlert message={vm.errorMessage} />
        </form>
      </div>
    </SheetContent>
  )
}

/** FR-CLB-02: chỉ mở khi máy chủ trả `EDIT_CLUB`. */
export function ClubProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Không đóng khi đang chờ máy chủ trả lời (NFR-REL-01).
  const [pending, setPending] = useState(false)
  return (
    <Sheet open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      {open && <ClubProfileForm onClose={onClose} onPendingChange={setPending} />}
    </Sheet>
  )
}
