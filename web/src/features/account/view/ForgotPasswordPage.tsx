import { motion } from 'motion/react'
import { ArrowLeft, FlaskConical, Send } from 'lucide-react'
import { Link } from 'react-router'
import { PASSWORD_RESET_MINUTES } from '@/shared/lib/accountRules'
import { spring } from '@/shared/motion/presets'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input } from '@/shared/ui/Input'
import { useForgotPasswordViewModel } from '../viewModel/useForgotPasswordViewModel'

/** Chỉ hiện ở chế độ mock, thay cho hộp thư thật (IF-03 thuộc máy chủ). */
function DemoMailbox({ link }: { link: string | null }) {
  return (
    <section aria-labelledby="demo-mailbox-heading" className="rounded-2xl border border-dashed bg-card/70 p-3">
      <h2 id="demo-mailbox-heading" className="flex items-center gap-2 text-sm font-bold">
        <FlaskConical aria-hidden className="size-4 text-primary" />
        Hộp thư demo (chế độ mock)
      </h2>
      {link ? (
        <>
          <p className="mt-0.5 text-xs text-muted-foreground">Bản demo không gửi email thật. Thư vừa gửi có liên kết sau:</p>
          <Button asChild variant="outline" size="sm" className="mt-2.5 w-full">
            <Link to={link}>Mở liên kết đặt lại mật khẩu</Link>
          </Button>
        </>
      ) : (
        <p className="mt-0.5 text-xs text-muted-foreground">Không có thư nào được gửi: email này chưa đăng ký hoặc tài khoản chưa hoạt động.</p>
      )}
    </section>
  )
}

export function ForgotPasswordPage() {
  const vm = useForgotPasswordViewModel()
  const { register, formState } = vm.form

  return (
    <div className="space-y-6">
      <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        Về đăng nhập
      </Link>

      {vm.sentTo ? (
        <div className="space-y-5">
          <div className="space-y-5" role="status">
            <motion.span
              initial={{ scale: 0.4, opacity: 0, rotate: -20 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={spring}
              className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary"
            >
              <Send aria-hidden className="size-7" />
            </motion.span>
            <div className="space-y-2">
              <h1 className="text-2xl font-extrabold tracking-tight">Đã gửi hướng dẫn</h1>
              <p className="text-muted-foreground">
                Nếu <span className="font-semibold break-all text-foreground">{vm.sentTo}</span> đã đăng ký, bạn sẽ nhận được liên kết đặt lại mật khẩu.
                Liên kết chỉ dùng được một lần và hết hạn sau {PASSWORD_RESET_MINUTES} phút.
              </p>
            </div>
          </div>
          {vm.demoResetLink !== undefined && <DemoMailbox link={vm.demoResetLink} />}
          <Button variant="outline" className="w-full" onClick={vm.reset}>
            Gửi lại tới email khác
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <h1 className="text-3xl font-extrabold tracking-tight">Quên mật khẩu</h1>
            <p className="text-muted-foreground">Nhập email đăng ký, chúng tôi sẽ gửi liên kết đặt lại mật khẩu.</p>
          </div>
          <form noValidate onSubmit={vm.submit} className="space-y-4">
            <FormField label="Email" required error={formState.errors.email?.message}>
              <Input type="email" autoComplete="email" inputMode="email" placeholder="ban@vidu.com" {...register('email')} />
            </FormField>
            <FormAlert message={vm.errorMessage} />
            <Button type="submit" size="lg" className="w-full" loading={vm.pending}>
              Gửi liên kết
            </Button>
          </form>
        </>
      )}
    </div>
  )
}
