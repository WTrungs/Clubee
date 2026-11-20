import { expect, test } from '@playwright/test'
import { loginAs, snap } from './helpers.ts'

test.describe('Thông báo', () => {
  test('mở thông báo CLB trong sheet, mở việc được giao tới đúng việc', async ({ page }, testInfo) => {
    await loginAs(page, 'ha.le@demo.test')
    await page.getByRole('link', { name: 'Thông báo, 2 chưa đọc' }).click()
    await expect(page.getByRole('heading', { name: 'Thông báo', level: 1 })).toBeVisible()
    await snap(page, testInfo, 'notifications')

    await page.getByRole('button', { name: /Lịch sinh hoạt tháng 11/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Lịch sinh hoạt tháng 11' })
    await expect(sheet.getByText('Sinh hoạt chung tối thứ Tư hằng tuần', { exact: false })).toBeVisible()
    await expect(sheet.getByText('Nguyễn Minh Anh gửi lúc', { exact: false })).toBeVisible()
    await snap(page, testInfo, 'notificationDetail', { fullPage: false })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('link', { name: 'Thông báo, 1 chưa đọc' })).toBeVisible()

    await page.getByRole('button', { name: /Bạn được giao việc: Viết bài giới thiệu thành viên mới/ }).click()
    await page.waitForURL((url) => url.pathname === '/me/tasks' && url.searchParams.get('task') === 't-intro-post' && url.searchParams.get('taskClub') === 'c-guitar')
    const task = page.getByRole('dialog', { name: 'Viết bài giới thiệu thành viên mới' })
    await expect(task).toBeVisible()
    // Hộp thoại modal ẩn phần còn lại của trang khỏi cây accessibility, nên đóng rồi mới xem chuông.
    await page.keyboard.press('Escape')
    await expect(task).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Thông báo', exact: true })).toBeVisible()
  })

  test('duyệt yêu cầu gia nhập thì người gửi nhận thông báo và vào được CLB', async ({ page }) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-guitar/members?tab=requests')
    const quan = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Trương Minh Quân' }) })
    await quan.getByRole('button', { name: 'Duyệt' }).click()
    const approve = page.getByRole('dialog', { name: 'Duyệt yêu cầu gia nhập' })
    await approve.getByRole('combobox', { name: 'Ban chính' }).selectOption({ label: 'Truyền thông' })
    await approve.getByRole('button', { name: 'Duyệt', exact: true }).click()
    await expect(page.getByText('Đã duyệt Trương Minh Quân vào CLB (Thử việc).')).toBeVisible()
    // Người duyệt không nhận thông báo về thao tác của chính mình.
    await expect(page.getByRole('link', { name: 'Thông báo', exact: true })).toBeVisible()

    // Đăng xuất trong app, không tải lại trang, nên dữ liệu mock vừa ghi vẫn còn.
    await page.getByRole('button', { name: 'Tài khoản: Nguyễn Minh Anh' }).click()
    await page.getByRole('menuitem', { name: 'Đăng xuất' }).click()
    await page.waitForURL('**/login')
    await page.getByRole('textbox', { name: 'Email' }).fill('quan.truong@demo.test')
    await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill(crypto.randomUUID())
    await page.getByRole('button', { name: 'Đăng nhập' }).click()

    await page.getByRole('link', { name: 'Thông báo, 1 chưa đọc' }).click()
    await page.getByRole('button', { name: /Yêu cầu gia nhập CLB Guitar Sinh viên đã được duyệt/ }).click()
    await expect(page.getByRole('heading', { name: 'CLB Guitar Sinh viên', level: 1 })).toBeVisible()
  })

  test('ban chủ nhiệm gửi thông báo toàn CLB, thành viên mở được nội dung', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-guitar')
    await page.getByRole('button', { name: 'Gửi thông báo' }).click()
    const sheet = page.getByRole('dialog', { name: 'Gửi thông báo' })
    await expect(sheet.getByText('CLB hiện hành: CLB Guitar Sinh viên', { exact: false })).toBeVisible()
    await sheet.getByRole('button', { name: 'Gửi thông báo' }).click()
    await expect(sheet.getByText('Chọn nhóm nhận thông báo.')).toBeVisible()

    await sheet.getByRole('combobox', { name: 'Gửi tới' }).selectOption('CLUB:c-guitar')
    await expect(sheet.getByText(/\d+ người sẽ nhận, không tính bạn\./)).toBeVisible()
    await sheet.getByRole('textbox', { name: 'Tiêu đề' }).fill('Đổi phòng sinh hoạt tuần này')
    await sheet.getByRole('textbox', { name: 'Nội dung' }).fill('Tối thứ Tư này sinh hoạt ở phòng C1.02 thay vì B2.05.')
    await sheet.getByRole('switch', { name: /Gửi kèm email/ }).click()
    await snap(page, testInfo, 'composeAnnouncement', { fullPage: false })
    await sheet.getByRole('button', { name: 'Gửi thông báo' }).click()
    await expect(page.getByText(/Đã gửi thông báo tới \d+ người\./)).toBeVisible()
    await expect(sheet).toHaveCount(0)

    await page.getByRole('button', { name: 'Tài khoản: Nguyễn Minh Anh' }).click()
    await page.getByRole('menuitem', { name: 'Đăng xuất' }).click()
    await page.waitForURL('**/login')
    await page.getByRole('textbox', { name: 'Email' }).fill('ha.le@demo.test')
    await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill(crypto.randomUUID())
    await page.getByRole('button', { name: 'Đăng nhập' }).click()

    // Hà không giữ chức vụ nên không có nút gửi thông báo.
    await expect(page.getByRole('heading', { name: 'CLB Guitar Sinh viên', level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Gửi thông báo' })).toHaveCount(0)
    await page.getByRole('link', { name: 'Thông báo, 3 chưa đọc' }).click()
    await page.getByRole('button', { name: /Đổi phòng sinh hoạt tuần này/ }).click()
    const detail = page.getByRole('dialog', { name: 'Đổi phòng sinh hoạt tuần này' })
    await expect(detail.getByText('Tối thứ Tư này sinh hoạt ở phòng C1.02 thay vì B2.05.')).toBeVisible()
    await expect(detail.getByText('Nguyễn Minh Anh gửi lúc', { exact: false })).toBeVisible()
  })

  test('trưởng ban chỉ gửi được cho ban mình', async ({ page }) => {
    await loginAs(page, 'linh.dang@demo.test')
    await page.goto('/clubs/c-guitar')
    await page.getByRole('button', { name: 'Gửi thông báo' }).click()
    const sheet = page.getByRole('dialog', { name: 'Gửi thông báo' })
    const audience = sheet.getByRole('combobox', { name: 'Gửi tới' })
    await expect(audience).toHaveValue('DEPARTMENT:d-media')
    await expect(audience.getByRole('option')).toHaveText(['Chọn nhóm nhận', 'Ban Truyền thông (3 người)'])
  })
})
