import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, loginAs, snap } from './helpers.ts'

test.describe('Báo cáo thu chi', () => {
  test('chủ nhiệm xem báo cáo tháng, lọc theo hạng mục, đổi sang học kỳ và mở danh sách chưa nộp', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-guitar/finance')
    await page.getByRole('tab', { name: 'Báo cáo' }).click()
    await expect(page.getByText('Tổng thu')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Kỳ', exact: true })).toHaveValue(/^\d{4}-\d{2}$/)
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'financeReport')

    const categories = page.getByRole('region', { name: 'Theo hạng mục' })
    await categories.getByRole('button', { name: /^Lọc theo Tài trợ/ }).click()
    await page.waitForURL((url) => url.searchParams.get('category') === 'SPONSORSHIP')
    await expect(page.getByRole('status').filter({ hasText: 'Đang lọc theo hạng mục Tài trợ' })).toBeVisible()
    await expect(categories.getByRole('button')).toHaveCount(0)
    await snap(page, testInfo, 'financeReportFiltered', { fullPage: false })
    await page.getByRole('button', { name: 'Bỏ lọc' }).click()
    await page.waitForURL((url) => !url.searchParams.has('category'))

    await page.getByRole('combobox', { name: 'Loại kỳ' }).selectOption({ label: 'Học kỳ' })
    await page.waitForURL((url) => url.searchParams.get('period') === 'SEMESTER')
    await expect(page.getByRole('combobox', { name: 'Kỳ', exact: true })).toHaveValue(/^\d{4}-(S1|S2|SUMMER)$/)
    await expect(page.getByText(/^Học kỳ \d.*Chỉ tính khoản Đã ghi sổ/)).toBeVisible()
    await snap(page, testInfo, 'financeReportSemester', { fullPage: false })

    const unpaid = page.getByRole('region', { name: /Chưa nộp quỹ/ })
    await expect(unpaid.getByRole('link')).toHaveCount(5)
    await expect(unpaid.getByText(/1–5/)).toBeVisible()
    await unpaid.getByRole('link').first().click()
    await page.waitForURL((url) => url.searchParams.get('view') === 'dues' && url.searchParams.get('dues') === 'dues-guitar-hk1')
    await expect(page.getByRole('region', { name: 'Đợt Quỹ học kỳ 1' })).toBeVisible()
  })
})
