import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, loginAs, openNavLink, snap } from './helpers.ts'

test.describe('Tra cứu nhiệm kỳ đã qua', () => {
  test('thành viên xem cơ cấu, chức vụ, sự kiện và sổ quỹ của nhiệm kỳ cũ', async ({ page }, testInfo) => {
    await loginAs(page, 'ha.le@demo.test')
    await page.goto('/clubs/c-guitar')
    await openNavLink(page, 'Nhiệm kỳ')
    await page.getByRole('region', { name: 'Nhiệm kỳ đã qua' }).getByRole('link', { name: 'Xem Nhiệm kỳ 2025–2026' }).click()
    await expect(page.getByRole('heading', { name: 'Nhiệm kỳ 2025–2026' })).toBeVisible()

    // Cơ cấu theo tên ban lúc nhiệm kỳ đóng, có người đã rời và chức bị thu hồi sớm.
    const board = page.getByRole('list', { name: 'Ban chủ nhiệm trong nhiệm kỳ' })
    await expect(board.getByRole('listitem')).toHaveCount(3)
    await expect(board).toContainText('Nguyễn Minh Anh')
    const media = page.getByRole('list', { name: 'Trưởng, phó ban Truyền thông và Sự kiện' })
    await expect(media).toContainText('Đặng Khánh Linh')
    await expect(media).toContainText('đã thu hồi')
    await expect(page.getByRole('region', { name: 'Quỹ chung trong nhiệm kỳ' }).getByText('Số dư cuối kỳ')).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'termArchiveStructure')

    await page.getByRole('tab', { name: 'Chức vụ' }).click()
    await expect(page.getByRole('combobox', { name: 'Nhiệm kỳ' })).toHaveCount(0)
    await expect(page.getByText('Tên ban theo lúc nhiệm kỳ đóng', { exact: false })).toBeVisible()
    await expect(page.getByText('Hồ Tấn Đạt').first()).toBeVisible()

    await page.getByRole('tab', { name: 'Sự kiện' }).click()
    await expect(page.getByText('Không có sự kiện nào bắt đầu trong nhiệm kỳ')).toBeVisible()

    await page.getByRole('tab', { name: 'Sổ quỹ' }).click()
    // Dữ liệu mẫu chỉ có giao dịch từ 60 ngày trước, sau khi nhiệm kỳ cũ đóng; số liệu kỳ cũ được kiểm ở test đơn vị.
    await expect(page.getByText('Không có giao dịch nào trong nhiệm kỳ')).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'termArchiveLedger')
  })

  test('nhiệm kỳ đang chạy cũng tra được, có sự kiện và sổ quỹ', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-guitar/terms/t-guitar-2026?tab=events')
    await expect(page.getByRole('heading', { name: 'Nhiệm kỳ 2026–2027' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Sự kiện trong nhiệm kỳ' }).getByRole('listitem').first()).toBeVisible()
    await page.getByRole('tab', { name: 'Sổ quỹ' }).click()
    const ledger = page.getByRole('list', { name: 'Sổ Quỹ chung trong nhiệm kỳ' })
    await ledger.getByRole('button').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'termArchiveCurrentLedger')
  })
})
