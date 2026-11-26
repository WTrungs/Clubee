import { expect, test, type Page } from '@playwright/test'
import { snap } from './helpers.ts'

/** Gửi yêu cầu ở trang Quên mật khẩu rồi mở thư trong hộp thư demo (không tải lại trang để dữ liệu mock còn giữ). */
async function openResetLink(page: Page, email: string): Promise<void> {
  await page.goto('/forgot-password')
  await expect(page.getByRole('heading', { name: 'Quên mật khẩu' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('button', { name: 'Gửi liên kết' }).click()
  await expect(page.getByRole('heading', { name: 'Đã gửi hướng dẫn' })).toBeVisible()
  await page.getByRole('link', { name: 'Mở liên kết đặt lại mật khẩu' }).click()
  await expect(page.getByRole('heading', { name: 'Đặt mật khẩu mới' })).toBeVisible()
}

test.describe('Đặt lại mật khẩu (FR-ACC-03)', () => {
  test('mở liên kết trong email, đặt mật khẩu mới rồi chỉ mật khẩu mới đăng nhập được', async ({ page }, testInfo) => {
    const newPassword = `Moi-${crypto.randomUUID()}`
    await page.goto('/forgot-password')
    await expect(page.getByRole('heading', { name: 'Quên mật khẩu' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Email' }).fill('ha.le@demo.test')
    await page.getByRole('button', { name: 'Gửi liên kết' }).click()
    await expect(page.getByRole('heading', { name: 'Đã gửi hướng dẫn' })).toBeVisible()
    await expect(page.getByText('hết hạn sau 30 phút')).toBeVisible()
    await snap(page, testInfo, 'forgotPasswordSent')
    await page.getByRole('link', { name: 'Mở liên kết đặt lại mật khẩu' }).click()

    await expect(page.getByRole('heading', { name: 'Đặt mật khẩu mới' })).toBeVisible()
    await expect(page.getByText('ha***@demo.test')).toBeVisible()
    await page.getByRole('textbox', { name: 'Mật khẩu mới', exact: true }).fill(newPassword)
    await page.getByRole('textbox', { name: 'Nhập lại mật khẩu mới' }).fill(newPassword)
    await snap(page, testInfo, 'resetPassword')
    await page.getByRole('button', { name: 'Đặt mật khẩu' }).click()
    await expect(page.getByRole('heading', { name: 'Đã đặt mật khẩu mới' })).toBeVisible()
    await snap(page, testInfo, 'resetPasswordDone')

    await page.getByRole('link', { name: 'Đăng nhập', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Email' }).fill('ha.le@demo.test')
    await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill('mot-chuoi-bat-ky')
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Email hoặc mật khẩu không đúng.' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill(newPassword)
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await page.waitForURL('**/clubs')
  })

  test('liên kết quá 30 phút thì không đặt được', async ({ page }, testInfo) => {
    // Đồng hồ giả chạy theo giờ thật, rồi nhảy qua hạn liên kết.
    await page.clock.install()
    await openResetLink(page, 'ha.le@demo.test')
    await page.getByRole('textbox', { name: 'Mật khẩu mới', exact: true }).fill('mat-khau-moi-1')
    await page.getByRole('textbox', { name: 'Nhập lại mật khẩu mới' }).fill('mat-khau-moi-1')
    await page.clock.setSystemTime(Date.now() + 31 * 60_000)
    await page.getByRole('button', { name: 'Đặt mật khẩu' }).click()
    await expect(page.getByRole('heading', { name: 'Liên kết đã hết hạn' })).toBeVisible()
    await page.clock.runFor(1000)
    await snap(page, testInfo, 'resetPasswordExpired')
    await page.getByRole('link', { name: 'Gửi lại liên kết' }).click()
    await expect(page.getByRole('heading', { name: 'Quên mật khẩu' })).toBeVisible()
  })

  test('liên kết sai', async ({ page }) => {
    await page.goto('/reset-password?token=khong-co')
    await expect(page.getByRole('heading', { name: 'Liên kết không đúng' })).toBeVisible()
  })
})
