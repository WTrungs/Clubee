import { expect, test } from '@playwright/test'
import { loginAs, openNavLink, openNotification, snap, switchUser, useDarkTheme } from './helpers.ts'

test.describe('Sinh hoạt', () => {
  test('trưởng ban tạo buổi của ban, thành viên ban được báo và mở đúng trang', async ({ page }, testInfo) => {
    await loginAs(page, 'linh.dang@demo.test')
    await page.goto('/clubs/c-guitar/sessions')
    await expect(page.getByRole('heading', { name: 'Sinh hoạt', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: /Sinh hoạt định kỳ: hòa âm cơ bản/ })).toBeVisible()
    await snap(page, testInfo, 'sessions')

    await page.getByRole('button', { name: 'Tạo buổi' }).click()
    const sheet = page.getByRole('dialog', { name: 'Tạo buổi sinh hoạt' })
    await expect(sheet.getByRole('combobox', { name: 'Phạm vi' })).toHaveValue('d-media')
    await sheet.getByRole('textbox', { name: 'Tên buổi' }).fill('Họp ban Truyền thông tuần 2')
    await sheet.getByRole('textbox', { name: 'Địa điểm' }).fill('Phòng truyền thông A2')
    await snap(page, testInfo, 'sessionForm', { fullPage: false })
    await sheet.getByRole('button', { name: 'Tạo buổi' }).click()

    await page.waitForURL(/\/clubs\/c-guitar\/sessions\/s-/)
    await expect(page.getByRole('heading', { name: 'Họp ban Truyền thông tuần 2', level: 1 })).toBeVisible()
    await expect(page.getByText('Ban Truyền thông').first()).toBeVisible()
    await snap(page, testInfo, 'sessionDetail')

    await switchUser(page, 'Đặng Khánh Linh', 'ha.le@demo.test')
    await openNotification(page, /Buổi sinh hoạt mới: Họp ban Truyền thông tuần 2/)
    await page.waitForURL(/\/clubs\/c-guitar\/sessions\/s-/)
    await expect(page.getByRole('heading', { name: 'Họp ban Truyền thông tuần 2', level: 1 })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Điểm danh' })).toHaveCount(0)

    await openNavLink(page, 'Sinh hoạt')
    await expect(page.getByRole('heading', { name: 'Sinh hoạt', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: /Họp ban Truyền thông tuần 2/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tạo buổi' })).toHaveCount(0)
  })

  test('chủ nhiệm điểm danh buổi đang diễn ra, thêm người phát sinh rồi chốt', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-guitar/sessions/s-weekly-now?tab=attendance')
    await expect(page.getByText(/Đang mở điểm danh/)).toBeVisible()

    const long = page.getByRole('group', { name: 'Trạng thái của Bùi Đức Long' })
    await long.getByRole('button', { name: 'Có mặt' }).click()
    await expect(long.getByRole('button', { name: 'Có mặt' })).toHaveAttribute('aria-pressed', 'true')
    await snap(page, testInfo, 'attendance')

    await page.getByRole('button', { name: 'Thêm người phát sinh' }).click()
    const dialog = page.getByRole('dialog', { name: 'Thêm người phát sinh' })
    await dialog.getByRole('button', { name: 'Thêm Trịnh Hải Yến' }).click()
    await expect(dialog).toBeHidden()
    await page.getByRole('button', { name: /^Phát sinh/ }).click()
    await expect(page.getByRole('group', { name: 'Trạng thái của Trịnh Hải Yến' }).getByRole('button', { name: 'Có mặt' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: /^Tất cả/ }).click()

    const filters = page.getByRole('group', { name: 'Lọc theo trạng thái điểm danh' })
    const countOf = async (label: RegExp) => Number((await filters.getByRole('button', { name: label }).textContent())?.match(/(\d+)\s*$/)?.[1])
    const unmarked = await countOf(/^Chưa điểm danh/)
    const absentBefore = await countOf(/^Vắng không phép/)
    expect(unmarked).toBeGreaterThan(0)

    await page.getByRole('button', { name: 'Chốt điểm danh' }).click()
    const confirm = page.getByRole('dialog', { name: 'Chốt điểm danh?' })
    await expect(confirm.getByText(/người chưa điểm danh sẽ được ghi Vắng không phép/)).toBeVisible()
    await snap(page, testInfo, 'attendanceClose', { fullPage: false })
    await confirm.getByRole('button', { name: 'Chốt điểm danh' }).click()
    await expect(confirm).toBeHidden()
    await expect(page.getByText(/Đã chốt lúc .* bởi Nguyễn/)).toBeVisible()
    await expect(page.getByRole('group', { name: /^Trạng thái của/ })).toHaveCount(0)
    await expect(page.getByText('Vắng không phép', { exact: true }).first()).toBeVisible()
    await expect.poll(() => countOf(/^Vắng không phép/)).toBe(absentBefore + unmarked)
    await expect.poll(() => countOf(/^Chưa điểm danh/)).toBe(0)
    await snap(page, testInfo, 'attendanceClosed')
  })

  test('ban chủ nhiệm điểm danh sự kiện theo từng ngày', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-guitar/events/e-exchange?tab=attendance')
    const ha = page.getByRole('group', { name: 'Trạng thái của Lê Thu Hà' })
    await ha.getByRole('button', { name: 'Đi muộn' }).click()
    await expect(ha.getByRole('button', { name: 'Đi muộn' })).toHaveAttribute('aria-pressed', 'true')
    await snap(page, testInfo, 'eventAttendance')

    await page.goto('/clubs/c-guitar/events/e-livestream?tab=attendance')
    await expect(page.getByRole('group', { name: 'Ngày của sự kiện' })).toBeVisible()
    await page.getByRole('button', { name: /^Ngày 2/ }).click()
    await expect(page.getByText(/Điểm danh mở lúc 00:00/)).toBeVisible()
    await expect(page.getByRole('group', { name: /^Trạng thái của/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Mã QR' })).toHaveCount(0)
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`chủ nhiệm chiếu mã QR của buổi đang diễn ra (${theme === 'dark' ? 'giao diện tối' : 'giao diện sáng'})`, async ({ page }, testInfo) => {
      if (theme === 'dark') await useDarkTheme(page)
      await loginAs(page, 'anh.nguyen@demo.test')
      await page.goto('/clubs/c-guitar/sessions/s-weekly-now?tab=attendance')
      await page.getByRole('button', { name: 'Mã QR' }).click()

      const dialog = page.getByRole('dialog', { name: 'Mã QR điểm danh' })
      const code = dialog.getByRole('img', { name: /^Mã QR điểm danh/ })
      await expect(code.locator('svg path').first()).toBeAttached()
      await expect(dialog.getByText(/^Đổi mã sau \d+ giây$/)).toBeVisible()
      await expect(dialog.getByText(/người có mặt · \d+ người chưa điểm danh/)).toBeVisible()
      // Máy quét cần mã đen trên nền trắng ở cả hai giao diện.
      expect(await code.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)')
      expect(await code.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(0, 0, 0)')
      await snap(page, testInfo, theme === 'dark' ? 'attendanceQrDark' : 'attendanceQr', { fullPage: false })

      await expect(dialog.getByRole('button', { name: 'Toàn màn hình' })).toBeVisible()
      await dialog.getByRole('button', { name: 'Đóng', exact: true }).click()
      await expect(dialog).toBeHidden()
    })
  }

  test('xem buổi đã qua và lọc theo ban', async ({ page }, testInfo) => {
    await loginAs(page, 'ha.le@demo.test')
    await page.goto('/clubs/c-guitar/sessions')
    await page.getByRole('tab', { name: 'Đã qua' }).click()
    await expect(page).toHaveURL(/when=past/)
    await expect(page.getByRole('link', { name: /Workshop chụp ảnh sân khấu/ })).toBeVisible()
    await page.getByRole('combobox', { name: 'Lọc theo phạm vi' }).selectOption({ label: 'Toàn CLB' })
    await expect(page.getByRole('link', { name: /Workshop chụp ảnh sân khấu/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /luyện ngón fingerstyle/ })).toBeVisible()
    await snap(page, testInfo, 'sessionsPast')
  })
})
