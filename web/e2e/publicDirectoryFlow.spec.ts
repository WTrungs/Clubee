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

  test('khách đọc tin và mở sự kiện mở cho khách từ trang CLB (FR-CLB-07)', async ({ page }, testInfo) => {
    await page.goto('/explore/c-guitar')
    await expect(page.getByRole('heading', { name: 'CLB Guitar Sinh viên', level: 1 })).toBeVisible()
    const events = page.getByRole('region', { name: 'Sự kiện mở cho khách' })
    await expect(events.getByRole('link', { name: /Đêm nhạc Mùa đông/ })).toBeVisible()
    await expect(events).toContainText('Còn')
    const news = page.getByRole('region', { name: 'Tin tức' })
    await expect(news.getByRole('listitem')).toHaveCount(2)
    await expect(news).not.toContainText('Nhìn lại học kỳ 1')
    await expect(page.getByText('Chủ nhiệm', { exact: true })).toHaveCount(0)
    await snap(page, testInfo, 'publicClubNews')

    await news.getByRole('link', { name: /Workshop đệm hát cơ bản/ }).click()
    await expect(page.getByRole('heading', { name: 'Workshop đệm hát cơ bản cho tân sinh viên', level: 1 })).toBeVisible()
    await expect(page.getByText('CLB cho mượn đàn', { exact: false })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Tin khác' })).toContainText('Đêm nhạc Mùa đông mở đăng ký')
    await snap(page, testInfo, 'publicNews')

    await page.getByRole('link', { name: 'CLB Guitar Sinh viên' }).click()
    await page.getByRole('region', { name: 'Sự kiện mở cho khách' }).getByRole('link', { name: /Đêm nhạc Mùa đông/ }).click()
    await expect(page.getByRole('heading', { name: 'Đêm nhạc Mùa đông', level: 1 })).toBeVisible()
    await expect(page.getByText('Đang nhận đăng ký')).toBeVisible()
    await expect(page.getByText(/Còn \d+\/12 chỗ/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Mở trong ứng dụng' })).toHaveCount(0)
    await snap(page, testInfo, 'publicEvent')
  })

  test('thành viên CLB mở sự kiện công khai thì được gợi ý đăng ký trong ứng dụng', async ({ page }) => {
    await loginAs(page, 'ha.le@demo.test')
    await page.goto('/explore/events/e-winter')
    await page.getByRole('link', { name: 'Mở trong ứng dụng' }).click()
    await page.waitForURL('**/clubs/c-guitar/events/e-winter')
    await expect(page.getByRole('heading', { name: 'Đêm nhạc Mùa đông', level: 1 })).toBeVisible()
  })
})
