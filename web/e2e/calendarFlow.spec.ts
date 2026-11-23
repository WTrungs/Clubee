import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, loginAs, openNavLink, snap } from './helpers.ts'

const PLAN = 'Lên kế hoạch truyền thông Đêm nhạc Mùa đông'

test.describe('Lịch của tôi (FR-ATT-09)', () => {
  test('gộp buổi và sự kiện, lọc theo CLB, chuyển tháng và mở được trang chi tiết', async ({ page }, testInfo) => {
    await loginAs(page, 'ha.le@demo.test')
    await openNavLink(page, 'Lịch của tôi')
    await expect(page.getByRole('heading', { name: 'Lịch của tôi', level: 1 })).toBeVisible()
    const wide = (page.viewportSize()?.width ?? 1440) >= 768

    const plan = page.getByRole('link', { name: new RegExp(PLAN) }).filter({ visible: true }).first()
    await expect(plan).toBeVisible()
    if (!wide) await expect(page.getByText('Trong phạm vi').first()).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'calendar')

    await page.getByRole('combobox', { name: 'Lọc theo CLB' }).selectOption('c-english')
    await expect(page.getByRole('link', { name: new RegExp(PLAN) }).filter({ visible: true })).toHaveCount(0)
    await page.getByRole('combobox', { name: 'Lọc theo CLB' }).selectOption('')

    const month = (await page.getByRole('heading', { level: 2 }).first().textContent()) ?? ''
    await page.getByRole('button', { name: 'Tháng sau' }).click()
    await expect(page.getByRole('heading', { level: 2 }).first()).not.toHaveText(month)
    // Nút "Tháng này" hiện thêm khi ở tháng khác: hàng điều hướng vẫn không tràn ngang.
    await expectNoHorizontalScroll(page)
    await page.getByRole('button', { name: 'Tháng này' }).click()
    await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText(month)

    await page.getByRole('link', { name: new RegExp(PLAN) }).filter({ visible: true }).first().click()
    await expect(page.getByRole('heading', { name: PLAN, level: 1 })).toBeVisible()
  })
})
