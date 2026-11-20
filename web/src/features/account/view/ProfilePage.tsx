import { Camera, KeyRound, MailWarning } from 'lucide-react'
import { useRef } from 'react'
import { IMAGE_ACCEPT } from '@/shared/lib/validateImageFile'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/Card'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input } from '@/shared/ui/Input'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import type { Profile } from '../model/accountTypes'
import { useChangePasswordViewModel } from '../viewModel/useChangePasswordViewModel'
import { useAvatarUpload, useEmailChangeForm, useProfile, useProfileInfoForm } from '../viewModel/useProfileForms'
import { PasswordInput } from './PasswordInput'

function AvatarCard({ profile }: { profile: Profile }) {
  const vm = useAvatarUpload()
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ảnh đại diện</CardTitle>
        <CardDescription>Hiện với thành viên các CLB bạn tham gia.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 text-center">
        <Avatar name={profile.fullName} imageUrl={profile.avatarUrl} size="lg" className="size-24 text-3xl" />
        <div className="w-full min-w-0">
          <p className="truncate font-bold">{profile.fullName}</p>
          <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          aria-label="Chọn ảnh đại diện"
          tabIndex={-1}
          className="sr-only"
          onChange={(event) => {
            vm.upload(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <Button variant="outline" loading={vm.pending} onClick={() => inputRef.current?.click()}>
          <Camera aria-hidden />
          Đổi ảnh
        </Button>
        <p className="text-xs text-muted-foreground">JPG hoặc PNG, tối đa 15 MB.</p>
        <FormAlert message={vm.errorMessage} />
      </CardContent>
    </Card>
  )
}

function ProfileInfoCard({ profile, className }: { profile: Profile; className?: string }) {
  const vm = useProfileInfoForm(profile)
  const { register, formState } = vm.form
  const errors = formState.errors
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Thông tin cá nhân</CardTitle>
        <CardDescription>Dùng chung cho mọi CLB. SĐT và email chỉ ban chủ nhiệm và người cùng ban tổ chức sự kiện xem được.</CardDescription>
      </CardHeader>
      <CardContent>
        <ConflictBanner show={vm.conflict} onReload={() => void vm.reload()} message="Hồ sơ vừa được cập nhật ở nơi khác. Tải lại để xem bản mới nhất rồi sửa lại." />
        <form noValidate onSubmit={vm.submit} className="space-y-4">
          {/* Khóa ô khi đang lưu để phần gõ thêm không bị mất lúc form nạp lại bản đã lưu. */}
          <fieldset disabled={vm.pending} className="space-y-4">
            <FormField label="Họ và tên" required error={errors.fullName?.message}>
              <Input autoComplete="name" {...register('fullName')} />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Số điện thoại" error={errors.phone?.message} hint="10 chữ số, bắt đầu bằng 0. Để trống nếu không muốn cung cấp.">
                <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="0901234567" {...register('phone')} />
              </FormField>
              <FormField label="Ngày sinh" error={errors.birthDate?.message} hint="Dạng dd/mm/yyyy.">
                <Input autoComplete="bday" placeholder="dd/mm/yyyy" maxLength={10} {...register('birthDate')} />
              </FormField>
            </div>
          </fieldset>
          <FormAlert message={vm.errorMessage} />
          <div className="flex justify-end">
            <Button type="submit" loading={vm.pending} disabled={!vm.dirty || vm.conflict} className="w-full sm:w-auto">
              Lưu thay đổi
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function EmailCard({ profile }: { profile: Profile }) {
  const vm = useEmailChangeForm()
  const { register, formState } = vm.form
  const errors = formState.errors
  return (
    <Card>
      <CardHeader>
        <CardTitle>Email đăng nhập</CardTitle>
        <CardDescription>Đổi email cần xác thực lại. Email hiện tại vẫn dùng để đăng nhập cho đến khi bạn mở liên kết gửi tới email mới.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Email hiện tại</p>
          <p className="font-semibold break-all">{profile.email}</p>
        </div>
        {profile.pendingEmail && (
          <div role="status" className="flex gap-2.5 rounded-xl bg-status-warning-soft p-3 text-sm text-status-warning">
            <MailWarning aria-hidden className="mt-0.5 size-4.5 shrink-0" />
            <p className="min-w-0">
              Đang chờ xác thực <span className="font-semibold break-all">{profile.pendingEmail}</span>. Mở liên kết trong email đó để hoàn tất.
            </p>
          </div>
        )}
        <form noValidate onSubmit={vm.submit} className="space-y-4">
          <FormField label="Email mới" required error={errors.newEmail?.message}>
            <Input type="email" inputMode="email" autoComplete="email" placeholder="ban@vidu.com" {...register('newEmail')} />
          </FormField>
          <FormField label="Mật khẩu hiện tại" required error={errors.currentPassword?.message}>
            <PasswordInput autoComplete="current-password" {...register('currentPassword')} />
          </FormField>
          <FormAlert message={vm.errorMessage} />
          <div className="flex justify-end">
            <Button type="submit" variant="outline" loading={vm.pending} className="w-full sm:w-auto">
              Gửi liên kết xác thực
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function PasswordCard() {
  const vm = useChangePasswordViewModel()
  const { register, formState } = vm.form
  const errors = formState.errors
  return (
    <Card>
      <CardHeader>
        <CardTitle>Đổi mật khẩu</CardTitle>
        <CardDescription>Đổi xong, các phiên đăng nhập trên thiết bị khác bị đăng xuất; phiên này giữ nguyên.</CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={vm.submit} className="space-y-4">
          <FormField label="Mật khẩu hiện tại" required error={errors.currentPassword?.message}>
            <PasswordInput autoComplete="current-password" {...register('currentPassword')} />
          </FormField>
          <FormField label="Mật khẩu mới" required error={errors.newPassword?.message} hint="Ít nhất 8 ký tự; nên có chữ hoa, số và ký hiệu.">
            <PasswordInput autoComplete="new-password" {...register('newPassword')} />
          </FormField>
          <FormField label="Nhập lại mật khẩu mới" required error={errors.confirmPassword?.message}>
            <PasswordInput autoComplete="new-password" {...register('confirmPassword')} />
          </FormField>
          <FormAlert message={vm.errorMessage} />
          <div className="flex justify-end">
            <Button type="submit" loading={vm.pending} className="w-full sm:w-auto">
              <KeyRound aria-hidden />
              Đổi mật khẩu
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function ProfileSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3" role="status" aria-label="Đang tải hồ sơ">
      <Skeleton className="h-80 rounded-2xl" />
      <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
    </div>
  )
}

/** FR-ACC-05 hồ sơ cá nhân, FR-ACC-04 đổi mật khẩu. */
export function ProfilePage() {
  const profile = useProfile()
  return (
    <div>
      <PageHeader eyebrow="Tài khoản" title="Hồ sơ cá nhân" description="Một hồ sơ dùng chung cho mọi CLB bạn tham gia." />
      {/* Có dữ liệu thì luôn hiện form, kể cả khi lần tải lại nền bị lỗi, để không mất chữ người dùng đang gõ. */}
      {profile.data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <AvatarCard profile={profile.data} />
            <ProfileInfoCard profile={profile.data} className="lg:col-span-2" />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <EmailCard profile={profile.data} />
            <PasswordCard />
          </div>
        </div>
      ) : profile.isError ? (
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      ) : (
        <ProfileSkeleton />
      )}
    </div>
  )
}
