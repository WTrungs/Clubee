import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, loginAs, openNavLink, settleToast, snap } from './helpers.ts'

// Năm sau để đợt mới luôn ở Sắp mở.
const year = new Date().getFullYear() + 1

test.describe('Tuyển thành viên', () => {
  test('ban chủ nhiệm mở đợt tuyển với chỉ tiêu, vòng, câu hỏi và giám khảo', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-guitar')
    await openNavLink(page, 'Tuyển thành viên')
    const list = page.getByRole('list', { name: 'Đợt tuyển' })
    await expect(list.getByRole('link', { name: /Tuyển thành viên học kỳ 1 năm học 2026–2027/ })).toContainText('Đang nhận đơn')
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'recruitmentList')

    await page.getByRole('button', { name: 'Mở đợt tuyển' }).click()
    const sheet = page.getByRole('dialog', { name: 'Mở đợt tuyển' })
    await sheet.getByRole('textbox', { name: 'Tên đợt tuyển' }).fill('Tuyển thành viên học kỳ 2')
    await sheet.getByRole('textbox', { name: 'Mở', exact: true }).fill(`01/02/${year}`)
    await sheet.getByRole('textbox', { name: 'Đóng', exact: true }).fill(`15/02/${year}`)
    await sheet.getByRole('combobox', { name: 'Ban 1' }).selectOption({ label: 'Truyền thông' })
    await sheet.getByRole('textbox', { name: 'Chỉ tiêu' }).fill('0')
    await sheet.getByRole('button', { name: 'Mở đợt tuyển' }).click()
    await expect(sheet.getByText('Từ 1 đến 500.')).toBeVisible()
    await sheet.getByRole('textbox', { name: 'Chỉ tiêu' }).fill('4')
    await sheet.getByRole('button', { name: 'Thêm vòng' }).click()
    await sheet.getByRole('textbox', { name: 'Vòng 2' }).fill('Phỏng vấn')
    await sheet.getByRole('button', { name: 'Thêm câu hỏi' }).click()
    await sheet.getByRole('textbox', { name: 'Câu 1' }).fill('Vì sao bạn muốn vào ban Truyền thông?')
    await sheet.getByRole('list', { name: 'Chọn giám khảo' }).getByRole('checkbox', { name: /Đặng Khánh Linh/ }).check()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'recruitmentForm')
    await sheet.getByRole('button', { name: 'Mở đợt tuyển' }).click()
    await settleToast(page, 'Đã mở đợt tuyển Tuyển thành viên học kỳ 2.')

    await expect(page.getByRole('heading', { name: 'Tuyển thành viên học kỳ 2' })).toBeVisible()
    await expect(page.getByText('Sắp mở')).toBeVisible()
    await expect(page.getByRole('list', { name: 'Các vòng' })).toContainText('Phỏng vấn')
    await expect(page.getByRole('list', { name: 'Giám khảo' })).toContainText('Đặng Khánh Linh')
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'recruitmentDetail')
  })

  test('đợt đang nhận đơn khóa vòng và câu hỏi, vẫn sửa được tên', async ({ page }) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-guitar/recruitments/rec-guitar-k1')
    await page.getByRole('button', { name: 'Sửa đợt tuyển' }).click()
    const sheet = page.getByRole('dialog', { name: /^Sửa / })
    await expect(sheet.getByRole('textbox', { name: 'Vòng 1' })).toBeDisabled()
    await expect(sheet.getByRole('button', { name: 'Thêm vòng' })).toHaveCount(0)
    await sheet.getByRole('textbox', { name: 'Tên đợt tuyển' }).fill('Tuyển thành viên K1')
    await sheet.getByRole('button', { name: 'Lưu thay đổi' }).click()
    await settleToast(page, 'Đã lưu Tuyển thành viên K1.')
    await expect(page.getByRole('heading', { name: 'Tuyển thành viên K1' })).toBeVisible()
  })

  test('thành viên thường không thấy mục Tuyển thành viên', async ({ page }) => {
    await loginAs(page, 'ha.le@demo.test')
    await page.goto('/clubs/c-guitar')
    if ((page.viewportSize()?.width ?? 1440) < 1024) await page.getByRole('button', { name: 'Mở menu' }).click()
    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' }).filter({ visible: true }).first()
    await expect(nav.getByRole('link', { name: 'Tài chính', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Tuyển thành viên', exact: true })).toHaveCount(0)
  })
})
