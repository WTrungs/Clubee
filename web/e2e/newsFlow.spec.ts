import { expect, test, type Page } from '@playwright/test'
import { loginAs, openNavLink, settleToast, snap } from './helpers.ts'

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const TITLE = 'Tuyển ca sĩ cho Đêm nhạc Mùa đông'

/** Đổi người dùng bằng menu trong app (không tải lại trang) để tin vừa ghi vẫn còn trong mock. */
async function switchUser(page: Page, fromName: string, email: string): Promise<void> {
  await page.getByRole('button', { name: `Tài khoản: ${fromName}` }).click()
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click()
  await page.waitForURL('**/login**')
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill(crypto.randomUUID())
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.waitForURL('**/clubs/**')
}

test.describe('Tin tức CLB (FR-CLB-06)', () => {
  test('chủ nhiệm viết tin kèm ảnh, xuất bản; thành viên đọc được; ẩn thì thành viên không còn thấy', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-guitar')
    await openNavLink(page, 'Tin tức')
    const list = page.getByRole('list', { name: 'Danh sách tin' })
    await expect(list.getByRole('listitem')).toHaveCount(4)
    await snap(page, testInfo, 'newsBoardList')

    await page.getByRole('button', { name: 'Viết tin' }).click()
    const editor = page.getByRole('dialog', { name: 'Viết tin' })
    await editor.getByRole('button', { name: 'Lưu nháp' }).click()
    await expect(editor.getByText('Tiêu đề cần ít nhất 5 ký tự.')).toBeVisible()
    await editor.getByLabel('Chọn ảnh bìa').setInputFiles({ name: 'bia.png', mimeType: 'image/png', buffer: PNG_1PX })
    await editor.getByRole('textbox', { name: 'Tiêu đề' }).fill(TITLE)
    await editor.getByRole('textbox', { name: 'Nội dung' }).fill('CLB tìm 2 bạn hát chính.\nTập vào tối thứ Năm hằng tuần tại phòng B2.04.')
    await snap(page, testInfo, 'newsEditor', { fullPage: false })
    await editor.getByRole('button', { name: 'Lưu nháp' }).click()
    await settleToast(page, 'Đã lưu tin nháp.')

    const detail = page.getByRole('dialog', { name: TITLE })
    await expect(detail.getByText('Nháp', { exact: true })).toBeVisible()
    await detail.getByRole('button', { name: 'Xuất bản' }).click()
    await settleToast(page, 'Đã xuất bản tin.')
    await expect(detail.getByText('Đã xuất bản', { exact: true })).toBeVisible()
    await detail.getByRole('button', { name: 'Đóng' }).click()

    await switchUser(page, 'Nguyễn Minh Anh', 'ha.le@demo.test')
    await openNavLink(page, 'Tin tức')
    await expect(page.getByRole('button', { name: 'Viết tin' })).toHaveCount(0)
    await expect(list.getByRole('listitem')).toHaveCount(3)
    await list.getByRole('button', { name: new RegExp(TITLE) }).click()
    await expect(page.getByRole('dialog', { name: TITLE }).getByText('Tập vào tối thứ Năm hằng tuần', { exact: false })).toBeVisible()
    await snap(page, testInfo, 'newsMemberDetail', { fullPage: false })
    await page.getByRole('dialog', { name: TITLE }).getByRole('button', { name: 'Đóng' }).click()

    await switchUser(page, 'Lê Thu Hà', 'anh.nguyen@demo.test')
    await openNavLink(page, 'Tin tức')
    await list.getByRole('button', { name: new RegExp(TITLE) }).click()
    await detail.getByRole('button', { name: 'Ẩn tin' }).click()
    await page.getByRole('dialog', { name: 'Ẩn tin này?' }).getByRole('button', { name: 'Ẩn tin' }).click()
    await settleToast(page, 'Đã ẩn tin.')
    await expect(detail.getByText(/đã ẩn tin lúc/)).toBeVisible()
    await detail.getByRole('button', { name: 'Đóng' }).click()

    await switchUser(page, 'Nguyễn Minh Anh', 'ha.le@demo.test')
    await openNavLink(page, 'Tin tức')
    await expect(list.getByRole('listitem')).toHaveCount(2)
    await expect(list.getByText(TITLE)).toHaveCount(0)
  })
})
