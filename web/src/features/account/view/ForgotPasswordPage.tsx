import { motion } from 'motion/react'
import { ArrowLeft, Send } from 'lucide-react'
import { Link } from 'react-router'
import { spring } from '@/shared/motion/presets'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input } from '@/shared/ui/Input'
import { useForgotPasswordViewModel } from '../viewModel/useForgotPasswordViewModel'

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
              Nếu <span className="font-semibold text-foreground">{vm.sentTo}</span> đã đăng ký, bạn sẽ nhận được liên kết đặt lại mật khẩu. Liên kết
              chỉ dùng được một lần và hết hạn sau 30 phút.
            </p>
          </div>
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
