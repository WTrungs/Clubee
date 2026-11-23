import { Inbox, Ticket } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import { GUEST_NAME_MAX } from '@/shared/lib/guestRules'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input } from '@/shared/ui/Input'
import { guestPassPath, useGuestRegistrationViewModel } from '../viewModel/useGuestViewModels'
import { GuestTicket } from './GuestTicket'

/** FR-EVT-12: khách đăng ký bằng họ tên và email hoặc SĐT; mã tham dự gửi qua email và hiện ngay sau khi đăng ký. */
export function GuestRegistrationCard({ eventId }: { eventId: string }) {
  const vm = useGuestRegistrationViewModel(eventId)
  const formId = useId()
  const { register, formState } = vm.form

  if (vm.pass) {
    return (
      <section aria-labelledby="guest-done" className="space-y-4">
        <h2 id="guest-done" className="text-lg font-bold">
          Đăng ký thành công
        </h2>
        <GuestTicket pass={vm.pass} />
        <p className="text-sm text-muted-foreground">
          {vm.pass.emailHint ? `Mã tham dự đã gửi tới ${vm.pass.emailHint}. ` : 'Bạn không khai email: hãy chụp lại mã này. '}
          Đưa mã cho ban tổ chức khi đến sự kiện.
        </p>
        <Button asChild variant="outline">
          <Link to={guestPassPath(vm.pass.code)}>
            <Ticket aria-hidden />
            Mở vé của tôi
          </Link>
        </Button>
        {vm.demoMail !== undefined && (
          <div className="rounded-2xl border border-dashed p-4 text-sm">
            <p className="mb-2 flex items-center gap-2 font-semibold">
              <Inbox aria-hidden className="size-4" />
              Hộp thư demo (chế độ mock)
            </p>
            {vm.demoMail ? (
              <>
                <p className="font-semibold">{vm.demoMail.subject}</p>
                <p className="text-muted-foreground">{vm.demoMail.body}</p>
              </>
            ) : (
              <p className="text-muted-foreground">Không có thư nào.</p>
            )}
          </div>
        )}
      </section>
    )
  }

  return (
    <section aria-labelledby="guest-form" className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="space-y-1">
        <h2 id="guest-form" className="text-lg font-bold">
          Đăng ký tham dự
        </h2>
        <p className="text-sm text-muted-foreground">Không cần tài khoản. Nhập email hoặc số điện thoại để nhận mã tham dự.</p>
      </div>
      <form id={formId} noValidate onSubmit={vm.submit} className="space-y-4">
        <FormField label="Họ tên" required error={formState.errors.fullName?.message}>
          <Input autoComplete="name" maxLength={GUEST_NAME_MAX} {...register('fullName')} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Email" error={formState.errors.email?.message} hint="Nhận mã tham dự qua email.">
            <Input type="email" autoComplete="email" inputMode="email" {...register('email')} />
          </FormField>
          <FormField label="Số điện thoại" error={formState.errors.phone?.message}>
            <Input type="tel" autoComplete="tel" inputMode="tel" {...register('phone')} />
          </FormField>
        </div>
        <FormAlert message={vm.errorMessage} />
        <Button type="submit" loading={vm.pending} className="w-full sm:w-auto">
          Đăng ký tham dự
        </Button>
      </form>
    </section>
  )
}
