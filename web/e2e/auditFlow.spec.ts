import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, loginAs, openNavLink, snap } from './helpers.ts'

test.describe('Nhật ký thao tác (FR-RPT-06)', () => {
  test('ban chủ nhiệm lọc nhật ký theo loại đối tượng, người làm, ngày và mở xem trước → sau', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-guitar')
    await openNavLink(page, 'Báo cáo')
    await page.getByRole('tab', { name: 'Nhật ký' }).click()
    await expect(page).toHaveURL(/tab=audit/)
    await expect(page.getByRole('combobox', { name: 'Loại kỳ' })).toHaveCount(0)
    const list = page.getByRole('list', { name: 'Nhật ký thao tác' })
    await expect(list.getByRole('listitem').first()).toBeVisible()

    await page.getByRole('combobox', { name: 'Loại đối tượng' }).selectOption({ label: 'Giao dịch quỹ' })
    await expect(page).toHaveURL(/logType=TRANSACTION/)
    const first = list.getByRole('listitem').first()
    await expect(first.getByText('Giao dịch quỹ', { exact: true })).toBeVisible()
    await first.getByRole('button').click()
    await expect(first.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    await expect(first.getByText('Trạng thái', { exact: true })).toBeVisible()
    await expect(first.getByText(/^Lý do:/)).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'auditLog')

    await page.getByRole('combobox', { name: 'Người làm' }).selectOption({ label: 'Võ Ngọc Mai' })
    await expect(list.getByRole('listitem').first()).toContainText('Võ Ngọc Mai')

    await page.getByRole('textbox', { name: 'Từ ngày' }).fill('31/02/2026')
    await page.getByRole('button', { name: 'Lọc theo ngày' }).click()
    await expect(page.getByText('Nhập ngày dạng dd/mm/yyyy.')).toBeVisible()
    await page.getByRole('button', { name: 'Bỏ lọc' }).click()
    await expect(page).not.toHaveURL(/logType=/)
    await expectNoHorizontalScroll(page)
  })

  test('trưởng ban không có tab Nhật ký', async ({ page }) => {
    await loginAs(page, 'linh.dang@demo.test')
    await page.goto('/clubs/c-guitar')
    await openNavLink(page, 'Báo cáo')
    await expect(page.getByRole('tab', { name: 'Báo cáo ban' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Nhật ký' })).toHaveCount(0)
  })
})
