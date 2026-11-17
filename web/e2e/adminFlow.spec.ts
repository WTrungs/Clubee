import { expect, test, type Page } from '@playwright/test'
import { loginAs, loginAsAdmin, openNavLink, openNotification, settleToast, snap } from './helpers.ts'

/** Đăng xuất bằng menu trong app (không tải lại trang) để dữ liệu mock vừa ghi vẫn còn. */
async function logout(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: `Tài khoản: ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click()
  await page.waitForURL('**/login')
}

async function fillLogin(page: Page, email: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill(crypto.randomUUID())
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
}

test.describe('Quản trị hệ thống', () => {
  test('Admin khóa một tài khoản kèm lý do, người đó không đăng nhập được, rồi mở khóa', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await expect(page.getByRole('heading', { name: 'Số liệu vận hành' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Số liệu' }).getByText('Tài khoản bị khóa')).toBeVisible()
    await snap(page, testInfo, 'adminMetrics')

    await openNavLink(page, 'Tài khoản')
    await page.getByRole('searchbox', { name: 'Tìm theo email' }).fill('ha.le')
    const row = page.getByRole('list', { name: 'Kết quả tìm tài khoản' }).getByRole('listitem').filter({ hasText: 'ha.le@demo.test' })
    await expect(row.getByText('Đang tham gia 2 CLB')).toBeVisible()
    await row.getByRole('button', { name: 'Khóa' }).click()
    const dialog = page.getByRole('dialog', { name: 'Khóa tài khoản' })
    await dialog.getByRole('textbox').fill('Gửi tin nhắn rác cho nhiều thành viên.')
    await dialog.getByRole('button', { name: 'Khóa' }).click()
    await settleToast(page, 'Đã khóa tài khoản ha.le@demo.test.')
    await expect(row.getByText('Bị khóa', { exact: true })).toBeVisible()
    await expect(row.getByText('Gửi tin nhắn rác cho nhiều thành viên.', { exact: false })).toBeVisible()
    await snap(page, testInfo, 'adminAccounts')

    await logout(page, 'Quản trị hệ thống')
    await fillLogin(page, 'ha.le@demo.test')
    await expect(page.getByText('Tài khoản đang bị khóa. Liên hệ quản trị hệ thống.')).toBeVisible()

    // Đăng nhập lại có thể quay về đúng trang đang mở lúc đăng xuất (/admin/accounts).
    await fillLogin(page, 'admin@demo.test')
    await page.waitForURL(/\/admin(\/accounts)?$/)
    await openNavLink(page, 'Tài khoản')
    await page.getByRole('searchbox', { name: 'Tìm theo email' }).fill('ha.le')
    await row.getByRole('button', { name: 'Mở khóa' }).click()
    const unlock = page.getByRole('dialog', { name: 'Mở khóa tài khoản' })
    await unlock.getByRole('textbox').fill('Đã xác minh, mở lại cho bạn.')
    await unlock.getByRole('button', { name: 'Mở khóa' }).click()
    await settleToast(page, 'Đã mở khóa tài khoản ha.le@demo.test.')
    await expect(row.getByText('Hoạt động', { exact: true })).toBeVisible()
  })

  test('Admin mở trang CLB thì về khu quản trị, không có ô chọn CLB', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/clubs/c-guitar')
    await page.waitForURL('**/admin')
    await expect(page.getByRole('heading', { name: 'Số liệu vận hành' })).toBeVisible()
    // Ô chọn CLB có tên "CLB hiện hành …" hoặc "Chọn CLB" tùy có CLB hay không; Admin không có cả hai.
    await expect(page.getByRole('button', { name: /Chọn CLB|CLB hiện hành/ })).toHaveCount(0)
    await expect(page.getByRole('banner').getByText('Quản trị hệ thống', { exact: true })).toBeVisible()
  })

  test('thành viên yêu cầu chuyển quyền ở Đội Tình nguyện, Admin chuyển quyền, người mới thấy mình là Chủ nhiệm', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-volunteer/structure')
    await expect(page.getByText('Ban chủ nhiệm không đăng nhập hơn 30 ngày')).toBeVisible()
    await page.getByRole('button', { name: 'Yêu cầu chuyển quyền chủ nhiệm' }).click()
    const dialog = page.getByRole('dialog', { name: 'Yêu cầu chuyển quyền chủ nhiệm' })
    await dialog.getByRole('textbox').fill('Chủ nhiệm không liên lạc được hơn một tháng, đội cần người điều hành.')
    await dialog.getByRole('button', { name: 'Gửi yêu cầu' }).click()
    await settleToast(page, 'Đã gửi yêu cầu chuyển quyền. Quản trị hệ thống sẽ xem xét.')
    await expect(page.getByText('Đang chờ quản trị hệ thống xử lý yêu cầu chuyển quyền Chủ nhiệm')).toBeVisible()
    await snap(page, testInfo, 'transferRequested')

    await logout(page, 'Nguyễn Minh Anh')
    await fillLogin(page, 'admin@demo.test')
    await page.waitForURL(/\/admin$/)
    await openNavLink(page, 'Chuyển quyền')
    const card = page.getByRole('list', { name: 'Yêu cầu chuyển quyền' }).getByRole('listitem').filter({ hasText: 'Đội Tình nguyện Xanh' })
    await card.getByRole('button', { name: 'Xem và xử lý' }).click()
    const sheet = page.getByRole('dialog', { name: 'Chuyển quyền · Đội Tình nguyện Xanh' })
    await sheet.getByRole('radio', { name: /Nguyễn Minh Anh/ }).check()
    await sheet.getByRole('textbox', { name: 'Ghi chú xử lý' }).fill('Đã xác minh với các thành viên của đội.')
    await snap(page, testInfo, 'adminTransferSheet', { fullPage: false })
    await sheet.getByRole('button', { name: 'Chuyển quyền' }).click()
    await page.getByRole('dialog', { name: 'Chuyển quyền Chủ nhiệm' }).getByRole('button', { name: 'Chuyển quyền' }).click()
    await settleToast(page, 'Đã chuyển quyền Chủ nhiệm Đội Tình nguyện Xanh cho Nguyễn Minh Anh.')
    await expect(page.getByText('Không có yêu cầu đang chờ')).toBeVisible()

    await logout(page, 'Quản trị hệ thống')
    await fillLogin(page, 'anh.nguyen@demo.test')
    await page.waitForURL(/\/clubs/)
    await openNotification(page, /Chủ nhiệm mới của Đội Tình nguyện Xanh/)
    await expect(page.getByRole('heading', { name: 'Cơ cấu', exact: true })).toBeVisible()
    await expect(page.getByText('Ban chủ nhiệm không đăng nhập hơn 30 ngày')).toHaveCount(0)
    // Khối Ban chủ nhiệm hiện Anh giữ chức Chủ nhiệm.
    const board = page.getByRole('region', { name: 'Ban chủ nhiệm' })
    const anh = board.getByRole('listitem').filter({ hasText: 'Nguyễn Minh Anh' })
    await expect(anh.getByText(/^Chủ nhiệm · /)).toBeVisible()
  })

  test('tài khoản thường mở /admin thấy lý do không có quyền', async ({ page }, testInfo) => {
    await loginAs(page, 'ha.le@demo.test')
    await page.goto('/admin')
    await expect(page.getByText('Không có quyền truy cập')).toBeVisible()
    await expect(page.getByText('Trang này chỉ dành cho quản trị hệ thống.', { exact: false })).toBeVisible()
    await snap(page, testInfo, 'adminForbidden')
  })
})
