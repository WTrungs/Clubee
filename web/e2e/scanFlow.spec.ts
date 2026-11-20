import { expect, test } from '@playwright/test'
import { loginAs, openNavLink, snap } from './helpers.ts'

// Camera giả của Chromium chỉ phát hình mẫu, không có mã QR: kiểm được giao diện quét, không kiểm được giải mã (thử tay trên điện thoại).
// Bản headless shell mặc định không có camera (NotSupportedError), nên chạy file này bằng Chromium đầy đủ.
test.use({ channel: 'chromium', launchOptions: { args: ['--use-fake-device-for-media-stream'] } })

test.describe('Quét mã điểm danh, có quyền camera', () => {
  test.use({ permissions: ['camera'] })

  test('thành viên mở trang quét từ menu, camera chạy và chờ mã', async ({ page }, testInfo) => {
    await loginAs(page, 'hieu.luong@demo.test')
    await openNavLink(page, 'Quét mã điểm danh')
    await expect(page).toHaveURL(/\/scan$/)
    await expect(page.getByRole('heading', { name: 'Quét mã điểm danh', level: 1 })).toBeVisible()
    await expect(page.getByText('Đưa mã QR vào khung và giữ yên máy.')).toBeVisible()
    await expect(page.getByLabel('Hình từ camera')).toBeVisible()
    await snap(page, testInfo, 'attendanceScan', { fullPage: false })
  })
})

test.describe('Quét mã điểm danh, không có quyền camera', () => {
  test.use({ permissions: [] })

  test('chưa cho phép camera thì hướng dẫn cách bật và cho thử lại', async ({ page }, testInfo) => {
    await loginAs(page, 'hieu.luong@demo.test')
    await page.goto('/scan')
    const problem = page.getByRole('alert').filter({ hasText: 'Clubee chưa được phép dùng camera' })
    await expect(problem).toBeVisible()
    await expect(problem.getByRole('button', { name: 'Thử lại' })).toBeVisible()
    await expect(page.getByLabel('Hình từ camera')).toBeHidden()
    await snap(page, testInfo, 'attendanceScanDenied', { fullPage: false })
  })
})
