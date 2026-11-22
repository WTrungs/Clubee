import { expect, test } from '@playwright/test'
import { loginAs, snap } from './helpers.ts'

test.describe('Danh bạ CLB công khai (FR-CLB-05)', () => {
  test('khách tìm CLB, xem trang CLB rồi đăng nhập để nộp đơn', async ({ page }, testInfo) => {
    await page.goto('/login')
    await page.getByRole('link', { name: 'Danh bạ CLB' }).click()
    await expect(page.getByRole('heading', { name: 'Danh bạ CLB', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Đăng ký' })).toBeVisible()
    const list = page.getByRole('list', { name: 'Danh sách CLB' })
    await expect(list.getByRole('listitem')).toHaveCount(3)

    await page.getByRole('combobox', { name: 'Lọc theo lĩnh vực' }).selectOption('Âm nhạc')
    await expect(list.getByRole('listitem')).toHaveCount(1)
    await expect(list).toContainText('Đang tuyển')
    await snap(page, testInfo, 'publicDirectory')
    await page.getByRole('button', { name: 'Bỏ lọc' }).click()
    await page.getByRole('searchbox', { name: 'Tìm CLB theo tên' }).fill('tinh nguyen')
    await expect(list.getByRole('listitem')).toHaveCount(1)
    await expect(list).toContainText('Đội Tình nguyện Xanh')
    await page.getByRole('button', { name: 'Bỏ lọc' }).click()

    await list.getByRole('link', { name: /CLB Guitar Sinh viên/ }).click()
    await expect(page.getByRole('heading', { name: 'CLB Guitar Sinh viên', level: 1 })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Liên hệ công khai' })).toContainText('guitar.gsv@demo.test')
    await expect(page.getByText('Ban Chuyên môn: 5 chỉ tiêu')).toBeVisible()
    await snap(page, testInfo, 'publicClub')

    await page.getByRole('link', { name: /^Nộp đơn: / }).click()
    await page.waitForURL('**/login')
    await page.getByRole('textbox', { name: 'Email' }).fill('tu.chau@demo.test')
    await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill(crypto.randomUUID())
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await page.waitForURL('**/recruitments/rec-guitar-k1')
  })

  test('người đã đăng nhập thấy nút Vào ứng dụng thay cho Đăng nhập', async ({ page }) => {
    await loginAs(page, 'ha.le@demo.test')
    await page.goto('/explore/c-english')
    await expect(page.getByRole('heading', { name: 'CLB Tiếng Anh Giao tiếp', level: 1 })).toBeVisible()
    await expect(page.getByText('Chưa có đợt tuyển nào đang mở')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Đăng nhập', exact: true })).toHaveCount(0)
    await page.getByRole('link', { name: 'Vào ứng dụng' }).click()
    await page.waitForURL('**/clubs')
  })

  test('CLB không có thì báo không tìm thấy', async ({ page }) => {
    await page.goto('/explore/c-khong-co')
    await expect(page.getByText('Không tìm thấy CLB, hoặc CLB không còn hoạt động.')).toBeVisible()
  })
})
