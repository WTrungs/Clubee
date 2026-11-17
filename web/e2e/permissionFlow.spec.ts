import { expect, test, type Page } from '@playwright/test'
import { loginAs, openNavLink, settleToast, snap, switchUser } from './helpers.ts'

/** Màn rộng bật tắt ô trong bảng; màn hẹp chọn chức vụ rồi bật tắt trong danh sách. */
async function toggleTreasurerMembers(page: Page): Promise<void> {
  if ((page.viewportSize()?.width ?? 1440) < 1024) await page.getByRole('combobox', { name: 'Chức vụ' }).selectOption({ label: 'Thủ quỹ' })
  await page.getByRole('switch', { name: 'Quản lý thành viên cho Thủ quỹ' }).click()
}

test.describe('Ma trận quyền', () => {
  test('Chủ nhiệm tắt quyền quản lý thành viên của Thủ quỹ, Thủ quỹ mất tab, rồi khôi phục mặc định', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-guitar/structure?tab=permissions')
    await expect(page.getByRole('tab', { name: 'Phân quyền', selected: true })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Quản lý thành viên cho Chủ nhiệm' })).toBeDisabled()
    await snap(page, testInfo, 'permissionMatrix', { fullPage: false })

    await toggleTreasurerMembers(page)
    await expect(page.getByText('1 thay đổi chưa lưu', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click()
    const confirm = page.getByRole('dialog', { name: 'Lưu thay đổi quyền' })
    await expect(confirm.getByText('Thủ quỹ: tắt Quản lý thành viên')).toBeVisible()
    await confirm.getByRole('button', { name: 'Lưu thay đổi' }).click()
    await settleToast(page, 'Đã lưu 1 thay đổi quyền.')
    await expect(page.getByText('Thay đổi gần đây')).toBeVisible()

    await switchUser(page, 'Nguyễn Minh Anh', 'mai.vo@demo.test')
    await openNavLink(page, 'Thành viên')
    await expect(page.getByRole('heading', { name: 'Thành viên', level: 1 })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Yêu cầu gia nhập/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Mời thành viên' })).toHaveCount(0)

    await switchUser(page, 'Võ Ngọc Mai', 'anh.nguyen@demo.test')
    await openNavLink(page, 'Cơ cấu')
    await page.getByRole('tab', { name: 'Phân quyền' }).click()
    await page.getByRole('button', { name: 'Khôi phục mặc định' }).click()
    await page.getByRole('dialog', { name: 'Khôi phục mặc định' }).getByRole('button', { name: 'Khôi phục' }).click()
    await settleToast(page, 'Đã khôi phục ma trận về mặc định.')
    await expect(page.getByRole('button', { name: 'Khôi phục mặc định' })).toBeDisabled()
    await snap(page, testInfo, 'permissionMatrixReset', { fullPage: false })
  })
})
