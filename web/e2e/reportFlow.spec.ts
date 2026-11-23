import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, loginAs, openNavLink, snap, switchUser } from './helpers.ts'

test.describe('Báo cáo CLB, báo cáo ban (FR-RPT-03, FR-RPT-04)', () => {
  test('ban chủ nhiệm xem báo cáo CLB theo kỳ và báo cáo từng ban', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-guitar')
    await openNavLink(page, 'Báo cáo')
    await expect(page.getByRole('heading', { name: 'Báo cáo', level: 1 })).toBeVisible()
    await page.getByRole('combobox', { name: 'Loại kỳ' }).selectOption('SEMESTER')
    await expect(page.getByRole('region', { name: 'Thành viên' }).getByText('Chính thức')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Chuyên cần' }).getByText('Tỷ lệ chuyên cần')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Thu chi' }).getByText('Quỹ chung hiện tại')).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'clubReport')

    await page.getByRole('tab', { name: 'Báo cáo ban' }).click()
    await page.getByRole('combobox', { name: 'Ban' }).selectOption({ label: 'Truyền thông' })
    const department = page.getByRole('region', { name: 'Ban Truyền thông' })
    await expect(department.getByText('Đặng Khánh Linh').filter({ visible: true })).toBeVisible()
    await expect(department.getByText('Trưởng ban').filter({ visible: true }).first()).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'departmentReport')
  })

  test('trưởng ban chỉ thấy báo cáo ban mình, thành viên thường không có mục Báo cáo', async ({ page }) => {
    await loginAs(page, 'linh.dang@demo.test')
    await page.goto('/clubs/c-guitar')
    await openNavLink(page, 'Báo cáo')
    await expect(page.getByRole('tab', { name: 'Báo cáo CLB' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Ban Truyền thông' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Ban' })).toHaveCount(0)
    await expectNoHorizontalScroll(page)

    await switchUser(page, 'Đặng Khánh Linh', 'ha.le@demo.test')
    await page.goto('/clubs/c-guitar')
    if ((page.viewportSize()?.width ?? 1440) < 1024) await page.getByRole('button', { name: 'Mở menu' }).click()
    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' })
    await expect(nav.getByRole('link', { name: 'Tài chính', exact: true }).filter({ visible: true }).first()).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Báo cáo', exact: true })).toHaveCount(0)
  })

  test('xuất báo cáo CLB ra Excel, PDF và xuất nhật ký thao tác (FR-RPT-07)', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-guitar/reports')
    await expect(page.getByRole('region', { name: 'Thành viên' })).toBeVisible()
    const exportAs = async (button: string, format: string) => {
      const download = page.waitForEvent('download')
      await page.getByRole('button', { name: button }).click()
      await page.getByRole('menuitem', { name: format }).click()
      return (await download).suggestedFilename()
    }
    expect(await exportAs('Xuất báo cáo', 'Excel (.xlsx)')).toMatch(/^bao-cao-clb-.*\.xlsx$/)
    await snap(page, testInfo, 'reportExport', { fullPage: false })
    expect(await exportAs('Xuất báo cáo', 'PDF')).toMatch(/^bao-cao-clb-.*\.pdf$/)

    await page.getByRole('tab', { name: 'Nhật ký' }).click()
    expect(await exportAs('Xuất nhật ký', 'Excel (.xlsx)')).toMatch(/^nhat-ky-.*\.xlsx$/)
  })

  test('thành viên xuất báo cáo cá nhân ra PDF (FR-RPT-07)', async ({ page }) => {
    await loginAs(page, 'ha.le@demo.test')
    await page.goto('/me/activity')
    await expect(page.getByRole('heading', { name: 'Hoạt động của tôi', level: 1 })).toBeVisible()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Xuất báo cáo' }).click()
    await page.getByRole('menuitem', { name: 'PDF' }).click()
    expect((await download).suggestedFilename()).toMatch(/^bao-cao-ca-nhan-.*\.pdf$/)
  })
})
