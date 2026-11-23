import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, loginAs, openNotification, settleToast, snap, switchUser } from './helpers.ts'

const PHOTO = '/clubs/c-guitar/sessions/s-media-photo?tab=attendance'

test.describe('Sửa điểm danh sau khi chốt (FR-ATT-08)', () => {
  test('quá hạn thì trưởng ban chỉ xem; ban chủ nhiệm sửa kèm lý do, thêm người bị sót và người được sửa được báo', async ({ page }, testInfo) => {
    await loginAs(page, 'linh.dang@demo.test')
    await page.goto(PHOTO)
    await expect(page.getByText(/Đã quá hạn sửa \(.+\); chỉ ban chủ nhiệm sửa được\./)).toBeVisible()
    await expect(page.getByRole('button', { name: /^Sửa điểm danh của/ })).toHaveCount(0)

    // Chưa ghi gì nên tải lại trang được.
    await switchUser(page, 'Đặng Khánh Linh', 'anh.nguyen@demo.test')
    await page.goto(PHOTO)
    await expect(page.getByText(/ban chủ nhiệm vẫn sửa được, mỗi lần sửa cần lý do\./)).toBeVisible()
    await page.getByRole('button', { name: 'Sửa điểm danh của Hoàng Thảo Vy' }).click()
    const dialog = page.getByRole('dialog', { name: 'Sửa điểm danh: Hoàng Thảo Vy' })
    await dialog.getByRole('radio', { name: 'Vắng có phép' }).click()
    await dialog.getByRole('textbox', { name: 'Lý do sửa' }).fill('Vy đã báo ốm qua tin nhắn trước buổi.')
    await snap(page, testInfo, 'attendanceEdit', { fullPage: false })
    await dialog.getByRole('button', { name: 'Lưu thay đổi' }).click()
    await settleToast(page, 'Đã sửa thành Vắng có phép cho Hoàng Thảo Vy.')

    await page.getByRole('button', { name: 'Xem lịch sử sửa của Hoàng Thảo Vy' }).click()
    const history = page.getByRole('dialog', { name: 'Lịch sử sửa: Hoàng Thảo Vy' })
    await expect(history.getByText('Vy đã báo ốm qua tin nhắn trước buổi.')).toBeVisible()
    await snap(page, testInfo, 'attendanceHistory', { fullPage: false })
    await page.keyboard.press('Escape')
    await expect(history).toBeHidden()

    await page.getByRole('button', { name: 'Thêm người phát sinh' }).click()
    await page.getByRole('dialog', { name: 'Thêm người phát sinh' }).getByRole('button', { name: 'Thêm Bùi Đức Long' }).click()
    const added = page.getByRole('dialog', { name: 'Sửa điểm danh: Bùi Đức Long' })
    await added.getByRole('radio', { name: 'Có mặt' }).click()
    await added.getByRole('textbox', { name: 'Lý do sửa' }).fill('Nhập lại từ danh sách ký tên giấy.')
    await added.getByRole('button', { name: 'Lưu thay đổi' }).click()
    await settleToast(page, 'Đã sửa thành Có mặt cho Bùi Đức Long.')
    await expect(page.getByRole('button', { name: 'Xem lịch sử sửa của Bùi Đức Long' })).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'attendanceEdited')

    await switchUser(page, 'Nguyễn Minh Anh', 'vy.hoang@demo.test')
    await openNotification(page, /Điểm danh của bạn được sửa:/)
    await page.waitForURL(/\/clubs\/c-guitar\/sessions\/s-media-photo/)
  })
})
