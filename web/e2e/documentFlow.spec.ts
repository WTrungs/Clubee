import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, loginAs, openNavLink, settleToast, snap, switchUser } from './helpers.ts'

const LONG_NAME = 'Bien_ban_hop_ban_chu_nhiem_thang_11_2026_ban_cuoi_cung_da_duyet.pdf'

test.describe('Tài liệu (FR-DOC-01, 02)', () => {
  test('trưởng ban tải tài liệu của ban lên rồi tải xuống; người ngoài ban không thấy', async ({ page }, testInfo) => {
    const title = `Biên bản họp ban ${testInfo.project.name}`
    await loginAs(page, 'linh.dang@demo.test')
    await page.goto('/clubs/c-guitar')
    await openNavLink(page, 'Tài liệu')
    await expect(page.getByRole('heading', { name: 'Tài liệu', level: 1 })).toBeVisible()
    await expect(page.getByText('Nội quy CLB Guitar 2026').filter({ visible: true }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Tải lên' }).click()
    const sheet = page.getByRole('dialog', { name: 'Tải tài liệu lên' })
    // Tên tệp dài không có dấu cách: trang vẫn không cuộn ngang ở 360 px.
    await sheet.locator('input[type="file"]').setInputFiles({ name: LONG_NAME, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 biên bản') })
    await expect(sheet.getByText(LONG_NAME)).toBeVisible()
    await sheet.getByRole('textbox', { name: 'Tên tài liệu' }).fill(title)
    await expect(sheet.getByRole('combobox', { name: 'Nơi sở hữu' })).toHaveValue('DEPARTMENT:d-media')
    await expect(sheet.getByRole('combobox', { name: 'Nhiệm kỳ' })).toHaveValue('t-guitar-2026')
    await expect(sheet.getByRole('option', { name: 'Không gắn nhiệm kỳ' })).toHaveCount(0)
    await sheet.getByRole('textbox', { name: 'Nhãn' }).fill('biên bản, họp ban')
    await sheet.getByRole('radio', { name: /Nơi sở hữu/ }).check()
    await snap(page, testInfo, 'documentUpload', { fullPage: false })
    await sheet.getByRole('button', { name: 'Tải lên' }).click()
    await settleToast(page, `Đã tải lên “${title}”.`)

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: `Tải xuống ${title}` }).filter({ visible: true }).click()
    expect((await download).suggestedFilename()).toBe(LONG_NAME)
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'documents')

    await switchUser(page, 'Đặng Khánh Linh', 'thao.mai@demo.test')
    await openNavLink(page, 'Tài liệu')
    await expect(page.getByText('Nội quy CLB Guitar 2026').filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByText(title)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Tải lên' })).toHaveCount(0)

    await switchUser(page, 'Mai Phương Thảo', 'ha.le@demo.test')
    await openNavLink(page, 'Tài liệu')
    await page.getByRole('button', { name: title, exact: true }).filter({ visible: true }).click()
    const detail = page.getByRole('dialog', { name: title })
    await expect(detail.getByText('Ban Truyền thông')).toBeVisible()
    await expect(detail.getByText('Đặng Khánh Linh', { exact: false })).toBeVisible()
  })
})
