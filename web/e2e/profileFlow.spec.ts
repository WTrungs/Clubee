import { expect, test, type Page } from '@playwright/test'
import { loginAs, snap } from './helpers.ts'

// Ảnh PNG 1×1 hợp lệ để thử tải ảnh đại diện.
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

/** Mở trang Hồ sơ từ menu tài khoản, không tải lại trang nên dữ liệu mock vừa ghi vẫn còn. */
async function openProfile(page: Page, fullName: string): Promise<void> {
  await page.getByRole('button', { name: `Tài khoản: ${fullName}` }).click()
  await page.getByRole('menuitem', { name: 'Hồ sơ cá nhân' }).click()
  await expect(page.getByRole('heading', { name: 'Hồ sơ cá nhân' })).toBeVisible()
}

const formWith = (page: Page, button: string) => page.locator('form').filter({ has: page.getByRole('button', { name: button }) })

test.describe('Hồ sơ cá nhân', () => {
  test('sửa thông tin, đổi ảnh đại diện và yêu cầu đổi email', async ({ page }, testInfo) => {
    await loginAs(page, 'ha.le@demo.test')
    await openProfile(page, 'Lê Thu Hà')
    await snap(page, testInfo, 'profile')

    const info = formWith(page, 'Lưu thay đổi')
    await info.getByRole('textbox', { name: 'Ngày sinh' }).fill('31/02/2004')
    await info.getByRole('button', { name: 'Lưu thay đổi' }).click()
    await expect(info.getByText('Ngày sinh phải là một ngày có thật trước hôm nay.')).toBeVisible()
    await info.getByRole('textbox', { name: 'Ngày sinh' }).fill('09/03/2004')
    await info.getByRole('textbox', { name: 'Số điện thoại' }).fill('091 234 5678')
    await info.getByRole('button', { name: 'Lưu thay đổi' }).click()
    await expect(page.getByText('Đã lưu thông tin cá nhân.')).toBeVisible()
    await expect(info.getByRole('textbox', { name: 'Số điện thoại' })).toHaveValue('0912345678')

    await page.getByLabel('Chọn ảnh đại diện').setInputFiles({ name: 'anh.png', mimeType: 'image/png', buffer: PNG_1PX })
    await expect(page.getByText('Đã cập nhật ảnh đại diện.')).toBeVisible()
    await page.getByLabel('Chọn ảnh đại diện').setInputFiles({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') })
    await expect(page.getByText('Ảnh đại diện chỉ nhận tệp JPG hoặc PNG.')).toBeVisible()

    const email = formWith(page, 'Gửi liên kết xác thực')
    await email.getByRole('textbox', { name: 'Email mới' }).fill('ha.moi@demo.test')
    await email.getByRole('textbox', { name: 'Mật khẩu hiện tại' }).fill('mot-chuoi-bat-ky')
    await email.getByRole('button', { name: 'Gửi liên kết xác thực' }).click()
    await expect(page.getByText('Đã gửi liên kết xác thực tới ha.moi@demo.test.')).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Đang chờ xác thực' })).toContainText('ha.moi@demo.test')
    await snap(page, testInfo, 'profileSaved')
  })

  test('đổi mật khẩu, đăng xuất rồi chỉ mật khẩu mới đăng nhập được', async ({ page }) => {
    const newPassword = `Moi-${crypto.randomUUID()}`
    await loginAs(page, 'ha.le@demo.test')
    await openProfile(page, 'Lê Thu Hà')

    const form = formWith(page, 'Đổi mật khẩu')
    await form.getByRole('textbox', { name: 'Mật khẩu hiện tại' }).fill('mot-chuoi-bat-ky')
    await form.getByRole('textbox', { name: 'Mật khẩu mới', exact: true }).fill(newPassword)
    await form.getByRole('textbox', { name: 'Nhập lại mật khẩu mới' }).fill(newPassword)
    await form.getByRole('button', { name: 'Đổi mật khẩu' }).click()
    await expect(page.getByText('Đã đổi mật khẩu.', { exact: false })).toBeVisible()

    await page.getByRole('button', { name: 'Tài khoản: Lê Thu Hà' }).click()
    await page.getByRole('menuitem', { name: 'Đăng xuất' }).click()
    await page.waitForURL('**/login')
    await page.getByRole('textbox', { name: 'Email' }).fill('ha.le@demo.test')
    await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill('mot-chuoi-bat-ky')
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await expect(page.getByText('Email hoặc mật khẩu không đúng.')).toBeVisible()
    await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill(newPassword)
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    // Đăng nhập lại thì quay về trang đang mở trước khi đăng xuất.
    await expect(page.getByRole('heading', { name: 'Hồ sơ cá nhân' })).toBeVisible()
  })
})
