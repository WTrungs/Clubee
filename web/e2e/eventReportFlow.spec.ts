import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, loginAs, snap, switchUser } from './helpers.ts'

test.describe('Báo cáo sự kiện (FR-RPT-05, FR-RPT-03)', () => {
  test('Trưởng BTC xem đủ báo cáo, nhân sự BTC không thấy phần theo người', async ({ page }, testInfo) => {
    await loginAs(page, 'bao.tran@demo.test')
    await page.goto('/clubs/c-guitar/events/e-winter')
    const tabs = page.getByRole('tablist', { name: 'Nội dung sự kiện' })
    await tabs.getByRole('tab', { name: 'Báo cáo' }).click()
    await expect(page).toHaveURL(/tab=report/)

    const registrations = page.getByRole('region', { name: 'Đăng ký' })
    await expect(registrations.getByText('Nhận chỗ')).toBeVisible()
    await expect(registrations.getByText('12', { exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Tiến độ chung' })).toBeVisible()
    const staff = page.getByRole('region', { name: 'Theo người' })
    await expect(staff.getByText('Trưởng BTC', { exact: true }).filter({ visible: true })).toBeVisible()
    await expect(staff.getByText('Bùi Đức Long').filter({ visible: true })).toBeVisible()
    const fund = page.getByRole('region', { name: 'Quỹ sự kiện' })
    await expect(fund.getByText('Khoản chờ ghi sổ')).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'eventReportLead')

    await switchUser(page, 'Trần Quốc Bảo', 'long.bui@demo.test')
    await page.goto('/clubs/c-guitar/events/e-winter?tab=report')
    await expect(page.getByRole('region', { name: 'Công việc' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Theo người' })).toHaveCount(0)
    await expectNoHorizontalScroll(page)
  })

  test('sự kiện đã diễn ra có điểm danh theo ngày', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-guitar/events/e-exchange?tab=report')
    const attendance = page.getByRole('region', { name: 'Điểm danh' })
    await expect(attendance.getByText('Chưa chốt').filter({ visible: true })).toBeVisible()
    await expect(attendance.getByText('100%').filter({ visible: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Theo người' }).getByText('Trưởng BTC', { exact: true }).filter({ visible: true })).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'eventReportEnded')
  })
})
