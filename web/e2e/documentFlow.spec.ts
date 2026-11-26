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
    await expect(detail.getByRole('definition').filter({ hasText: 'Đặng Khánh Linh' })).toBeVisible()
  })

  test('trưởng ban tải bản mới kèm ghi chú, tải lại bản cũ; thành viên ban thấy lịch sử (FR-DOC-03)', async ({ page }, testInfo) => {
    await loginAs(page, 'linh.dang@demo.test')
    await page.goto('/clubs/c-guitar')
    await openNavLink(page, 'Tài liệu')
    await page.getByRole('button', { name: 'Kế hoạch truyền thông Đêm nhạc Mùa đông', exact: true }).filter({ visible: true }).click()
    const detail = page.getByRole('dialog', { name: 'Kế hoạch truyền thông Đêm nhạc Mùa đông' })
    await expect(detail.getByRole('heading', { name: 'Phiên bản (1)' })).toBeVisible()
    await detail.getByRole('button', { name: 'Tải phiên bản mới' }).click()

    const dialog = page.getByRole('dialog', { name: 'Tải bản 2' })
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'ke-hoach-truyen-thong-v2.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('ban 2') })
    await dialog.getByRole('textbox', { name: 'Ghi chú thay đổi' }).fill('Thêm lịch đăng bài tuần cuối.')
    await snap(page, testInfo, 'documentVersionUpload', { fullPage: false })
    await dialog.getByRole('button', { name: 'Tải lên' }).click()
    await settleToast(page, 'Đã tải lên bản 2 của “Kế hoạch truyền thông Đêm nhạc Mùa đông”.')

    const versions = detail.getByRole('list', { name: 'Các phiên bản' })
    await expect(versions.getByRole('listitem')).toHaveCount(2)
    await expect(versions.getByRole('listitem').first()).toContainText('Hiện hành')
    await expect(versions.getByRole('listitem').first()).toContainText('Thêm lịch đăng bài tuần cuối.')
    const download = page.waitForEvent('download')
    await detail.getByRole('button', { name: 'Tải xuống bản 1 của Kế hoạch truyền thông Đêm nhạc Mùa đông' }).click()
    expect((await download).suggestedFilename()).toBe('ke-hoach-truyen-thong.docx')
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'documentVersions', { fullPage: false })

    await page.keyboard.press('Escape')
    await switchUser(page, 'Đặng Khánh Linh', 'ha.le@demo.test')
    await openNavLink(page, 'Tài liệu')
    await page.getByRole('button', { name: 'Kế hoạch truyền thông Đêm nhạc Mùa đông', exact: true }).filter({ visible: true }).click()
    const haDetail = page.getByRole('dialog', { name: 'Kế hoạch truyền thông Đêm nhạc Mùa đông' })
    await expect(haDetail.getByRole('heading', { name: 'Phiên bản (2)' })).toBeVisible()
    await expect(haDetail.getByRole('button', { name: 'Tải phiên bản mới' })).toHaveCount(0)
  })

  test('trưởng ban ẩn tài liệu của ban, thành viên ban không còn thấy, chủ nhiệm khôi phục (FR-DOC-04)', async ({ page }, testInfo) => {
    const title = 'Kế hoạch truyền thông Đêm nhạc Mùa đông'
    await loginAs(page, 'linh.dang@demo.test')
    await page.goto('/clubs/c-guitar')
    await openNavLink(page, 'Tài liệu')
    await page.getByRole('button', { name: title, exact: true }).filter({ visible: true }).click()
    await page.getByRole('dialog', { name: title }).getByRole('button', { name: 'Ẩn tài liệu' }).click()
    const reason = page.getByRole('dialog', { name: 'Ẩn tài liệu' })
    await reason.getByRole('textbox', { name: 'Lý do ẩn' }).fill('Đã thay bằng kế hoạch truyền thông mới.')
    await reason.getByRole('button', { name: 'Ẩn tài liệu' }).click()
    await settleToast(page, `Đã ẩn “${title}”. Ban chủ nhiệm khôi phục được khi cần.`)
    await expect(page.getByRole('button', { name: title, exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Tài liệu đã ẩn' })).toHaveCount(0)

    await switchUser(page, 'Đặng Khánh Linh', 'ha.le@demo.test')
    await openNavLink(page, 'Tài liệu')
    await expect(page.getByText('Nội quy CLB Guitar 2026').filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: title, exact: true })).toHaveCount(0)

    await switchUser(page, 'Lê Thu Hà', 'anh.nguyen@demo.test')
    await openNavLink(page, 'Tài liệu')
    await page.getByRole('button', { name: 'Tài liệu đã ẩn' }).click()
    await expect(page.getByText('Đã ẩn bởi Đặng Khánh Linh', { exact: false }).filter({ visible: true }).first()).toContainText('Đã thay bằng kế hoạch truyền thông mới.')
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'documentsHidden')
    await page.getByRole('button', { name: `Khôi phục ${title}` }).filter({ visible: true }).click()
    await page.getByRole('dialog', { name: 'Khôi phục tài liệu' }).getByRole('button', { name: 'Khôi phục' }).click()
    await settleToast(page, `Đã khôi phục “${title}”.`)
    await expect(page.getByText('Không có tài liệu nào đang ẩn')).toBeVisible()
    await page.getByRole('button', { name: 'Tài liệu đã ẩn' }).click()
    await expect(page.getByRole('button', { name: title, exact: true }).filter({ visible: true })).toBeVisible()
  })
})
