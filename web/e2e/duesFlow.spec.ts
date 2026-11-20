import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, loginAs, openNotification, settleToast, snap, switchUser } from './helpers.ts'

/** Ngày dd/mm/yyyy cách hôm nay `days` ngày theo giờ Việt Nam. */
function vnDateText(days: number): string {
  const date = new Date(Date.now() + 7 * 3600_000 + days * 86_400_000)
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`
}

test.describe('Đóng quỹ', () => {
  test('thủ quỹ mở đợt có một người miễn, một người giảm; thành viên được báo; xác nhận người nộp đủ và người nộp một phần', async ({ page }, testInfo) => {
    test.slow()
    await loginAs(page, 'mai.vo@demo.test')
    await page.goto('/clubs/c-guitar/finance?view=dues')
    await expect(page.getByRole('button', { name: /Đợt Quỹ học kỳ 1/ })).toBeVisible()
    await snap(page, testInfo, 'duesCampaigns')

    await page.getByRole('button', { name: 'Mở đợt đóng quỹ' }).click()
    const sheet = page.getByRole('dialog', { name: 'Mở đợt đóng quỹ' })
    await sheet.getByRole('textbox', { name: /Tên kỳ/ }).fill('Quỹ học kỳ 2')
    await sheet.getByRole('textbox', { name: /Mức đóng/ }).fill('120000')
    await sheet.getByRole('textbox', { name: /Hạn nộp/ }).fill(vnDateText(14))

    const search = sheet.getByRole('searchbox', { name: 'Tìm thành viên để miễn giảm' })
    const chosen = sheet.getByRole('list', { name: 'Người được miễn giảm' })
    await search.fill('Trâm')
    await sheet.getByRole('button', { name: 'Miễn giảm cho Ngô Bảo Trâm' }).click()
    const tram = chosen.getByRole('listitem').filter({ hasText: 'Ngô Bảo Trâm' })
    await tram.getByRole('textbox', { name: /Lý do/ }).fill('Hoàn cảnh khó khăn, ban chủ nhiệm đã thống nhất.')
    await search.fill('Thảo')
    await sheet.getByRole('button', { name: 'Miễn giảm cho Mai Phương Thảo' }).click()
    const thao = chosen.getByRole('listitem').filter({ hasText: 'Mai Phương Thảo' })
    await thao.getByRole('combobox', { name: /Hình thức/ }).selectOption({ label: 'Giảm còn' })
    await thao.getByRole('textbox', { name: /Mức sau giảm/ }).fill('60000')
    await thao.getByRole('textbox', { name: /Lý do/ }).fill('Vào CLB giữa kỳ.')
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'openDues', { fullPage: false })
    await sheet.getByRole('button', { name: 'Mở đợt' }).click()
    await settleToast(page, 'Đã mở đợt Quỹ học kỳ 2 cho 16 thành viên. Người phải đóng đã được báo.')

    const summary = page.getByRole('region', { name: 'Đợt Quỹ học kỳ 2' })
    await expect(summary.getByText('1/16 người xong · 0 đ / 1.740.000 đ')).toBeVisible()
    await page.getByRole('group', { name: 'Lọc theo tình trạng' }).getByRole('button', { name: 'Miễn' }).click()
    await expect(page.getByText('Ngô Bảo Trâm').filter({ visible: true })).toBeVisible()
    await page.getByRole('group', { name: 'Lọc theo tình trạng' }).getByRole('button', { name: 'Tất cả' }).click()
    await expect(page.getByText('60.000 đ (giảm từ 120.000 đ)').filter({ visible: true })).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'duesCampaign')

    // FR-FIN-10: một người nộp đủ, một người nộp một phần; mỗi lần là một khoản thu trong sổ Quỹ chung.
    const confirmPaid = async (name: string, amount?: string) => {
      await page.getByRole('button', { name: `Xác nhận đã nộp: ${name}` }).filter({ visible: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Xác nhận đã nộp' })
      if (amount) await dialog.getByRole('textbox', { name: /Số tiền nộp/ }).fill(amount)
      if (amount) await snap(page, testInfo, 'confirmPayment', { fullPage: false })
      await dialog.getByRole('button', { name: 'Xác nhận' }).click()
      await expect(dialog).toHaveCount(0)
    }
    await confirmPaid('Bùi Đức Long')
    await settleToast(page, 'Đã xác nhận Bùi Đức Long nộp 120.000 đ. Sổ Quỹ chung có khoản thu mới.')
    await confirmPaid('Đặng Khánh Linh', '50000')
    await settleToast(page, 'Đã xác nhận Đặng Khánh Linh nộp 50.000 đ. Còn thiếu 70.000 đ. Sổ Quỹ chung có khoản thu mới.')
    await expect(summary.getByText('2/16 người xong · 170.000 đ / 1.740.000 đ')).toBeVisible()
    await page.getByRole('group', { name: 'Lọc theo tình trạng' }).getByRole('button', { name: 'Nộp một phần' }).click()
    await expect(page.getByRole('button', { name: 'Xác nhận đã nộp: Đặng Khánh Linh' }).filter({ visible: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Xác nhận đã nộp: Bùi Đức Long' })).toHaveCount(0)
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'duesPayments')
    await page.getByRole('tab', { name: 'Quỹ chung' }).click()
    await expect(page.getByRole('button', { name: /Đóng quỹ Quỹ học kỳ 2: Bùi Đức Long/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Đóng quỹ Quỹ học kỳ 2: Đặng Khánh Linh/ })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Số dư Quỹ chung' }).getByText('5.640.000')).toBeVisible()

    // Không tải lại trang: mock chạy trong trình duyệt nên tải lại là mất đợt vừa mở.
    await switchUser(page, 'Võ Ngọc Mai', 'thao.mai@demo.test')
    await openNotification(page, /Đóng quỹ: Quỹ học kỳ 2/)
    // Thành viên không có tab Đóng quỹ nên về sổ Quỹ chung.
    await page.waitForURL((url) => url.pathname === '/clubs/c-guitar/finance')
    await expect(page.getByRole('region', { name: 'Số dư Quỹ chung' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Đóng quỹ' })).toHaveCount(0)
  })
})
