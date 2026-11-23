import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, loginAs, openNavLink, snap } from './helpers.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const vnDay = (days: number) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(Date.now() + days * DAY_MS))

test.describe('Hoạt động của tôi (FR-ATT-10, FR-RPT-02)', () => {
  test('xem báo cáo cá nhân theo khoảng ngày, lịch sử tham gia, và người đã rời vẫn xem được', async ({ page }, testInfo) => {
    await loginAs(page, 'ha.le@demo.test')
    await openNavLink(page, 'Hoạt động của tôi')
    await expect(page.getByRole('heading', { name: 'Hoạt động của tôi', level: 1 })).toBeVisible()
    await page.getByRole('combobox', { name: 'Loại kỳ' }).selectOption('CUSTOM')
    await page.getByRole('textbox', { name: 'Từ ngày' }).fill(vnDay(-30))
    await page.getByRole('textbox', { name: 'Đến ngày' }).fill(vnDay(0))
    await page.getByRole('button', { name: 'Xem' }).click()
    await expect(page.getByText('Tỷ lệ chuyên cần').first()).toBeVisible()
    await expect(page.getByText('100%')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Công việc' })).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'myActivityReport')

    await page.getByRole('tab', { name: 'Lịch sử tham gia' }).click()
    await expect(page.getByText('Workshop chụp ảnh sân khấu')).toBeVisible()
    await expect(page.getByText('Vắng có phép', { exact: true }).last()).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'myActivityHistory')

    // Người đã rời không còn CLB nào nên sau khi đăng nhập không về trang CLB như helper `switchUser` chờ.
    await page.getByRole('button', { name: 'Tài khoản: Lê Thu Hà' }).click()
    await page.getByRole('menuitem', { name: 'Đăng xuất' }).click()
    await page.waitForURL('**/login')
    await page.getByRole('textbox', { name: 'Email' }).fill('dat.ho@demo.test')
    await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill(crypto.randomUUID())
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/login'))
    await openNavLink(page, 'Hoạt động của tôi')
    await expect(page.getByRole('combobox', { name: 'CLB' })).toContainText('(Đã rời)')
    await expect(page.getByText('Tỷ lệ chuyên cần').first()).toBeVisible()
  })
})
